import 'dart:io';

/// Cleanup only for a dedicated, app-owned disposable VPN cache directory.
/// Never use for credentials, subscription data, databases or downloads.
class VpnCacheHousekeeper {
  const VpnCacheHousekeeper({
    this.maxAge = const Duration(days: 2),
    this.maxBytes = 32 * 1024 * 1024,
  });

  final Duration maxAge;
  final int maxBytes;

  Future<int> clean(Directory directory, {DateTime? now}) async {
    if (!await directory.exists()) return 0;
    final root = await directory.resolveSymbolicLinks();
    final current = now ?? DateTime.now();
    final entries = <({File file, DateTime modified, int bytes})>[];
    await for (final entity in directory.list(followLinks: false)) {
      if (entity is! File || await FileSystemEntity.isLink(entity.path)) continue;
      final resolved = await entity.resolveSymbolicLinks();
      if (!resolved.startsWith(root + Platform.pathSeparator)) continue;
      final stat = await entity.stat();
      entries.add((file: entity, modified: stat.modified, bytes: stat.size));
    }
    var removed = 0;
    final retained = <({File file, DateTime modified, int bytes})>[];
    for (final entry in entries) {
      if (current.difference(entry.modified) > maxAge) {
        try { await entry.file.delete(); removed++; } on FileSystemException { /* best effort */ }
      } else {
        retained.add(entry);
      }
    }
    retained.sort((a, b) => a.modified.compareTo(b.modified));
    var total = retained.fold<int>(0, (sum, item) => sum + item.bytes);
    for (final entry in retained) {
      if (total <= maxBytes) break;
      try {
        await entry.file.delete();
        total -= entry.bytes;
        removed++;
      } on FileSystemException { /* best effort */ }
    }
    return removed;
  }
}
