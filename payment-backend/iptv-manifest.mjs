// Strict manifest inspection only. HTTP 200 or a parseable manifest is not decoder playback proof.
import { validateTarget } from './iptv-safe-probe.mjs';
const absolute = (base,relative) => {
  try {
    const url=new URL(relative,base);
    return validateTarget(url.href) ? url.href : null;
  } catch {return null;}
};
export function inspectHls(body,base) {
  if(typeof body!=='string'||Buffer.byteLength(body)>65536) return {ok:false,reason:'MANIFEST_SIZE'};
  const lines=body.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines[0]!=='#EXTM3U') return {ok:false,reason:'HLS_HEADER'};
  if(lines.some(x=>/^#EXT-X-KEY:/i.test(x))) return {ok:false,reason:'ENCRYPTED_UNSUPPORTED'};
  const master=lines.some(x=>/^#EXT-X-STREAM-INF:/i.test(x));
  const references=[];
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(master && /^#EXT-X-STREAM-INF:/i.test(line)) {
      const next=lines[i+1];if(!next||next.startsWith('#'))return {ok:false,reason:'HLS_VARIANT_MISSING'};
      references.push(next);
    }
    if(!master && /^#EXTINF:/i.test(line)) {
      const next=lines[i+1];if(!next||next.startsWith('#'))return {ok:false,reason:'HLS_SEGMENT_MISSING'};
      references.push(next);
    }
  }
  if(!references.length)return {ok:false,reason:'HLS_NO_MEDIA'};
  const urls=references.slice(0,2).map(x=>absolute(base,x));
  if(urls.some(x=>!x))return {ok:false,reason:'HLS_REFERENCE_POLICY'};
  return {ok:true,format:'hls',kind:master?'master':'media',references:urls};
}
export function inspectDash(body,base) {
  if(typeof body!=='string'||Buffer.byteLength(body)>65536)return {ok:false,reason:'MANIFEST_SIZE'};
  if(/<!DOCTYPE|<!ENTITY/i.test(body))return {ok:false,reason:'XML_ENTITY_BLOCKED'};
  if(!/<MPD(?:\s|>)/.test(body)||!/<Period(?:\s|>)/.test(body)||!/<AdaptationSet(?:\s|\/?>)/.test(body))return {ok:false,reason:'DASH_STRUCTURE'};
  // Full DASH template expansion and actual segment validation belong to the playback stage.
  return {ok:true,format:'dash',kind:'manifest_only',references:[],reason:'SEGMENT_VALIDATION_REQUIRED'};
}
