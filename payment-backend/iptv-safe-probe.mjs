// HTTP and HTTPS, one-hop bounded probe. Does NOT establish playback health or distribution rights.
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';

const blocked = new net.BlockList();
for (const [base,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(base,bits,'ipv4');
export function publicIPv4(ip) { return net.isIP(ip)===4 && !blocked.check(ip,'ipv4'); }
export function validateTarget(raw) {
  let u;try {u=new URL(raw);}catch{return null;}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443','8080','8443'].includes(u.port))||!u.hostname||(u.hostname.startsWith('[')&&u.hostname.endsWith(']'))||net.isIP(u.hostname)||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')) return null;
  return u;
}
export async function resolvePinned(host, resolver=dns.lookup) {
  const found=await resolver(host,{all:true,verbatim:true});
  if(!Array.isArray(found)||!found.length) throw Error('DNS_EMPTY');
  const ipv4=found.filter(x=>x.family===4);
  if(!ipv4.length) throw Error('DNS_NO_IPV4');
  if(ipv4.some(x=>!publicIPv4(x.address))) throw Error('DNS_POLICY');
  return ipv4[0].address;
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
export async function fetchBounded(raw,{resolver=dns.lookup,request,maxBytes=65536}={}) {
  const u=validateTarget(raw);
  if(!u) return {outcome:'inconclusive',reason:'URL_POLICY'};
  let ip;try {ip=await resolvePinned(u.hostname,resolver);}catch(e){return {outcome:'inconclusive',reason:['DNS_EMPTY','DNS_NO_IPV4','DNS_POLICY'].includes(e?.message)?e.message:'DNS_RESOLUTION_ERROR'};}
  const started=Date.now();
  return new Promise(resolve=>{
    let settled=false;
    const finish=x=>{if(settled)return;settled=true;resolve({...x,latency:Date.now()-started});};
    const transport=request || (u.protocol==='https:' ? https.request : http.request);
    const req=transport(u,{method:'GET',agent:false,timeout:7000,maxHeaderSize:8192,headers:{range:'bytes=0-4095','user-agent':'TikVTV-StreamVerifier/2.0','accept-encoding':'identity'},rejectUnauthorized:true,servername:u.hostname,lookup:(_host,_opts,cb)=>cb(null,ip,4)},async res=>{
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
    req.on('error',e=>{
      const code=String(e?.code||'');
      const reason=e.message==='TIMEOUT'?'TIMEOUT':({ENOTFOUND:'DNS_NOT_FOUND',EAI_AGAIN:'DNS_TEMPORARY',ECONNREFUSED:'CONNECTION_REFUSED',ECONNRESET:'CONNECTION_RESET',ETIMEDOUT:'CONNECT_TIMEOUT',EHOSTUNREACH:'HOST_UNREACHABLE',ENETUNREACH:'NETWORK_UNREACHABLE',CERT_HAS_EXPIRED:'TLS_CERT_EXPIRED',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS_CERT_UNTRUSTED',ERR_TLS_CERT_ALTNAME_INVALID:'TLS_HOSTNAME_MISMATCH',EPROTO:'TLS_PROTOCOL_ERROR',ERR_SSL_WRONG_VERSION_NUMBER:'TLS_PROTOCOL_ERROR',ERR_STREAM_PREMATURE_CLOSE:'STREAM_PREMATURE_CLOSE'}[code]||'NETWORK_ERROR');
      finish({outcome:'inconclusive',reason});
    });
    req.end();
  });
}

// Compatibility API: callers needing only metadata never receive a body buffer.
export async function probe(raw,options={}) {
  const {body,...result}=await fetchBounded(raw,{...options,maxBytes:4096});
  return result;
}
