import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/hls_quality.dart';

void main() {
  test('reads only declared rendition bandwidth and resolves relative URLs', () {
    final variants = sortedHlsVariants(Uri.parse('https://example.org/live/master.m3u8'), '''
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=4200000,AVERAGE-BANDWIDTH=3500000,RESOLUTION=1920x1080
hi/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=650000,RESOLUTION=640x360
low/index.m3u8
''');
    expect(variants.length, 2);
    expect(variants.first.estimatedBandwidth, 650000);
    expect(variants.first.uri.toString(), 'https://example.org/live/low/index.m3u8');
    expect(variants.last.estimatedBandwidth, 3500000);
  });

  test('does not manufacture a quality ladder from media playlists', () {
    final variants = parseHlsMaster(Uri.parse('https://example.org/live.m3u8'), '''
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
segment01.ts
''');
    expect(variants, isEmpty);
  });

  test('rejects invalid and non-network variants', () {
    final variants = parseHlsMaster(Uri.parse('https://example.org/master.m3u8'), '''
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=unknown
invalid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=100
file:///private/playlist.m3u8
''');
    expect(variants, isEmpty);
  });
}
