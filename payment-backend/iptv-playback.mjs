import {fetchBounded} from './iptv-safe-probe.mjs';
import {inspectHls,inspectDash} from './iptv-manifest.mjs';
import {decodeTransportSample} from './iptv-decoder.mjs';
// Promote health only after decoding a video frame from a bounded local media sample.
export async function verifyPlayback(url,{fetcher=fetchBounded,decoder=decodeTransportSample}={}) {
  const root=await fetcher(url,{maxBytes:65536});
  if(root.reason!=='HTTP_ONLY_NOT_PLAYBACK_PROOF') return {...root,format:root.format||'unknown'};
  const format=root.format;
  if(format!=='hls'&&format!=='dash') return {outcome:'inconclusive',reason:'UNSUPPORTED_FORMAT',status:root.status,format:'unknown'};
  const parsed=format==='hls'?inspectHls(root.body.toString('utf8'),url):inspectDash(root.body.toString('utf8'),url);
  if(!parsed.ok)return {outcome:'unhealthy',reason:parsed.reason,status:root.status,format};
  if(format==='dash')return {outcome:'inconclusive',reason:'DASH_SEGMENT_VALIDATION_REQUIRED',status:root.status,format};
  // Inspect one validated variant; a master manifest by itself is not playback proof.
  let media=parsed;
  if(parsed.kind==='master') {
    const variant=await fetcher(parsed.references[0],{maxBytes:65536});
    if(variant.reason!=='HTTP_ONLY_NOT_PLAYBACK_PROOF') return {outcome:variant.outcome==='unhealthy'?'unhealthy':'inconclusive',reason:'VARIANT_'+(variant.reason||'UNKNOWN'),status:variant.status||null,format};
    media=inspectHls(variant.body.toString('utf8'),parsed.references[0]);
    if(!media.ok) return {outcome:'unhealthy',reason:media.reason,status:variant.status,format};
    if(media.kind!=='media') return {outcome:'inconclusive',reason:'NESTED_MASTER_UNSUPPORTED',status:variant.status,format};
  }
  let decoded=0;
  for(const reference of media.references) {
    const segment=await fetcher(reference,{maxBytes:2097152});
    if(segment.reason!=='HTTP_ONLY_NOT_PLAYBACK_PROOF')return {outcome:segment.outcome==='unhealthy'?'unhealthy':'inconclusive',reason:'MEDIA_'+(segment.reason||'UNKNOWN'),status:segment.status||null,format};
    if(!segment.body?.length)return {outcome:'unhealthy',reason:'EMPTY_MEDIA',status:segment.status,format};
    const sample=await decoder(segment.body);
    if(!sample.ok)return {outcome:'inconclusive',reason:sample.reason||'DECODER_VALIDATION_REQUIRED',status:segment.status,format};
    decoded++;
  }
  return decoded>0?{outcome:'healthy',reason:'VIDEO_FRAME_DECODED',status:root.status,format}:{outcome:'inconclusive',reason:'DECODER_VALIDATION_REQUIRED',status:root.status,format};
}
