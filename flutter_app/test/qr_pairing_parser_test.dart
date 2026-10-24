import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/qr_pairing_parser.dart';

void main() {
  final challenge = 'A' * 43;
  test('accepts only the exact trusted TV pairing QR', () {
    expect(QrPairingParser.challenge('https://streamora.co.ke/tv-pair?challenge=$challenge'), challenge);
    expect(QrPairingParser.challenge('https://www.streamora.co.ke/tv-pair?challenge=$challenge'), challenge);
  });
  test('rejects generic, malicious and malformed QR content', () {
    for (final value in [
      'hello world', 'WIFI:T:WPA;S:example;P:password;;',
      'http://streamora.co.ke/tv-pair?challenge=$challenge',
      'https://streamora.co.ke.evil.test/tv-pair?challenge=$challenge',
      'https://streamora.co.ke@evil.test/tv-pair?challenge=$challenge',
      'https://streamora.co.ke:444/tv-pair?challenge=$challenge',
      'https://streamora.co.ke/tv-pair?challenge=short',
      'https://streamora.co.ke/tv-pair?challenge=$challenge&challenge=$challenge',
      'https://streamora.co.ke/tv-pair?challenge=$challenge&redirect=https://evil.test',
      'https://streamora.co.ke/tv-pair?challenge=$challenge#fragment',
    ]) {
      expect(QrPairingParser.challenge(value), isNull, reason: value);
    }
  });
}
