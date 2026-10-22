/// HLS master-playlist rendition metadata. No bitrate is inferred from URL names.
class HlsVariant {
  final Uri uri;
  final int bandwidth;
  final int? averageBandwidth;
  const HlsVariant(this.uri, this.bandwidth, this.averageBandwidth);
  int get estimatedBandwidth => averageBandwidth ?? bandwidth;
}

List<HlsVariant> parseHlsMaster(Uri master, String content) {
  final result = <HlsVariant>[];
  final lines = content.split(RegExp(r'\\r?\\n'));
  Map<String, String>? pending;
  for (final raw in lines) {
    final line = raw.trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      final attrs = <String, String>{};
      final source = line.substring('#EXT-X-STREAM-INF:'.length);
      for (final match in RegExp(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)').allMatches(source)) {
        attrs[match.group(1)!] = match.group(2)!.replaceAll('"', '');
      }
      pending = attrs;
      continue;
    }
    if (line.isEmpty || line.startsWith('#')) continue;
    if (pending != null) {
      final bandwidth = int.tryParse(pending['BANDWIDTH'] ?? '');
      final uri = master.resolve(line);
      if (bandwidth != null && bandwidth > 0 && (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty) {
        result.add(HlsVariant(uri, bandwidth, int.tryParse(pending['AVERAGE-BANDWIDTH'] ?? '')));
      }
      pending = null;
    }
  }
  return result;
}

/// A quality ladder is only offered when the provider explicitly publishes one.
/// The native HLS player remains responsible for automatic bitrate adaptation.
List<HlsVariant> sortedHlsVariants(Uri master, String content) {
  final variants = parseHlsMaster(master, content);
  variants.sort((a, b) => a.estimatedBandwidth.compareTo(b.estimatedBandwidth));
  return variants;
}
