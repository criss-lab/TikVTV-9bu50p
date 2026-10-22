import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Account sign-in remains with the existing identity provider; payments and entitlements
/// are exclusively handled by the Render API backed by Neon and Pesapal.
class NativeBackend extends ChangeNotifier {
  NativeBackend._();
  static final NativeBackend instance = NativeBackend._();
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static const String _url = String.fromEnvironment('SUPABASE_URL');
  static const String _key = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const String _paymentApi = String.fromEnvironment('PAYMENT_API_URL', defaultValue: 'https://tikvtv-payment-api.onrender.com');
  bool get configured => _url.startsWith('https://') && _key.isNotEmpty;
  String? accessToken;
  String? tvDeviceToken;
  bool get tvPaired => tvDeviceToken != null;
  Future<void> restoreTvDevice() async {
    tvDeviceToken = await _secureStorage.read(key: 'tikvtv_tv_device_token');
    notifyListeners();
  }
  Future<void> setTvDeviceToken(String token) async {
    await _secureStorage.write(key: 'tikvtv_tv_device_token', value: token);
    tvDeviceToken = token;
    notifyListeners();
  }
  Future<void> clearTvDevice() async {
    await _secureStorage.delete(key: 'tikvtv_tv_device_token');
    tvDeviceToken = null;
    notifyListeners();
  }
  Future<Map<String, dynamic>> tvViewingAccess(String channelId) async {
    final token = tvDeviceToken;
    if (token == null) throw StateError('TV not paired');
    final uri = _paymentUri('/v1/tv/device/viewing-access').replace(queryParameters: {'channel_id': channelId});
    final response = await http.get(uri, headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw StateError(_message(response.body, 'TV pairing expired'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  String? refreshToken;
  Map<String, dynamic>? user;
  bool get signedIn => accessToken != null && user != null;
  String? get email => user?['email'] as String?;
  Uri _uri(String path, [Map<String, String>? query]) {
    final base = _url.endsWith('/') ? _url.substring(0, _url.length - 1) : _url;
    return Uri.parse('$base$path').replace(queryParameters: query);
  }
  Uri _paymentUri(String path) => Uri.parse(_paymentApi.replaceAll(RegExp(r'/$'), '') + path);
  Map<String, String> get _headers => {
    'apikey': _key, 'Content-Type': 'application/json',
    if (accessToken != null) 'Authorization': 'Bearer $accessToken',
  };
  Map<String, String> get _paymentHeaders => {
    'Accept': 'application/json', 'Content-Type': 'application/json',
    if (accessToken != null) 'Authorization': 'Bearer $accessToken',
  };
  Future<void> restore() async {
    if (!configured) return;
    final prefs = await SharedPreferences.getInstance();
    // Migrate legacy session tokens out of ordinary preferences into Android Keystore-backed storage.
    accessToken = await _secureStorage.read(key: 'native_supabase_access');
    refreshToken = await _secureStorage.read(key: 'native_supabase_refresh');
    if (accessToken == null || refreshToken == null) {
      final legacyAccess = prefs.getString('native_supabase_access');
      final legacyRefresh = prefs.getString('native_supabase_refresh');
      if (legacyAccess != null && legacyRefresh != null) {
        await _secureStorage.write(key: 'native_supabase_access', value: legacyAccess);
        await _secureStorage.write(key: 'native_supabase_refresh', value: legacyRefresh);
        await prefs.remove('native_supabase_access');
        await prefs.remove('native_supabase_refresh');
        accessToken = legacyAccess;
        refreshToken = legacyRefresh;
      } else {
        // Never retain a half-restored session with no refresh credential.
        await _secureStorage.delete(key: 'native_supabase_access');
        await _secureStorage.delete(key: 'native_supabase_refresh');
        accessToken = null;
        refreshToken = null;
      }
    }
    final rawUser = prefs.getString('native_supabase_user');
    if (rawUser != null) { try { user = Map<String, dynamic>.from(jsonDecode(rawUser) as Map); } catch (_) { user = null; } }
    if (accessToken != null && refreshToken != null) { try { await _refreshSession(); } catch (_) { await signOut(); } }
    notifyListeners();
  }
  Future<void> _saveSession(Map<String, dynamic> data) async {
    final token = data['access_token']; final refresh = data['refresh_token']; final profile = data['user'];
    if (token is! String || refresh is! String || profile is! Map) throw StateError('Email confirmation may be required. Check your inbox, then sign in.');
    accessToken = token; refreshToken = refresh; user = Map<String, dynamic>.from(profile);
    final prefs = await SharedPreferences.getInstance();
    await _secureStorage.write(key: 'native_supabase_access', value: token);
    await _secureStorage.write(key: 'native_supabase_refresh', value: refresh);
    await prefs.setString('native_supabase_user', jsonEncode(user));
    notifyListeners();
  }
  Future<void> _refreshSession() async {
    final response = await http.post(_uri('/auth/v1/token', {'grant_type': 'refresh_token'}), headers: {'apikey': _key, 'Content-Type': 'application/json'}, body: jsonEncode({'refresh_token': refreshToken})).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) throw StateError('Session expired');
    await _saveSession(Map<String, dynamic>.from(jsonDecode(response.body) as Map));
  }
  Future<void> signIn(String email, String password) async {
    _requireConfig();
    final response = await http.post(_uri('/auth/v1/token', {'grant_type': 'password'}), headers: {'apikey': _key, 'Content-Type': 'application/json'}, body: jsonEncode({'email': email.trim(), 'password': password})).timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) throw StateError(_message(response.body, 'Sign-in failed'));
    await _saveSession(Map<String, dynamic>.from(jsonDecode(response.body) as Map));
  }
  Future<void> requestSignupOtp(String email) async {
    _requireConfig();
    final response = await http.post(_uri('/auth/v1/otp'), headers: {'apikey': _key, 'Content-Type': 'application/json'}, body: jsonEncode({'email': email.trim(), 'create_user': true})).timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Could not send verification code'));
  }
  Future<void> verifySignupOtp(String email, String code, String password, String username) async {
    _requireConfig();
    final response = await http.post(_uri('/auth/v1/verify'), headers: {'apikey': _key, 'Content-Type': 'application/json'}, body: jsonEncode({'email': email.trim(), 'token': code.trim(), 'type': 'email'})).timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) throw StateError(_message(response.body, 'Email verification failed'));
    await _saveSession(Map<String, dynamic>.from(jsonDecode(response.body) as Map));
    final update = await http.put(_uri('/auth/v1/user'), headers: _headers, body: jsonEncode({'password': password, 'data': {'username': username.trim()}})).timeout(const Duration(seconds: 20));
    if (update.statusCode < 200 || update.statusCode >= 300) throw StateError(_message(update.body, 'Email verified but profile setup failed. Sign in and try again.'));
    user = {...?user, ...Map<String, dynamic>.from(jsonDecode(update.body) as Map)};
    final prefs = await SharedPreferences.getInstance(); await prefs.setString('native_supabase_user', jsonEncode(user)); notifyListeners();
  }
  Future<void> signOut() async {
    if (configured && accessToken != null) { try { await http.post(_uri('/auth/v1/logout'), headers: _headers).timeout(const Duration(seconds: 8)); } catch (_) {} }
    accessToken = null; refreshToken = null; user = null;
    await _secureStorage.delete(key: 'native_supabase_access');
    await _secureStorage.delete(key: 'native_supabase_refresh');
    final prefs = await SharedPreferences.getInstance(); await prefs.remove('native_supabase_access'); await prefs.remove('native_supabase_refresh'); await prefs.remove('native_supabase_user'); notifyListeners();
  }
  Future<List<Map<String, dynamic>>> trending({int limit = 30}) async {
    _requireConfig();
    final since = DateTime.now().toUtc().subtract(const Duration(hours: 24)).toIso8601String();
    Future<List<dynamic>> rows(String table) async {
      final uri = _uri('/rest/v1/$table', {'select':'channel_id', 'created_at':'gte.$since', 'limit':'5000'});
      final response = await http.get(uri, headers: _headers).timeout(const Duration(seconds: 20));
      if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Trending data unavailable'));
      return jsonDecode(response.body) as List<dynamic>;
    }
    final results = await Future.wait([rows('reactions'), rows('comments')]); final scores = <String, int>{};
    for (final row in results[0]) { if (row is Map && row['channel_id'] is String) scores[row['channel_id'] as String] = (scores[row['channel_id'] as String] ?? 0) + 2; }
    for (final row in results[1]) { if (row is Map && row['channel_id'] is String) scores[row['channel_id'] as String] = (scores[row['channel_id'] as String] ?? 0) + 1; }
    final sorted = scores.entries.toList()..sort((a,b) => b.value.compareTo(a.value));
    return sorted.take(limit).map((e) => {'channel_id':e.key,'score':e.value}).toList();
  }
  Future<bool> hasPlaybackEntitlement() async => (await premiumStatus())['active'] == true;
  Future<Map<String, dynamic>> viewingAccess(String channelId) async {
    _requireSignedIn();
    final uri = _paymentUri('/v1/viewing-access').replace(queryParameters: {'channel_id': channelId});
    final response = await http.get(uri, headers: _paymentHeaders).timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Could not check viewing access'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  Future<Map<String, dynamic>> premiumStatus() async {
    _requireSignedIn();
    final response = await http.get(_paymentUri('/v1/subscription'), headers: _paymentHeaders).timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Could not check subscription'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  Future<Map<String, dynamic>> initiatePremium({String planCode = 'month'}) async {
    _requireSignedIn();
    final response = await http.post(_paymentUri('/v1/checkout'), headers: _paymentHeaders, body: jsonEncode({'plan_code': planCode})).timeout(const Duration(seconds: 25));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Secure checkout unavailable'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  Future<Map<String, dynamic>> checkPayment(String trackingId) async {
    _requireSignedIn();
    final response = await http.post(_paymentUri('/v1/payment/status'), headers: _paymentHeaders, body: jsonEncode({'order_tracking_id': trackingId})).timeout(const Duration(seconds: 25));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'Payment verification failed'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  Future<Map<String, dynamic>> tvRequest(String path, Map<String, dynamic> body, {String? tvSecret, bool authenticated = false}) async {
    if (authenticated) _requireSignedIn();
    final response = await http.post(_paymentUri('/v1/tv/$path'), headers: {
      'Content-Type': 'application/json', 'Accept': 'application/json',
      if (authenticated && accessToken != null) 'Authorization': 'Bearer $accessToken',
      if (tvSecret != null) 'X-TV-Pairing-Secret': tvSecret,
    }, body: jsonEncode(body)).timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) throw StateError(_message(response.body, 'TV connection unavailable'));
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
  void _requireConfig() { if (!configured) throw StateError('Native account services are not configured in this APK build.'); }
  void _requireSignedIn() { _requireConfig(); if (!signedIn) throw StateError('Sign in to your TikVTV account first.'); }
  String _message(String body, String fallback) {
    try { final data = jsonDecode(body); if (data is Map) { for (final key in ['msg','message','error_description','error']) { if (data[key] is String && (data[key] as String).isNotEmpty) return data[key] as String; } } } catch (_) {}
    return fallback;
  }
}
