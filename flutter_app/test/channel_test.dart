import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/catalogue.dart';

void main() {
  test('channel retains its identity and ordered fallback sources', () {
    const channel = Channel('traceurban.fr', 'TRACE Urban', '', 'FR', [
      'https://example.com/primary.m3u8',
      'https://example.com/fallback.m3u8',
    ]);
    expect(channel.id, 'traceurban.fr');
    expect(channel.name, 'TRACE Urban');
    expect(channel.urls, hasLength(2));
    expect(channel.urls.last, contains('fallback.m3u8'));
  });
}
