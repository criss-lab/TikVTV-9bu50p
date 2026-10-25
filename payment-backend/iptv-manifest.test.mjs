import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectHls,inspectDash} from './iptv-manifest.mjs';
const base='https://example.com/live/index.m3u8';
test('valid HLS media and variant references remain HTTPS',()=>{
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\nsegment.ts',base).references[0],'https://example.com/live/segment.ts');
  assert.equal(inspectHls('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlow.m3u8',base).kind,'master');
});
test('malformed, empty and encrypted HLS never pass',()=>{
  for(const input of ['not a manifest','#EXTM3U','#EXTM3U\n#EXTINF:5,','#EXTM3U\n#EXT-X-KEY:METHOD=AES-128\n#EXTINF:5,\nx.ts']) assert.equal(inspectHls(input,base).ok,false);
});
test('HLS rejects private, HTTPS downgrade, credentials and oversized references',()=>{
  for(const ref of ['http://example.com/x.ts','https://127.0.0.1/x.ts','https://[::1]/x.ts','https://user:pass@example.com/x.ts']) assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\n'+ref,base).ok,false,ref);
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\n'+'x'.repeat(66000),base).reason,'MANIFEST_SIZE');
});
test('HTTP HLS accepts HTTP segments without accepting private addresses or HTTPS downgrades',()=>{
  const httpBase='http://example.com/live/index.m3u8';
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\nsegment.ts',httpBase).references[0],'http://example.com/live/segment.ts');
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\nhttp://example.com/x.ts',httpBase).ok,true);
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\nhttp://127.0.0.1/x.ts',httpBase).ok,false);
  assert.equal(inspectHls('#EXTM3U\n#EXTINF:5,\nhttp://example.com/x.ts',base).ok,false);
});
test('DASH refuses XML entities and incomplete manifests',()=>{
  assert.equal(inspectDash('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><MPD><Period><AdaptationSet/></Period></MPD>',base).ok,false);
  assert.equal(inspectDash('<MPD/>',base).ok,false);
  const r=inspectDash('<MPD><Period><AdaptationSet/></Period></MPD>',base);
  assert.equal(r.ok,true);assert.equal(r.reason,'SEGMENT_VALIDATION_REQUIRED');
});
