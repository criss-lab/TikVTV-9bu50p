import {fetchBounded} from './iptv-safe-probe.mjs';
import {inspectHls,inspectDash} from './iptv-manifest.mjs';
// Bounded structural/media reachability checks. Never claim actual decoder playback.
export async function verifyPlayback(url,{fetcher=fetchBounded}={}) {
  const root=await fetcher(url,{maxBytes:65536});
  if(root.reason!=='HTTP_ONLY_NOT_PLAYBACK_PROOF') return {...root,format:root.format||'unknown'};
  const format=root.format;
  if(format!=='hls'&&format!=='dash') return {outcome:'inconclusive',reason:'UNSUPPORTED_FORMAT',status:root.status,format:'unknown'};
  const parsed=format==='hls'?inspectHls(root.body.toString('utf8'),url):inspectDash(root.body.toString('utf8'),url);
  if(!parsed.ok)return {outcome:'unhealthy',reason:parsed.reason,status:root.status,format};
  if(format==='dash')return {outcome:'inconclusive',reason:'DASH_SEGMENT_VALIDATION_REQUIRED',status:root.status,format};
  if(parsed.kind==='master')return {outcome:'inconclusive',reason:'HLS_VARIANT_VALIDATION_REQUIRED',status:root.status,format};
  for(const reference of parsed.references) {
    const segment=await fetcher(reference,{maxBytes:32768});
    if(segment.reason!=='HTTP_ONLY_NOT_PLAYBACK_PROOF')return {outcome:segment.outcome==='unhealthy'?'unhealthy':'inconclusive',reason:'MEDIA_'+(segment.reason||'UNKNOWN'),status:segment.status||null,format};
    if(!segment.body?.length)return {outcome:'unhealthy',reason:'EMPTY_MEDIA',status:segment.status,format};
  }
  return {outcome:'inconclusive',reason:'DECODER_VALIDATION_REQUIRED',status:root.status,format};
}
