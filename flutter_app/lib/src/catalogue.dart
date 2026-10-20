import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class Channel {
  final String id, name, logo, country;
  final List<String> urls;
  const Channel(this.id, this.name, this.logo, this.country, this.urls);
}

class ChannelCatalogue extends ChangeNotifier {
  static final ChannelCatalogue _instance = ChannelCatalogue._();
  factory ChannelCatalogue() => _instance;
  ChannelCatalogue._();

  List<Channel> channels = [];
  bool loading = false;
  String? error;
  Future<void>? _pending;
  DateTime? _loadedAt;
  Future<void> load({bool force = false}) {
    if (_pending != null) return _pending!;
    if (!force && channels.isNotEmpty && _loadedAt != null &&
        DateTime.now().difference(_loadedAt!) < const Duration(hours: 6)) {
      return Future.value();
    }
    _pending = _fetch().whenComplete(() => _pending = null);
    return _pending!;
  }

  Future<void> _fetch() async {
    loading = true; error = null; notifyListeners();
    try {
      final results = await Future.wait([
        http.get(Uri.parse('https://iptv-org.github.io/api/channels.json'))
          .timeout(const Duration(seconds: 15)),
        http.get(Uri.parse('https://iptv-org.github.io/api/streams.json'))
          .timeout(const Duration(seconds: 15)),
      ]);
      if (results.any((r) => r.statusCode != 200)) throw StateError('Catalogue HTTP failure');
      final metadata = jsonDecode(results[0].body) as List<dynamic>;
      final streams = jsonDecode(results[1].body) as List<dynamic>;
      final sources = <String, List<String>>{};
      for (final item in streams) {
        if (item is! Map) continue;
        final id = item['channel'];
        final url = item['url'];
        if (id is! String || url is! String) continue;
        final uri = Uri.tryParse(url.trim());
        if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http') || uri.host.isEmpty) continue;
        final list = sources.putIfAbsent(id, () => []);
        if (!list.contains(url.trim())) list.add(url.trim());
      }
      final parsed = <Channel>[];
      for (final item in metadata) {
        if (item is! Map || item['is_nsfw'] == true) continue;
        final id = item['id'];
        final name = item['name'];
        if (id is! String || name is! String || name.trim().isEmpty || !sources.containsKey(id)) continue;
        parsed.add(Channel(id, name, item['logo'] is String ? item['logo'] : '',
          item['country'] is String ? item['country'] : 'INT',
          List.unmodifiable(sources[id]!)));
      }
      channels = List.unmodifiable(parsed);
      _loadedAt = DateTime.now();
    } catch (e) {
      error = e.toString(); // Preserve last successful catalogue when offline.
    } finally {
      loading = false; notifyListeners();
    }
  }
}
