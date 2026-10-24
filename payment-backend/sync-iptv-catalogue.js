// Run from payment-backend with IPTV_DATABASE_URL (Supabase direct/pooled Postgres URL).
// This imports discovery metadata only; it never proxies or publishes unreviewed streams.
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
const connectionString = process.env.IPTV_DATABASE_URL;
if (!connectionString) throw new Error('IPTV_DATABASE_URL is required');
const caPem = process.env.IPTV_DATABASE_CA_PEM;
if (!caPem) throw new Error('IPTV_DATABASE_CA_PEM secret is required to verify database TLS');
const dbUrl = new URL(connectionString);
// pg parses sslmode from the URI and can override an explicit CA object.
for (const key of ['sslmode','sslrootcert','sslcert','sslkey']) dbUrl.searchParams.delete(key);
const pool = new pg.Pool({connectionString:dbUrl.toString(),ssl:{ca:caPem.replace(/\\n/g, '\n'),rejectUnauthorized:true},max:2});
const maxBytes = 32*1024*1024;
const maxEntries = 250000;
function publicHttpUrl(value) {
  try {
    const u=new URL(value);
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password) return null;
    const h=u.hostname.toLowerCase();
    if (h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)||h==='::1') return null;
    return u.href;
  } catch {return null;}
}
async function run(source) {
 const id=source.id;
 const run=await pool.query('insert into iptv.sync_runs(source_id) values($1) returning id',[id]);
 const runId=run.rows[0].id;
 let discovered=0,accepted=0;
 try {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  let response;
  try {response=await fetch(source.playlist_url,{signal:controller.signal,redirect:'error'});} finally {clearTimeout(timeout);}
  if(!response.ok) throw new Error('Source HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>maxBytes) throw new Error('Source exceeds size limit');
  const text=bytes.toString('utf8');
  if(!text.trimStart().startsWith('#EXTM3U')) throw new Error('Not an M3U playlist');
  let pending=null;
  const rows=[],seen=new Set();
  async function flush(){
   if(!rows.length)return;
   const client=await pool.connect();
   try {
    await client.query('BEGIN');
    for(const row of rows) {
     await client.query(`insert into iptv.streams(source_id,source_channel_id,name,stream_url,url_hash,country,logo_url,category,last_seen_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,now())
      on conflict(source_id,url_hash) do update set last_seen_at=now(),name=excluded.name,logo_url=excluded.logo_url`,row);
    }
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   accepted+=rows.length;rows.length=0;
  }
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();
   if(line.startsWith('#EXTINF:')){
    const attr=k=>new RegExp(k+'="([^"]*)"').exec(line)?.[1]||null;
    pending={name:(line.split(',').slice(1).join(',').trim()||attr('tvg-name')||'Unknown').slice(0,240),channel:attr('tvg-id'),logo:attr('tvg-logo'),category:attr('group-title'),country:attr('tvg-country')};
   }else if(line && !line.startsWith('#')){
    discovered++;
    const url=publicHttpUrl(line);
    if(url && pending && !seen.has(url) && accepted+rows.length<maxEntries){
     seen.add(url);
     rows.push([id,pending.channel,pending.name,url,crypto.createHash('sha256').update(url).digest('hex'),pending.country,publicHttpUrl(pending.logo||''),pending.category]);
     if(rows.length>=250)await flush();
    }
    pending=null;
   }
  }
  await flush();
  await pool.query("update iptv.sources set last_checked_at=now(),last_success_at=now(),last_error=null where id=$1",[id]);
  await pool.query("update iptv.sync_runs set completed_at=now(),status='success',discovered_count=$2,accepted_count=$3 where id=$1",[runId,discovered,accepted]);
  console.log(JSON.stringify({source:id,discovered,accepted,publication:'review_required'}));
 }catch(e){
  await pool.query('update iptv.sources set last_checked_at=now(),last_error=$2 where id=$1',[id,String(e.message).slice(0,300)]);
  await pool.query("update iptv.sync_runs set completed_at=now(),status='failure',error=$2 where id=$1",[runId,String(e.message).slice(0,300)]);
  console.error(id+': '+e.message);
 }
}
try{
 const result=await pool.query("select id,playlist_url from iptv.sources where enabled=true and kind='m3u' order by id");
 for(const source of result.rows) await run(source);
}finally{await pool.end();}
