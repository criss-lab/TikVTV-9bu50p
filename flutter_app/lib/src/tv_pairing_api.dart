import 'dart:convert';
import 'package:http/http.dart' as http;
import 'native_backend.dart';

/// The public QR challenge is never an account token or TV polling credential.
class TvPairingApi {
  static const base = String.fromEnvironment('PAYMENT_API_URL',
      defaultValue: 'https://tikvtv-payment-api.onrender.com');
  static Uri uri(String path) => Uri.parse('${base.replaceFirst(RegExp(r'/$'), '')}$path');
  static Future<Map<String, dynamic>> request(String path,
      {String method = 'POST', Map<String, dynamic>? body, String? bearer}) async {
    final headers = <String, String>{'Accept': 'application/json', 'Content-Type': 'application/json',
      if (bearer != null) 'Authorization': 'Bearer $bearer'};
    final response = await (method == 'GET'
      ? http.get(uri(path), headers: headers)
      : http.post(uri(path), headers: headers, body: jsonEncode(body ?? {})))
      .timeout(const Duration(seconds: 20));
    final data = Map<String, dynamic>.from(jsonDecode(response.body) as Map);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError((data['error'] ?? 'TV connection request failed').toString());
    }
    return data;
  }
  static String get phoneToken {
    final backend = NativeBackend.instance;
    if (!backend.signedIn || backend.accessToken == null) {
      throw StateError('Sign in on your phone before pairing a TV.');
    }
    return backend.accessToken!;
  }
  static Future<Map<String, dynamic>> start() => request('/v1/tv/pair/start');
  static Future<Map<String, dynamic>> status(String pollToken) =>
      request('/v1/tv/pair/status', body: {'poll_token': pollToken});
  static Future<Map<String, dynamic>> approve(String challenge, String code) =>
      request('/v1/tv/pair/approve', bearer: phoneToken,
          body: {'challenge': challenge, 'display_code': code});
  static Future<List<Map<String, dynamic>>> devices() async {
    final result = await request('/v1/tv/devices', method: 'GET', bearer: phoneToken);
    return (result['devices'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }
  static Future<void> command(String pairingId, String command) async {
    await request('/v1/tv/remote/send', bearer: phoneToken,
        body: {'pairing_id': pairingId, 'command': command});
  }
  static Future<void> revoke(String pairingId) async {
    await request('/v1/tv/revoke', bearer: phoneToken, body: {'pairing_id': pairingId});
  }
  static Future<Map<String, dynamic>> subscription(String token) =>
      request('/v1/tv/device/subscription', method: 'GET', bearer: token);
  static Future<List<Map<String, dynamic>>> pollCommands(String token, int after) async {
    final response = await http.get(uri('/v1/tv/remote/poll?after=$after'),
        headers: {'Authorization': 'Bearer $token'}).timeout(const Duration(seconds: 15));
    final data = Map<String, dynamic>.from(jsonDecode(response.body) as Map);
    if (response.statusCode != 200) throw StateError((data['error'] ?? 'Remote disconnected').toString());
    return (data['commands'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }
}
