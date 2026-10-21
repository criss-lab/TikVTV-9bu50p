import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local-only migration of favorites and watch history. Account sync comes later.
class ChannelLibrary extends ChangeNotifier {
  static final ChannelLibrary _instance = ChannelLibrary._();
  factory ChannelLibrary() => _instance;
  ChannelLibrary._();

  final Set<String> _favorites = {};
  final List<String> _history = [];
  Future<void>? _pending;
  bool _loaded = false;

  bool isFavorite(String id) => _favorites.contains(id);
  bool wasWatched(String id) => _history.contains(id);
  List<String> get history => List.unmodifiable(_history);

  Future<void> load() => _pending ??= _hydrate().whenComplete(() => _pending = null);

  Future<void> _hydrate() async {
    if (_loaded) { return; }
    _loaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      _favorites.addAll(prefs.getStringList('favorites_v1') ?? const []);
      final stored = prefs.getString('history_v1');
      if (stored != null) { _history.addAll(List<String>.from(jsonDecode(stored) as List)); }
      notifyListeners();
    } catch (e) { debugPrint('Library cache read failed: $e'); }
  }

  Future<void> toggleFavorite(String id) async {
    await load();
    if (!_favorites.add(id)) { _favorites.remove(id); }
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('favorites_v1', _favorites.toList());
    } catch (e) { debugPrint('Favorite save failed: $e'); }
  }

  Future<void> clearHistory() async {
    await load();
    _history.clear();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('history_v1', jsonEncode(_history));
    } catch (e) { debugPrint('History clear failed: $e'); }
  }

  Future<void> recordWatch(String id) async {
    await load();
    _history.remove(id);
    _history.insert(0, id);
    if (_history.length > 100) { _history.removeRange(100, _history.length); }
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('history_v1', jsonEncode(_history));
    } catch (e) { debugPrint('History save failed: $e'); }
  }
}
