import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:xml/xml.dart';

class EpgProgramme {
  final String title;
  final DateTime start;
  final DateTime stop;
  const EpgProgramme(this.title, this.start, this.stop);
}

class EpgService {
  EpgService._();
  static final EpgService instance = EpgService._();
  static const _codesUrl = 'https://iptv-org.github.io/epg/codes.json';
  List<dynamic>? _codes;
  final Map<String, List<EpgProgramme>> _cache = {};

  Future<List<EpgProgramme>> programmesFor(String channelId) async {
    if (_cache.containsKey(channelId)) return _cache[channelId]!;
    final codes = await _loadCodes();
    Map<String, dynamic>? entry;
    for (final item in codes) {
      if (item is Map && (item['tvg_id'] == channelId || item['channel'] == channelId)) {
        entry = Map<String, dynamic>.from(item);
        break;
      }
    }
    if (entry == null) {
      _cache[channelId] = const [];
      return const [];
    }
    final urls = (entry['guides'] as List<dynamic>? ?? const [])
        .whereType<String>().where((url) => Uri.tryParse(url)?.scheme == 'https').toList();
    if (urls.isEmpty) {
      _cache[channelId] = const [];
      return const [];
    }
    Object? lastError;
    for (final url in urls.take(2)) {
      try {
        final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 18));
        if (response.statusCode != 200) continue;
        final document = XmlDocument.parse(response.body);
        final now = DateTime.now().toUtc();
        final matches = <EpgProgramme>[];
        for (final node in document.findAllElements('programme')) {
          if (node.getAttribute('channel') != channelId) continue;
          final start = _parseXmltvTime(node.getAttribute('start') ?? '');
          final stop = _parseXmltvTime(node.getAttribute('stop') ?? '');
          final title = node.findElements('title').firstOrNull?.innerText.trim() ?? '';
          if (start == null || stop == null || title.isEmpty || stop.isBefore(now)) continue;
          matches.add(EpgProgramme(title, start, stop));
        }
        matches.sort((a, b) => a.start.compareTo(b.start));
        _cache[channelId] = List.unmodifiable(matches.take(8));
        return _cache[channelId]!;
      } catch (e) {
        lastError = e;
      }
    }
    if (lastError != null) throw StateError('Could not load EPG schedule: $lastError');
    _cache[channelId] = const [];
    return const [];
  }

  Future<List<dynamic>> _loadCodes() async {
    if (_codes != null) return _codes!;
    final response = await http.get(Uri.parse(_codesUrl)).timeout(const Duration(seconds: 18));
    if (response.statusCode != 200) throw StateError('TV guide index unavailable (HTTP ${response.statusCode})');
    _codes = jsonDecode(response.body) as List<dynamic>;
    return _codes!;
  }

  DateTime? _parseXmltvTime(String value) {
    final match = RegExp(r'^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?').firstMatch(value.trim());
    if (match == null) return null;
    try {
      var time = DateTime.utc(
        int.parse(match.group(1)!), int.parse(match.group(2)!), int.parse(match.group(3)!),
        int.parse(match.group(4)!), int.parse(match.group(5)!), int.parse(match.group(6)!),
      );
      final sign = match.group(7);
      if (sign != null) {
        final offset = Duration(hours: int.parse(match.group(8)!), minutes: int.parse(match.group(9)!));
        time = sign == '+' ? time.subtract(offset) : time.add(offset);
      }
      return time;
    } catch (_) { return null; }
  }
}
