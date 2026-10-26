import 'dart:async';
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
  // Optional feeds may expand the free catalogue; never treat their entries as paid/approved entitlements.
  static const approvedFreeTvIds = <String>{};
  static const maxOptionalPlaylistBytes = 8 * 1024 * 1024;
  int discoveredFreeTv = 0;
  int approvedImportedCount = 0;
  int get primaryChannelCount => channels.length - approvedImportedCount;
  int get playableChannelCount => channels.length;
  int get playableStreamCount => channels.expand((channel) => channel.urls).toSet().length;
  int get uniqueChannelIdentityCount => channels.map((channel) => channel.id).toSet().length;
  /// Global coverage metrics count distinct declared territories and languages,
  /// not verified availability or licensed distribution in those territories.
  int get declaredCountryCount => channels.map((c) => c.country.toUpperCase()).where((c) => c.isNotEmpty && c != 'INT').toSet().length;
  int get declaredLanguageCount => channels.expand((c) => c.languages).map((l) => l.toLowerCase()).where((l) => l.isNotEmpty).toSet().length;
  Map<String, int> get channelCountByCountry {
    final counts = <String, int>{};
    for (final channel in channels) {
      final country = channel.country.toUpperCase();
      counts.update(country, (n) => n + 1, ifAbsent: () => 1);
    }
    return Map.unmodifiable(counts);
  }
  int get discoveredOptionalEntries => discoveredBySource.values.fold<int>(0, (total, count) => total + count);
  int get approvedOptionalSourceCount => approvedFreeTvIds.length;
  final Map<String, int> discoveredBySource = {};
  // StreamVault mirrors iptv-org; awesome-iptv is a directory, not a playlist.
  // Guovin exports require an independently configured and reviewed deployment.
  static const additionalPlaylists = <String, String>{
    'freetv': 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    'news': 'https://iptv-org.github.io/iptv/categories/news.m3u',
    'sports': 'https://iptv-org.github.io/iptv/categories/sports.m3u',
    'music': 'https://iptv-org.github.io/iptv/categories/music.m3u',
    'entertainment': 'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
    'kids': 'https://iptv-org.github.io/iptv/categories/kids.m3u',
    'documentary': 'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    'religious': 'https://iptv-org.github.io/iptv/categories/religious.m3u',
    'general': 'https://iptv-org.github.io/iptv/categories/general.m3u',
    'lifestyle': 'https://iptv-org.github.io/iptv/categories/lifestyle.m3u',
    'business': 'https://iptv-org.github.io/iptv/categories/business.m3u',
    'science': 'https://iptv-org.github.io/iptv/categories/science.m3u',
    'movies': 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    'series': 'https://iptv-org.github.io/iptv/categories/series.m3u',
    'animation': 'https://iptv-org.github.io/iptv/categories/animation.m3u',
    'cooking': 'https://iptv-org.github.io/iptv/categories/cooking.m3u',
    'travel': 'https://iptv-org.github.io/iptv/categories/travel.m3u',
    'weather': 'https://iptv-org.github.io/iptv/categories/weather.m3u',
    'shop': 'https://iptv-org.github.io/iptv/categories/shop.m3u',
    'auto': 'https://iptv-org.github.io/iptv/categories/auto.m3u',
    'afr': 'https://iptv-org.github.io/iptv/regions/afr.m3u',
    'eur': 'https://iptv-org.github.io/iptv/regions/eur.m3u',
    'ame': 'https://iptv-org.github.io/iptv/regions/ame.m3u',
    'apa': 'https://iptv-org.github.io/iptv/regions/apa.m3u',
    'ara': 'https://iptv-org.github.io/iptv/regions/ara.m3u',
    'asia': 'https://iptv-org.github.io/iptv/regions/asia.m3u',
    'mea': 'https://iptv-org.github.io/iptv/regions/mea.m3u',
    'oce': 'https://iptv-org.github.io/iptv/regions/oce.m3u',
    'cis': 'https://iptv-org.github.io/iptv/regions/cis.m3u',
    'nafrica': 'https://iptv-org.github.io/iptv/regions/nafrica.m3u',
    'eafrica': 'https://iptv-org.github.io/iptv/regions/eafrica.m3u',
    'wafrica': 'https://iptv-org.github.io/iptv/regions/wafrica.m3u',
    'safrica': 'https://iptv-org.github.io/iptv/regions/safrica.m3u',
    'cafrica': 'https://iptv-org.github.io/iptv/regions/cafrica.m3u',
    'sasia': 'https://iptv-org.github.io/iptv/regions/sasia.m3u',
    'seasia': 'https://iptv-org.github.io/iptv/regions/seast_asia.m3u',
    'easia': 'https://iptv-org.github.io/iptv/regions/east_asia.m3u',
    'casia': 'https://iptv-org.github.io/iptv/regions/casia.m3u',
    'weur': 'https://iptv-org.github.io/iptv/regions/west_eur.m3u',
    'neur': 'https://iptv-org.github.io/iptv/regions/north_eur.m3u',
    'seur': 'https://iptv-org.github.io/iptv/regions/south_eur.m3u',
    'eeur': 'https://iptv-org.github.io/iptv/regions/east_eur.m3u',
    'samer': 'https://iptv-org.github.io/iptv/regions/samer.m3u',
    'namer': 'https://iptv-org.github.io/iptv/regions/namer.m3u',
    'camer': 'https://iptv-org.github.io/iptv/regions/camer.m3u',
    'carib': 'https://iptv-org.github.io/iptv/regions/carib.m3u',
    'arab': 'https://iptv-org.github.io/iptv/regions/arab.m3u',
    'ara-2': 'https://iptv-org.github.io/iptv/languages/ara.m3u',
    'fra': 'https://iptv-org.github.io/iptv/languages/fra.m3u',
    'spa': 'https://iptv-org.github.io/iptv/languages/spa.m3u',
    'por': 'https://iptv-org.github.io/iptv/languages/por.m3u',
    'rus': 'https://iptv-org.github.io/iptv/languages/rus.m3u',
    'hin': 'https://iptv-org.github.io/iptv/languages/hin.m3u',
    'zho': 'https://iptv-org.github.io/iptv/languages/zho.m3u',
    'deu': 'https://iptv-org.github.io/iptv/languages/deu.m3u',
    'tur': 'https://iptv-org.github.io/iptv/languages/tur.m3u',
    'ita': 'https://iptv-org.github.io/iptv/languages/ita.m3u',
    'ind': 'https://iptv-org.github.io/iptv/languages/ind.m3u',
    'fas': 'https://iptv-org.github.io/iptv/languages/fas.m3u',
    'pol': 'https://iptv-org.github.io/iptv/languages/pol.m3u',
    'nld': 'https://iptv-org.github.io/iptv/languages/nld.m3u',
    'ell': 'https://iptv-org.github.io/iptv/languages/ell.m3u',
    'ron': 'https://iptv-org.github.io/iptv/languages/ron.m3u',
    'ukr': 'https://iptv-org.github.io/iptv/languages/ukr.m3u',
    'vie': 'https://iptv-org.github.io/iptv/languages/vie.m3u',
    'tha': 'https://iptv-org.github.io/iptv/languages/tha.m3u',
    'kor': 'https://iptv-org.github.io/iptv/languages/kor.m3u',
    'jpn': 'https://iptv-org.github.io/iptv/languages/jpn.m3u',
    'swa': 'https://iptv-org.github.io/iptv/languages/swa.m3u',
    'amh': 'https://iptv-org.github.io/iptv/languages/amh.m3u',
    'hau': 'https://iptv-org.github.io/iptv/languages/hau.m3u',
    'yor': 'https://iptv-org.github.io/iptv/languages/yor.m3u',
    'lin': 'https://iptv-org.github.io/iptv/languages/lin.m3u',
    'msa': 'https://iptv-org.github.io/iptv/languages/msa.m3u',
    'ben': 'https://iptv-org.github.io/iptv/languages/ben.m3u',
    'us': 'https://iptv-org.github.io/iptv/countries/us.m3u',
    'gb': 'https://iptv-org.github.io/iptv/countries/gb.m3u',
    'fr': 'https://iptv-org.github.io/iptv/countries/fr.m3u',
    'de': 'https://iptv-org.github.io/iptv/countries/de.m3u',
    'br': 'https://iptv-org.github.io/iptv/countries/br.m3u',
    'in': 'https://iptv-org.github.io/iptv/countries/in.m3u',
    'tr': 'https://iptv-org.github.io/iptv/countries/tr.m3u',
    'ng': 'https://iptv-org.github.io/iptv/countries/ng.m3u',
    'za': 'https://iptv-org.github.io/iptv/countries/za.m3u',
    'cd': 'https://iptv-org.github.io/iptv/countries/cd.m3u',
    'mx': 'https://iptv-org.github.io/iptv/countries/mx.m3u',
    'ar': 'https://iptv-org.github.io/iptv/countries/ar.m3u',
    'ru': 'https://iptv-org.github.io/iptv/countries/ru.m3u',
    'it': 'https://iptv-org.github.io/iptv/countries/it.m3u',
    'es': 'https://iptv-org.github.io/iptv/countries/es.m3u',
    'pt': 'https://iptv-org.github.io/iptv/countries/pt.m3u',
    'cn': 'https://iptv-org.github.io/iptv/countries/cn.m3u',
    'jp': 'https://iptv-org.github.io/iptv/countries/jp.m3u',
    'kr': 'https://iptv-org.github.io/iptv/countries/kr.m3u',
    'id': 'https://iptv-org.github.io/iptv/countries/id.m3u',
    'sa': 'https://iptv-org.github.io/iptv/countries/sa.m3u',
    'eg': 'https://iptv-org.github.io/iptv/countries/eg.m3u',
    'pk': 'https://iptv-org.github.io/iptv/countries/pk.m3u',
    'ke': 'https://iptv-org.github.io/iptv/countries/ke.m3u',
    'gh': 'https://iptv-org.github.io/iptv/countries/gh.m3u',
    'sn': 'https://iptv-org.github.io/iptv/countries/sn.m3u',
    'ci': 'https://iptv-org.github.io/iptv/countries/ci.m3u',
    'cm': 'https://iptv-org.github.io/iptv/countries/cm.m3u',
    'ma': 'https://iptv-org.github.io/iptv/countries/ma.m3u',
    'tn': 'https://iptv-org.github.io/iptv/countries/tn.m3u',
    'dz': 'https://iptv-org.github.io/iptv/countries/dz.m3u',
    'ca': 'https://iptv-org.github.io/iptv/countries/ca.m3u',
    'au': 'https://iptv-org.github.io/iptv/countries/au.m3u',
    'pl': 'https://iptv-org.github.io/iptv/countries/pl.m3u',
    'nl': 'https://iptv-org.github.io/iptv/countries/nl.m3u',
    'se': 'https://iptv-org.github.io/iptv/countries/se.m3u',
    'no': 'https://iptv-org.github.io/iptv/countries/no.m3u',
    'dk': 'https://iptv-org.github.io/iptv/countries/dk.m3u',
    'fi': 'https://iptv-org.github.io/iptv/countries/fi.m3u',
    'gr': 'https://iptv-org.github.io/iptv/countries/gr.m3u',
    'ro': 'https://iptv-org.github.io/iptv/countries/ro.m3u',
    'hu': 'https://iptv-org.github.io/iptv/countries/hu.m3u',
    'cz': 'https://iptv-org.github.io/iptv/countries/cz.m3u',
    'ua': 'https://iptv-org.github.io/iptv/countries/ua.m3u',
    'il': 'https://iptv-org.github.io/iptv/countries/il.m3u',
    'th': 'https://iptv-org.github.io/iptv/countries/th.m3u',
    'vn': 'https://iptv-org.github.io/iptv/countries/vn.m3u',
    'my': 'https://iptv-org.github.io/iptv/countries/my.m3u',
    'ph': 'https://iptv-org.github.io/iptv/countries/ph.m3u',
    'et': 'https://iptv-org.github.io/iptv/countries/et.m3u',
    'tz': 'https://iptv-org.github.io/iptv/countries/tz.m3u',
    'ug': 'https://iptv-org.github.io/iptv/countries/ug.m3u',
    'ao': 'https://iptv-org.github.io/iptv/countries/ao.m3u',
    'mz': 'https://iptv-org.github.io/iptv/countries/mz.m3u',
    've': 'https://iptv-org.github.io/iptv/countries/ve.m3u',
    'co': 'https://iptv-org.github.io/iptv/countries/co.m3u',
    'cl': 'https://iptv-org.github.io/iptv/countries/cl.m3u',
    'pe': 'https://iptv-org.github.io/iptv/countries/pe.m3u',
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
        DateTime.now().difference(_loadedAt!) < const Duration(hours: 1)) {
      // Refresh the independently published catalogue even while primary cache is fresh.
      return _refreshApprovedOnly();
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
          approvedImportedCount = channels.where((channel) => channel.id.startsWith('approved-')).length;
          notifyListeners();
        }
      } catch (e) { debugPrint('Catalogue cache unavailable: $e'); }
    }
    if (!force && channels.isNotEmpty && _loadedAt != null &&
        DateTime.now().difference(_loadedAt!) < const Duration(hours: 6)) {
      await _refreshApprovedOnly();
      return;
    }
    await _fetch();
  }

  Future<void> _refreshApprovedOnly() async {
    try {
      final additions = await _approvedCatalogue();
      final primary = channels.where((channel) => !channel.id.startsWith('approved-')).toList();
      final seen = primary.expand((channel) => channel.urls).toSet();
      final approved = <Channel>[];
      for (final channel in additions) {
        if (seen.add(channel.urls.first)) approved.add(channel);
      }
      approvedImportedCount = approved.length;
      channels = List.unmodifiable([...primary, ...approved]);
      notifyListeners();
    } catch (error) { debugPrint('Approved catalogue refresh deferred: $error'); }
  }

  Future<List<Channel>> _approvedCatalogue() async {
    const api = String.fromEnvironment('PAYMENT_API_URL', defaultValue: 'https://tikvtv-payment-api.onrender.com');
    final base = api.endsWith('/') ? api.substring(0, api.length - 1) : api;
    final channels = <Channel>[];
    var after = 0;
    for (var page = 0; page < 200; page++) {
      final response = await http.get(Uri.parse('$base/v1/catalogue?limit=100&after=$after')).timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) throw StateError('Approved catalogue unavailable');
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      if (payload['publication'] != 'approved_only' || payload['channels'] is! List) throw StateError('Invalid approved catalogue');
      final rows = payload['channels'] as List<dynamic>;
      for (final item in rows) {
        if (item is! Map) continue;
        final url = item['stream_url']?.toString() ?? '';
        final uri = Uri.tryParse(url);
        if (uri == null || uri.scheme != 'https' || !uri.path.toLowerCase().endsWith('.m3u8')) continue;
        final id = item['id']?.toString();
        final name = item['name']?.toString();
        if (id == null || name == null || name.isEmpty) continue;
        channels.add(Channel('approved-$id', name, item['logo_url']?.toString() ?? '', item['country']?.toString() ?? 'INT', [url], categories: [item['category']?.toString() ?? 'general'], languages: item['language'] == null ? const [] : [item['language'].toString()]));
      }
      final next = (payload['next_cursor'] as num?)?.toInt();
      if (next == null || next <= after || rows.isEmpty) break;
      after = next;
    }
    return channels;
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
      // Prefer unrestricted listings. A geo-blocked source is not an alternate
      // route around a broadcaster's territorial rights.
      final restrictedSources = <String, List<String>>{};
      final sources = <String, List<String>>{};
      final sourceUrls = <String, Set<String>>{};
      for (final item in streams) {
        if (item is! Map) { continue; }
        final id = item['channel'];
        final url = item['url'];
        if (id is! String || url is! String || blocked.contains(id)) { continue; }
        final uri = Uri.tryParse(url.trim());
        if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http') || uri.host.isEmpty) { continue; }
        final labels = item['labels'];
        final geoRestricted = labels is List && labels.any((label) => label.toString().toLowerCase() == 'geo-blocked');
        if (geoRestricted) {
          restrictedSources.putIfAbsent(id, () => <String>[]).add(url.trim());
          continue;
        }
        final list = sources.putIfAbsent(id, () => []);
        if (sourceUrls.putIfAbsent(id, () => <String>{}).add(url.trim())) {
          list.add(url.trim());
        }
      }
      debugPrint('Excluded geo-restricted source listings for ${restrictedSources.length} channels; no proxy or location spoofing attempted.');
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
      final extra = <MapEntry<String, String>>[];
      final playlistEntries = additionalPlaylists.entries.toList(growable: false);
      // Mobile data and memory are limited: fetch a small bounded batch at a time.
      for (var offset = 0; offset < playlistEntries.length; offset += 6) {
        final batch = playlistEntries.skip(offset).take(6);
        extra.addAll(await Future.wait(batch.map((entry) async {
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
        })));
      }
      final approvedUrls = <String, Set<String>>{};
      final imported = <Channel>[];
      final importedUrls = parsed.expand((channel) => channel.urls).toSet();
      for (final entry in extra) {
        var count = 0;
        if (!entry.value.startsWith('#EXTM3U')) {
          nextDiscoveredBySource[entry.key] = 0;
          continue;
        }
        String? pendingId;
        String? pendingName;
        String? pendingLogo;
        String? pendingCountry;
        String? pendingLanguage;
        bool pendingGeoBlocked = false;
        final seen = <String>{};
        for (final raw in const LineSplitter().convert(entry.value)) {
          final line = raw.trim();
          if (line.startsWith('#EXTINF:')) {
            pendingId = RegExp(r'tvg-id="([^"]+)"').firstMatch(line)?.group(1);
            pendingName = line.contains(',') ? line.substring(line.lastIndexOf(',') + 1).trim() : null;
            pendingLogo = RegExp(r'tvg-logo="([^"]+)"').firstMatch(line)?.group(1);
            pendingCountry = RegExp(r'tvg-country="([^"]+)"').firstMatch(line)?.group(1);
            pendingLanguage = RegExp(r'tvg-language="([^"]+)"').firstMatch(line)?.group(1);
            pendingGeoBlocked = line.toLowerCase().contains('[geo-blocked]') ||
                (entry.key == 'free-tv' && line.contains('Ⓖ'));
          } else if (line.isNotEmpty && !line.startsWith('#')) {
            if (pendingGeoBlocked) {
              pendingId = null;
              pendingName = null;
              pendingLogo = null;
              pendingCountry = null;
              pendingLanguage = null;
              pendingGeoBlocked = false;
              continue;
            }
            final uri = Uri.tryParse(line);
            final streamName = pendingName?.trim();
            final identity = (pendingId?.trim().isNotEmpty == true ? pendingId!.trim() : streamName ?? '');
            if (identity.isNotEmpty && uri != null &&
                (uri.scheme == 'https' || uri.scheme == 'http') &&
                uri.host.isNotEmpty &&
                (pendingId == null || !blocked.contains(pendingId)) &&
                seen.add('$identity|$line')) {
              count++;
              final index = pendingId == null ? null : known[pendingId];
              // Expand the browsable catalogue with distinct public-feed entries. Keep
              // provenance in IDs and do not label these as subscription-approved.
              if (importedUrls.add(line) && streamName != null && streamName.isNotEmpty) {
                final sourceKey = entry.key.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '-');
                final safeId = identity.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '-');
                final rawCountry = pendingCountry?.trim() ?? '';
                final validCountry = rawCountry.length == 2 && rawCountry.codeUnits.every((unit) =>
                    (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122));
                imported.add(Channel('feed-$sourceKey-$safeId-${imported.length}',
                    streamName, pendingLogo ?? '', validCountry ? rawCountry.toUpperCase() : 'INT', [line],
                    languages: pendingLanguage == null ? const [] : pendingLanguage.split(';')
                        .map((value) => value.trim()).where((value) => value.isNotEmpty).toList()));
              }
              if (pendingId != null && approvedFreeTvIds.contains(pendingId) && index != null &&
                  approvedUrls.putIfAbsent(pendingId, () => parsed[index].urls.toSet()).add(line)) {
                final ch = parsed[index];
                parsed[index] = Channel(ch.id, ch.name, ch.logo, ch.country,
                    List.unmodifiable([...ch.urls, line]),
                    categories: ch.categories, languages: ch.languages);
              }
            }
            pendingId = null;
            pendingName = null;
            pendingLogo = null;
            pendingCountry = null;
            pendingLanguage = null;
            pendingGeoBlocked = false;
          }
        }
        nextDiscoveredBySource[entry.key] = count;
      }
      discoveredBySource..clear()..addAll(nextDiscoveredBySource);
      discoveredFreeTv = discoveredBySource['free-tv'] ?? 0;
      // Imported public feeds are clearly source-tagged and remain separate from
      // payment-API approved entries; deduplicate by stream URL before publishing.
      parsed.addAll(imported);
      // Merge only backend-approved catalogue additions, deduplicated against existing URLs.
      try {
        final knownUrls = parsed.expand((channel) => channel.urls).toSet();
        for (final channel in await _approvedCatalogue()) {
          if (knownUrls.add(channel.urls.first)) parsed.add(channel);
        }
      } catch (e) { debugPrint('Approved catalogue unavailable; retaining existing channels: $e'); }
      approvedImportedCount = parsed.where((channel) => channel.id.startsWith('approved-')).length;
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
