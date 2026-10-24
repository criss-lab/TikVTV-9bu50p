import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPlayback} from './iptv-playback.mjs';
const ok=(body,format='hls')=>({outcome:'inconclusive',reason:'HTTP_ONLY_NOT_PLAYBACK_PROOF',status:200,format,body:Buffer.from(body)});
test('HTTP 200 with nonmanifest is unhealthy',async()=>{
 const r=await verifyPlayback('https://example.com/a.m3u8',{fetcher:async()=>ok('<html>not video</html>')});
 assert.equal(r.outcome,'unhealthy');assert.equal(r.reason,'HLS_HEADER');
});
test('reachable HLS segment remains inconclusive until decoder verification',async()=>{
 let calls=0;const r=await verifyPlayback('https://example.com/a.m3u8',{fetcher:async()=>++calls===1?ok('#EXTM3U\n#EXTINF:5,\na.ts'):ok('media bytes')});
 assert.equal(calls,2);assert.equal(r.reason,'DECODER_VALIDATION_REQUIRED');assert.equal(r.outcome,'inconclusive');
});
test('failed segment cannot be called healthy',async()=>{
 let calls=0;const r=await verifyPlayback('https://example.com/a.m3u8',{fetcher:async()=>++calls===1?ok('#EXTM3U\n#EXTINF:5,\na.ts'):{outcome:'unhealthy',reason:'HTTP_FAILURE',status:404}});
 assert.equal(r.outcome,'unhealthy');assert.equal(r.reason,'MEDIA_HTTP_FAILURE');
});
test('DASH manifest is not mistaken for verified playback',async()=>{
 const r=await verifyPlayback('https://example.com/a.mpd',{fetcher:async()=>ok('<MPD><Period><AdaptationSet/></Period></MPD>','dash')});
 assert.equal(r.outcome,'inconclusive');assert.equal(r.reason,'DASH_SEGMENT_VALIDATION_REQUIRED');
});
