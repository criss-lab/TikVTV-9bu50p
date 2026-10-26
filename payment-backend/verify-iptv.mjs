// Bounded, opt-in verification worker. Run with IPTV_DATABASE_URL and IPTV_CA_CERT.
// Does not approve rights or sources. HTTP/HTTPS, no redirects, public DNS/IP only.
import pg from 'pg';
import { verifyPlayback } from './iptv-playback.mjs';
const { Pool } = pg;
const uri = new URL(process.env.IPTV_DATABASE_URL || 'postgres://missing:missing@localhost/missing');
for (const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat']) uri.searchParams.delete(key);
const ca = (process.env.IPTV_CA_CERT || '').replace(/\\n/g,'\n').trim();
if (!process.env.IPTV_DATABASE_URL || !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(ca)) throw Error('Verified Infinity DB and CA required');
const pool = new Pool({connectionString:uri.toString(),ssl:{rejectUnauthorized:true,ca},max:1,connectionTimeoutMillis:4000,statement_timeout:8000,application_name:'tikvtv-stream-verifier'});
const limit = Math.min(250,Math.max(1,Number(process.env.IPTV_VERIFY_BATCH || 50) || 50));
let run;
try {
  const created=await pool.query("INSERT INTO iptv.verification_runs DEFAULT VALUES RETURNING id");run=created.rows[0].id;
  // Verify each URL once per run even when imported by multiple worldwide sources.
  // A shared URL's last verification time is the newest check across its copies.
  const rows=await pool.query(`SELECT DISTINCT ON (url_hash) id,stream_url,url_hash
    FROM iptv.streams s
    WHERE rights_status <> 'rejected'
      AND NOT EXISTS (
        SELECT 1 FROM iptv.streams peer WHERE peer.url_hash=s.url_hash
          AND peer.checked_at >= NOW()-INTERVAL '12 hours'
      )
    ORDER BY url_hash,checked_at ASC NULLS FIRST,id ASC LIMIT $1`,[limit]);
  let checked=0,healthy=0,unhealthy=0,inconclusive=0;
  for(const row of rows.rows) {
    const result=await verifyPlayback(row.stream_url);
    await pool.query("INSERT INTO iptv.stream_checks(stream_id,outcome,http_status,media_type,playback_format,latency_ms,reason_code,checker_version) VALUES($1,$2,$3,$4,$5,$6,$7,'manifest-sample-v2')",[row.id,result.outcome,result.status||null,result.type||null,result.format||'unknown',result.latency||null,result.reason]);
    // HTTP-only results cannot promote a stream to healthy.
    await pool.query("UPDATE iptv.streams SET checked_at=NOW(),health_status=CASE WHEN $2='healthy' THEN 'healthy' WHEN $2='unhealthy' THEN 'unhealthy' ELSE 'unknown' END WHERE url_hash=$1 AND rights_status <> 'rejected'",[row.url_hash,result.outcome]);
    checked++;if(result.outcome==='healthy')healthy++;else if(result.outcome==='unhealthy')unhealthy++;else inconclusive++;
  }
  await pool.query("UPDATE iptv.verification_runs SET status='completed',completed_at=NOW(),checked_count=$2,healthy_count=$3,unhealthy_count=$4,inconclusive_count=$5 WHERE id=$1",[run,checked,healthy,unhealthy,inconclusive]);
  console.log(JSON.stringify({run,checked,healthy,unhealthy,inconclusive}));
} catch(e) {
  if(run) await pool.query("UPDATE iptv.verification_runs SET status='failed',completed_at=NOW() WHERE id=$1",[run]).catch(()=>{});
  console.error('Verification run failed', {code:e?.code||'NON_SQL_ERROR'});process.exitCode=1;
} finally {await pool.end();}
