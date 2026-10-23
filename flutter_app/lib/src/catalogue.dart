import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class Channel {
  final String id, name, logo, country;
  final List<String> categories;
  final List<String> languages;
  final List<String> urls;
  const Channel(this.id, this.name, this.logo, this.country, this.urls, {this.categories = const [], this.languages = const []});
}

class ChannelCatalogue extends ChangeNotifier {
  // Additional sources are discovered but only explicitly approved channel IDs
  // may enter a subscription-backed catalogue. Review distribution rights first.
  static const approvedFreeTvIds = <String>{};
  static const maxOptionalPlaylistBytes = 8 * 1024 * 1024;
  int discoveredFreeTv = 0;
  int get playableChannelCount => channels.length;
  int get playableStreamCount => channels.fold<int>(0, (total, channel) => total + channel.urls.length);
  int get discoveredOptionalEntries => discoveredBySource.values.fold<int>(0, (total, count) => total + count);
  int get approvedOptionalSourceCount => approvedFreeTvIds.length;
  final Map<String, int> discoveredBySource = {};
  // StreamVault mirrors iptv-org; awesome-iptv is a directory, not a playlist.
  // Guovin exports require an independently configured and reviewed deployment.
  static const additionalPlaylists = <String, String>{
    'free-tv': 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    'dearbulut': 'https://dearbulut.github.io/iptv/playlists/online.m3u',
  };

  static final ChannelCatalogue _instance = ChannelCatalogue._();
  factory ChannelCatalogue() => _instance;
  ChannelCatalogue._();

  List<Channel> channels = [];
  bool loading = false;
  String? error;
  Future<void>? _pending;
  bool _hydrated = false;
  DateTime? _loadedAt;
  Future<void> load({bool force = false}) {
    if (_pending != null) return _pending!;
    if (!force && channels.isNotEmpty && _loadedAt != null &&
        DateTime.now().difference(_loadedAt!) < const Duration(hours: 6)) {
      return Future.value();
    }
    _pending = _loadAndFetch(force).whenComplete(() => _pending = null);
    return _pending!;
  }

  Future<void> _loadAndFetch(bool force) async {
    if (!_hydrated) {
      _hydrated = true;
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString('channel_catalogue_v1');
        if (raw != null) {
          final data = jsonDecode(raw) as Map<String, dynamic>;
          final saved = (data['channels'] as List<dynamic>).cast<Map<String, dynamic>>();
          channels = List.unmodifiable(saved.map((v) => Channel(v['id'] as String, v['name'] as String,
            v['logo'] as String, v['country'] as String, List<String>.from(v['urls'] as List), categories: List<String>.from(v['categories'] as List? ?? const []), languages: List<String>.from(v['languages'] as List? ?? const []))));
          _loadedAt = DateTime.fromMillisecondsSinceEpoch(data['timestamp'] as int);
          notifyListeners();
        }
      } catch (e) { debugPrint('Catalogue cache unavailable: $e'); }
    }
    if (!force && channels.isNotEmpty && _loadedAt != null &&
        DateTime.now().difference(_loadedAt!) < const Duration(hours: 6)) {
      return;
    }
    await _fetch();
  }

  Future<void> _fetch() async {
    loading = true; error = null; notifyListeners();
    try {
      final results = await Future.wait([
        http.get(Uri.parse('https://iptv-org.github.io/api/channels.json'))
          .timeout(const Duration(seconds: 15)),
        http.get(Uri.parse('https://iptv-org.github.io/api/streams.json'))
          .timeout(const Duration(seconds: 20)),
        http.get(Uri.parse('https://iptv-org.github.io/api/logos.json'))
          .timeout(const Duration(seconds: 20)),
        http.get(Uri.parse('https://iptv-org.github.io/api/blocklist.json'))
          .timeout(const Duration(seconds: 20)),

      ]);
      if (results[0].statusCode != 200 || results[1].statusCode != 200) {
        throw StateError('Catalogue HTTP failure');
      }
      final metadata = jsonDecode(results[0].body) as List<dynamic>;
      final streams = jsonDecode(results[1].body) as List<dynamic>;
      final logos = <String, String>{};
      if (results[2].statusCode == 200) {
        for (final item in jsonDecode(results[2].body) as List<dynamic>) {
          if (item is! Map || item['in_use'] != true) continue;
          final id = item['channel'], url = item['url'];
          if (id is String && url is String && Uri.tryParse(url)?.scheme == 'https') {
            logos.putIfAbsent(id, () => url);
          }
        }
      }
      final blocked = <String>{};
      if (results[3].statusCode != 200) throw StateError('Blocklist unavailable; retaining last safe catalogue');
      for (final item in jsonDecode(results[3].body) as List<dynamic>) {
        if (item is Map && item['channel'] is String) blocked.add(item['channel'] as String);
      }
      final sources = <String, List<String>>{};
      final sourceUrls = <String, Set<String>>{};
      for (final item in streams) {
        if (item is! Map) { continue; }
        final id = item['channel'];
        final url = item['url'];
        if (id is! String || url is! String || blocked.contains(id)) { continue; }
        final uri = Uri.tryParse(url.trim());
        if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http') || uri.host.isEmpty) { continue; }
        final list = sources.putIfAbsent(id, () => []);
        if (sourceUrls.putIfAbsent(id, () => <String>{}).add(url.trim())) {
          list.add(url.trim());
        }
      }
      final parsed = <Channel>[];
      for (final item in metadata) {
        if (item is! Map || item['is_nsfw'] == true || item['closed'] != null || blocked.contains(item['id'])) { continue; }
        final id = item['id'];
        final name = item['name'];
        if (id is! String || name is! String || name.trim().isEmpty || !sources.containsKey(id)) { continue; }
        parsed.add(Channel(id, name, logos[id] ?? '',
          item['country'] is String ? item['country'] : 'INT',
          List.unmodifiable(sources[id]!), categories: List<String>.from(item['categories'] as List? ?? const []), languages: List<String>.from(item['languages'] as List? ?? const [])));
      }
      // Optional feeds are discovered independently: a failure never removes
      // the last known-good primary catalogue. Do not auto-monetize links.
      final nextDiscoveredBySource = <String, int>{};
      final known = <String, int>{for (var i = 0; i < parsed.length; i++) parsed[i].id: i};
      final extra = await Future.wait(additionalPlaylists.entries.map((entry) async {
        try {
          final response = await http.get(Uri.parse(entry.value))
              .timeout(const Duration(seconds: 20));
          if (response.statusCode != 200 || response.bodyBytes.length > maxOptionalPlaylistBytes) {
            debugPrint('Optional playlist rejected: ${entry.key} (HTTP ${response.statusCode}, ${response.bodyBytes.length} bytes)');
            return MapEntry(entry.key, '');
          }
          return MapEntry(entry.key, response.body);
        } catch (e) {
          debugPrint('Optional playlist unavailable: $e');
          return MapEntry(entry.key, '');
        }
      }));
      final approvedUrls = <String, Set<String>>{};
      for (final entry in extra) {
        var count = 0;
        if (!entry.value.startsWith('#EXTM3U')) {
          nextDiscoveredBySource[entry.key] = 0;
          continue;
        }
        String? pendingId;
        final seen = <String>{};
        for (final raw in const LineSplitter().convert(entry.value)) {
          final line = raw.trim();
          if (line.startsWith('#EXTINF:')) {
            pendingId = RegExp(r'tvg-id="([^"]+)"').firstMatch(line)?.group(1);
          } else if (line.isNotEmpty && !line.startsWith('#')) {
            final uri = Uri.tryParse(line);
            if (pendingId != null && uri != null &&
                (uri.scheme == 'https' || uri.scheme == 'http') &&
                uri.host.isNotEmpty && !blocked.contains(pendingId) &&
                seen.add('$pendingId|$line')) {
              count++;
              final index = known[pendingId];
              if (approvedFreeTvIds.contains(pendingId) && index != null &&
                  approvedUrls.putIfAbsent(pendingId, () => parsed[index].urls.toSet()).add(line)) {
                final ch = parsed[index];
                parsed[index] = Channel(ch.id, ch.name, ch.logo, ch.country,
                    List.unmodifiable([...ch.urls, line]),
                    categories: ch.categories, languages: ch.languages);
              }
            }
            pendingId = null;
          }
        }
        nextDiscoveredBySource[entry.key] = count;
      }
      discoveredBySource..clear()..addAll(nextDiscoveredBySource);
      discoveredFreeTv = discoveredBySource['free-tv'] ?? 0;
      channels = List.unmodifiable(parsed);
      _loadedAt = DateTime.now();
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('channel_catalogue_v1', jsonEncode({
          'timestamp': _loadedAt!.millisecondsSinceEpoch,
          'channels': parsed.map((ch) => {'id': ch.id, 'name': ch.name,
            'logo': ch.logo, 'country': ch.country, 'urls': ch.urls, 'categories': ch.categories, 'languages': ch.languages}).toList(),
        }));
      } catch (e) { debugPrint('Catalogue cache write failed: $e'); }
    } catch (e) {
      error = e.toString(); // Preserve last successful catalogue when offline.
    } finally {
      loading = false; notifyListeners();
    }
  }
}
