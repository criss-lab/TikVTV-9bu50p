/// Strictly separates QR detection from trusted TV-pairing authorization.
/// Never interpret an arbitrary QR payload as an authenticated command.
class QrPairingParser {
  static final RegExp _challenge = RegExp(r'^[A-Za-z0-9_-]{43}$');
  static String? challenge(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null || uri.scheme != 'https' ||
        (uri.host != 'streamora.co.ke' && uri.host != 'www.streamora.co.ke') ||
        uri.path != '/tv-pair' || uri.userInfo.isNotEmpty || uri.hasPort ||
        uri.fragment.isNotEmpty || uri.queryParametersAll.length != 1 ||
        uri.queryParametersAll['challenge']?.length != 1) return null;
    final value = uri.queryParameters['challenge'];
    return value != null && _challenge.hasMatch(value) ? value : null;
  }
}
