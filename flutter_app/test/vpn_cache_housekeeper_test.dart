import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/vpn_cache_housekeeper.dart';

void main() {
  test('deletes expired disposable files, retains fresh files', () async {
    final directory = await Directory.systemTemp.createTemp('tikvtv-vpn-cache-');
    try {
      final old = File('${directory.path}/expired.tmp');
      final fresh = File('${directory.path}/fresh.tmp');
      await old.writeAsString('old');
      await fresh.writeAsString('new');
      final now = DateTime.now();
      await old.setLastModified(now.subtract(const Duration(days: 3)));
      final removed = await const VpnCacheHousekeeper().clean(directory, now: now);
      expect(removed, 1);
      expect(await old.exists(), false);
      expect(await fresh.exists(), true);
    } finally {
      await directory.delete(recursive: true);
    }
  });

  test('enforces byte budget oldest-first', () async {
    final directory = await Directory.systemTemp.createTemp('tikvtv-vpn-budget-');
    try {
      final first = File('${directory.path}/first.tmp');
      final second = File('${directory.path}/second.tmp');
      await first.writeAsString('12345678');
      await second.writeAsString('12345678');
      final now = DateTime.now();
      await first.setLastModified(now.subtract(const Duration(hours: 2)));
      await second.setLastModified(now.subtract(const Duration(hours: 1)));
      final removed = await const VpnCacheHousekeeper(maxBytes: 8).clean(directory, now: now);
      expect(removed, 1);
      expect(await first.exists(), false);
      expect(await second.exists(), true);
    } finally {
      await directory.delete(recursive: true);
    }
  });
}
