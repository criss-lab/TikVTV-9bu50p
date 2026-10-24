// HTTPS-only, one-hop HTTP probe. Does NOT establish playback health or distribution rights.
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';

const blocked = new net.BlockList();
for (const [base,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(base,bits,'ipv4');
export function publicIPv4(ip) { return net.isIP(ip)===4 && !blocked.check(ip,'ipv4'); }
export function validateTarget(raw) {
  let u;try {u=new URL(raw);}catch{return null;}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname||(u.hostname.startsWith('[')&&u.hostname.endsWith(']'))||net.isIP(u.hostname)||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')) return null;
  return u;
}
export async function resolvePinned(host, resolver=dns.lookup) {
  const found=await resolver(host,{all:true,verbatim:true});
  if(!Array.isArray(found)||!found.length||found.some(x=>x.family!==4||!publicIPv4(x.address))) throw Error('DNS_POLICY');
  return found[0].address;
}
export async function boundedBody(stream, max=4096) {
  let bytes=0;const chunks=[];
  for await(const chunk of stream) {
    bytes+=chunk.length;
    if(bytes>max) {stream.destroy();throw Error('BODY_LIMIT');}
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function fetchBounded(raw,{resolver=dns.lookup,request=https.request,maxBytes=65536}={}) {
  const u=validateTarget(raw);
  if(!u) return {outcome:'inconclusive',reason:'URL_POLICY'};
  let ip;try {ip=await resolvePinned(u.hostname,resolver);}catch{return {outcome:'inconclusive',reason:'DNS_POLICY'};}
  const started=Date.now();
  return new Promise(resolve=>{
    let settled=false;
    const finish=x=>{if(settled)return;settled=true;resolve({...x,latency:Date.now()-started});};
    const req=request(u,{method:'GET',agent:false,timeout:7000,maxHeaderSize:8192,headers:{range:'bytes=0-4095','user-agent':'TikVTV-StreamVerifier/2.0','accept-encoding':'identity'},rejectUnauthorized:true,servername:u.hostname,lookup:(_host,_opts,cb)=>cb(null,ip,4)},async res=>{
      const status=res.statusCode||0,type=String(res.headers['content-type']||'').split(';')[0].toLowerCase();
      if(status>=300&&status<400){res.destroy();return finish({outcome:'inconclusive',reason:'REDIRECT_BLOCKED',status,type});}
      if(status===401||status===403){res.destroy();return finish({outcome:'inconclusive',reason:'AUTH_REQUIRED',status,type});}
      if(status<200||status>=300){res.destroy();return finish({outcome:'unhealthy',reason:'HTTP_FAILURE',status,type});}
      try {
        const body=await boundedBody(res,maxBytes);
        const format=/mpegurl/.test(type)||/\.m3u8$/i.test(u.pathname)?'hls':/dash\+xml/.test(type)||/\.mpd$/i.test(u.pathname)?'dash':type==='video/mp4'?'mp4':'unknown';
        finish({outcome:'inconclusive',reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',status,type,format,body});
      }catch{finish({outcome:'inconclusive',reason:'BODY_LIMIT',status,type});}
    });
    req.on('timeout',()=>req.destroy(Error('TIMEOUT')));
    req.on('error',e=>finish({outcome:'inconclusive',reason:e.message==='TIMEOUT'?'TIMEOUT':'NETWORK_ERROR'}));
    req.end();
  });
}

// Compatibility API: callers needing only metadata never receive a body buffer.
export async function probe(raw,options={}) {
  const {body,...result}=await fetchBounded(raw,{...options,maxBytes:4096});
  return result;
}
