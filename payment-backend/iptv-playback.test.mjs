import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPlayback} from './iptv-playback.mjs';
const url='https://example.com/live.m3u8';
const manifest=Buffer.from('#EXTM3U\n#EXTINF:5,\nsegment.ts\n');
function fetcher(_url) {return Promise.resolve({reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',outcome:'inconclusive',status:200,format:_url.endsWith('.m3u8')?'hls':'unknown',body:_url.endsWith('.m3u8')?manifest:Buffer.alloc(188,0x47)});}
test('successful local decoder proof alone can promote health',async()=>{
 const result=await verifyPlayback(url,{fetcher,decoder:async()=>({ok:true,reason:'VIDEO_FRAME_DECODED'})});
 assert.equal(result.outcome,'healthy');assert.equal(result.reason,'VIDEO_FRAME_DECODED');
});
test('missing decoder proof never promotes health',async()=>{
 const result=await verifyPlayback(url,{fetcher,decoder:async()=>({ok:false,reason:'DECODER_UNAVAILABLE'})});
 assert.equal(result.outcome,'inconclusive');assert.equal(result.reason,'DECODER_UNAVAILABLE');
});
test('HTTP-only manifest is not playback proof',async()=>{
 const result=await verifyPlayback(url,{fetcher:async()=>({outcome:'inconclusive',reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',status:200,format:'dash',body:Buffer.from('<MPD><Period><AdaptationSet/></Period></MPD>')})});
 assert.equal(result.outcome,'inconclusive');
});

test('master playlist follows bounded variant and decodes a media segment',async()=>{
 const calls=[];
 const master=Buffer.from('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvariant.m3u8\n');
 const media=Buffer.from('#EXTM3U\n#EXTINF:5,\nsegment.ts\n');
 const result=await verifyPlayback(url,{
  fetcher:async(target,options)=>{
   calls.push([target,options?.maxBytes]);
   const body=target.endsWith('variant.m3u8')?media:target.endsWith('segment.ts')?Buffer.alloc(188,0x47):master;
   return {reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',outcome:'inconclusive',status:200,format:'hls',body};
  },
  decoder:async()=>({ok:true,reason:'VIDEO_FRAME_DECODED'})
 });
 assert.equal(result.outcome,'healthy');
 assert.equal(result.reason,'VIDEO_FRAME_DECODED');
 assert.deepEqual(calls.map(x=>x[1]),[65536,65536,2097152]);
 assert.equal(calls[1][0],'https://example.com/variant.m3u8');
});
test('nested master cannot recurse indefinitely',async()=>{
 const master=Buffer.from('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvariant.m3u8\n');
 const result=await verifyPlayback(url,{fetcher:async()=>({reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',outcome:'inconclusive',status:200,format:'hls',body:master})});
 assert.equal(result.outcome,'inconclusive');
 assert.equal(result.reason,'NESTED_MASTER_UNSUPPORTED');
});
