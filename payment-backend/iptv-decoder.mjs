// Decode only downloaded bytes: ffmpeg never receives an untrusted URL or network access.
import {spawn} from 'node:child_process';
export function decodeTransportSample(bytes,{spawnProcess=spawn,timeoutMs=5000}={}) {
  if(!Buffer.isBuffer(bytes)||bytes.length<188||bytes.length>2097152) return Promise.resolve({ok:false,reason:'SAMPLE_SIZE'});
  return new Promise(resolve=>{
    let child,done=false,stderr='';
    const finish=(result)=>{if(done)return;done=true;clearTimeout(timer);resolve(result);};
    try {
      child=spawnProcess('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','file,pipe','-f','mpegts','-i','pipe:0','-map','0:v:0','-frames:v','1','-f','null','-'],{stdio:['pipe','ignore','pipe']});
    }catch{return resolve({ok:false,reason:'DECODER_UNAVAILABLE'});}
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,reason:'DECODER_TIMEOUT'});},timeoutMs);
    child.on('error',()=>finish({ok:false,reason:'DECODER_UNAVAILABLE'}));
    child.stderr?.on('data',chunk=>{stderr+=String(chunk).slice(0,256);if(stderr.length>1024)stderr=stderr.slice(-1024);});
    child.on('close',code=>finish(code===0?{ok:true,reason:'VIDEO_FRAME_DECODED'}:{ok:false,reason:'DECODER_FAILED'}));
    child.stdin?.on('error',()=>{});
    child.stdin?.end(bytes);
  });
}
