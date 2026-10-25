import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { publicIPv4,validateTarget,resolvePinned,boundedBody,probe } from './iptv-safe-probe.mjs';

test('rejects private, metadata, reserved, multicast and IPv6',()=>{
  for(const ip of ['127.0.0.1','10.2.3.4','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::1']) assert.equal(publicIPv4(ip),false,ip);
  assert.equal(publicIPv4('8.8.8.8'),true);
});
test('URL policy rejects credentials, IP literals, local host and unsafe custom ports',()=>{
  for(const url of ['ftp://example.com/a','https://127.0.0.1/','https://[::1]/','https://user:pass@example.com/','https://example.com:22/','https://localhost/','https://foo.internal/','garbage']) assert.equal(validateTarget(url),null,url);
  assert.equal(validateTarget('https://example.com/stream.m3u8').hostname,'example.com');
  assert.equal(validateTarget('http://example.com/live.m3u8').protocol,'http:');
  assert.equal(validateTarget('http://example.com:8080/live.m3u8').port,'8080');
  assert.equal(validateTarget('https://example.com:8443/live.m3u8').port,'8443');
});
test('DNS rebinding: mixed public/private resolution is rejected',async()=>{
  await assert.rejects(resolvePinned('example.com',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/DNS_POLICY/);
  assert.equal(await resolvePinned('example.com',async()=>[{address:'8.8.8.8',family:4}]),'8.8.8.8');
});
test('body limit applies even when remote ignores Range',async()=>{
  await assert.rejects(boundedBody(Readable.from([Buffer.alloc(4096),Buffer.alloc(1)])),/BODY_LIMIT/);
  assert.equal((await boundedBody(Readable.from([Buffer.alloc(100)]))).length,100);
});
test('unsafe DNS never invokes transport',async()=>{
  let called=false;
  const result=await probe('https://example.com/a',{resolver:async()=>[{address:'169.254.169.254',family:4}],request:()=>{called=true;throw Error('must not call');}});
  assert.equal(result.reason,'DNS_POLICY');assert.equal(called,false);
});
