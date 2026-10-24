// Bounded, opt-in verification worker. Run with INFINITY_IPTV_DATABASE_URL and INFINITY_IPTV_CA_CERT.
// Does not approve rights or sources. HTTPS only, no redirects, public DNS/IP only.
import pg from 'pg';
import dns from 'node:dns/promises';
import net from 'node:net';
const { Pool } = pg;
const uri = new URL(process.env.INFINITY_IPTV_DATABASE_URL || 'postgres://missing:missing@localhost/missing');
for (const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat']) uri.searchParams.delete(key);
const ca = (process.env.INFINITY_IPTV_CA_CERT || '').replace(/\\n/g,'\n').trim();
if (!process.env.INFINITY_IPTV_DATABASE_URL || !ca.includes('-----BEGIN CERTIFICATE-----')) throw Error('Verified Infinity DB and CA required');
const pool = new Pool({connectionString:uri.toString(),ssl:{rejectUnauthorized:true,ca},max:1,connectionTimeoutMillis:4000,statement_timeout:8000,application_name:'tikvtv-stream-verifier'});
const limit = Math.min(50,Math.max(1,Number(process.env.IPTV_VERIFY_BATCH || 10) || 10));
const isPublic = ip => {
  if (net.isIP(ip) === 4) {
    const a=ip.split('.').map(Number);
    return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===192&&a[1]===0||a[0]===192&&a[1]===0&&a[2]===0||a[0]===198&&a[1]>=18&&a[1]<=19||a[0]===198&&a[1]===51&&a[2]===100||a[0]===203&&a[1]===0&&a[2]===113);
  }
  // Conservative: IPv6 and literal IP hosts are not supported by this worker.
  return false;
};
async function probe(raw) {
  let url;
  try { url=new URL(raw); } catch { return {outcome:'inconclusive',reason:'INVALID_URL'}; }
  if (url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||net.isIP(url.hostname)||url.hostname==='localhost') return {outcome:'inconclusive',reason:'URL_POLICY'};
  const addresses=await dns.lookup(url.hostname,{all:true,verbatim:true}).catch(()=>[]);
  if (!addresses.length||addresses.some(a=>!isPublic(a.address))) return {outcome:'inconclusive',reason:'DNS_POLICY'};
  // Node fetch resolves DNS again; run this worker only behind an outbound firewall
  // denying private/reserved ranges to close DNS-rebinding and proxy routes.
  const started=Date.now();
  try {
    const response=await fetch(url,{method:'GET',redirect:'manual',headers:{range:'bytes=0-4095','user-agent':'TikVTV-StreamVerifier/1.0'},signal:AbortSignal.timeout(7000)});
    const status=response.status, type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
    if (response.body) await response.body.cancel();
    if (status>=300&&status<400) return {outcome:'inconclusive',reason:'REDIRECT_BLOCKED',status,type,latency:Date.now()-started};
    if (status===401||status===403) return {outcome:'inconclusive',reason:'AUTH_REQUIRED',status,type,latency:Date.now()-started};
    if (!response.ok) return {outcome:'unhealthy',reason:'HTTP_FAILURE',status,type,latency:Date.now()-started};
    const format=/mpegurl|vnd.apple.mpegurl/.test(type)||/\.m3u8(?:$|\?)/i.test(url.pathname)?'hls':/dash\+xml/.test(type)||/\.mpd$/i.test(url.pathname)?'dash':/video\/mp4/.test(type)?'mp4':'unknown';
    // An HTTP success is NOT playback proof. Keep inconclusive until media decoding is verified.
    return {outcome:'inconclusive',reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',status,type,format,latency:Date.now()-started};
  } catch(e) {return {outcome:'inconclusive',reason:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR',latency:Date.now()-started};}
}
let run;
try {
  const created=await pool.query("INSERT INTO iptv.verification_runs DEFAULT VALUES RETURNING id");run=created.rows[0].id;
  const rows=await pool.query("SELECT id,stream_url FROM iptv.streams WHERE rights_status <> 'rejected' AND (checked_at IS NULL OR checked_at < NOW()-INTERVAL '12 hours') ORDER BY checked_at ASC NULLS FIRST,id ASC LIMIT $1",[limit]);
  let checked=0,healthy=0,unhealthy=0,inconclusive=0;
  for(const row of rows.rows) {
    const result=await probe(row.stream_url);
    await pool.query("INSERT INTO iptv.stream_checks(stream_id,outcome,http_status,media_type,playback_format,latency_ms,reason_code,checker_version) VALUES($1,$2,$3,$4,$5,$6,$7,'http-probe-v1')",[row.id,result.outcome,result.status||null,result.type||null,result.format||'unknown',result.latency||null,result.reason]);
    // HTTP-only results cannot promote a stream to healthy.
    await pool.query("UPDATE iptv.streams SET checked_at=NOW(),health_status=CASE WHEN $2='unhealthy' THEN 'unhealthy' ELSE health_status END WHERE id=$1",[row.id,result.outcome]);
    checked++;if(result.outcome==='healthy')healthy++;else if(result.outcome==='unhealthy')unhealthy++;else inconclusive++;
  }
  await pool.query("UPDATE iptv.verification_runs SET status='completed',completed_at=NOW(),checked_count=$2,healthy_count=$3,unhealthy_count=$4,inconclusive_count=$5 WHERE id=$1",[run,checked,healthy,unhealthy,inconclusive]);
  console.log(JSON.stringify({run,checked,healthy,unhealthy,inconclusive}));
} catch(e) {
  if(run) await pool.query("UPDATE iptv.verification_runs SET status='failed',completed_at=NOW() WHERE id=$1",[run]).catch(()=>{});
  console.error('Verification run failed', {code:e?.code||'NON_SQL_ERROR'});process.exitCode=1;
} finally {await pool.end();}
