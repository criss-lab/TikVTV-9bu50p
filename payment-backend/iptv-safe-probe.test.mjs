import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { publicIPv4,validateTarget,resolvePinned,boundedBody,probe,fetchBounded } from './iptv-safe-probe.mjs';

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

test('connection failures remain inconclusive with actionable diagnostics',async()=>{
  for(const [code,expected] of [['ECONNREFUSED','CONNECTION_REFUSED'],['ECONNRESET','CONNECTION_RESET'],['CERT_HAS_EXPIRED','TLS_CERT_EXPIRED']]) {
    const result=await probe('https://example.com/live.m3u8',{
      resolver:async()=>[{address:'8.8.8.8',family:4}],
      request:()=>({on(event,handler){if(event==='error')this.onError=handler;return this;},end(){queueMicrotask(()=>this.onError(Object.assign(new Error(code),{code})));}})
    });
    assert.equal(result.outcome,'inconclusive');assert.equal(result.reason,expected);
  }
});

test('dual-stack public IPv4 and IPv6 does not falsely fail IPv4-only pinned probe',async()=>{
 assert.equal(await resolvePinned('example.com',async()=>[{address:'2606:4700:4700::1111',family:6},{address:'8.8.8.8',family:4}]),'8.8.8.8');
 await assert.rejects(resolvePinned('example.com',async()=>[{address:'::1',family:6}]),/DNS_NO_IPV4/);
 await assert.rejects(resolvePinned('example.com',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/DNS_POLICY/);
});

// Node's autoSelectFamily invokes lookup({all:true}); returning a scalar address
// in that mode produces ERR_INVALID_IP_ADDRESS before the network is contacted.
test('pinned lookup honors Node all-address callback contract without DNS re-resolution',async()=>{
 let calls=0;
 const result=await fetchBounded('https://example.com/live.m3u8',{
   resolver:async()=>[{address:'8.8.8.8',family:4}],
   request:(_url,options,_response)=>{
     options.lookup('example.com',{all:true},(err,addresses)=>{
       assert.equal(err,null);
       assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);
       calls++;
     });
     options.lookup('example.com',{},(err,address,family)=>{
       assert.equal(err,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);calls++;
     });
     return {on(event,handler){if(event==='error')this.error=handler;return this;},end(){queueMicrotask(()=>this.error(Object.assign(new Error('ECONNREFUSED'),{code:'ECONNREFUSED'})));}};
   }
 });
 assert.equal(calls,2);assert.equal(result.reason,'CONNECTION_REFUSED');
});
