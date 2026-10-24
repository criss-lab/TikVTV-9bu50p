import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'native_backend.dart';
import 'tv_pairing_api.dart';
import 'qr_pairing_parser.dart';

class TvPairingScreen extends StatefulWidget {
  const TvPairingScreen({super.key});
  @override
  State<TvPairingScreen> createState() => _TvPairingScreenState();
}
class _TvPairingScreenState extends State<TvPairingScreen> {
  Map<String, dynamic>? pairing;
  Timer? timer;
  bool polling = false;
  bool starting = false;
  int consecutivePollFailures = 0;
  String? connectionWarning;
  DateTime? expiresAt;
  int generation = 0;
  int get secondsLeft => expiresAt == null ? 0 : expiresAt!.difference(DateTime.now()).inSeconds.clamp(0, 300);
  String? message;
  @override
  void initState() { super.initState(); unawaited(start()); }
  @override
  void dispose() { generation++; timer?.cancel(); super.dispose(); }
  Future<void> start() async {
    if (starting) return;
    starting = true;
    timer?.cancel();
    final current = ++generation;
    if (mounted) setState(() { pairing = null; message = null; connectionWarning = null; consecutivePollFailures = 0; expiresAt = null; });
    try {
      final data = await TvPairingApi.start();
      if (!mounted || current != generation) return;
      final challenge = data['challenge'];
      final pollToken = data['poll_token'];
      final displayCode = data['display_code']?.toString();
      if (challenge is! String || QrPairingParser.challenge(Uri.https('streamora.co.ke', '/tv-pair', {'challenge': challenge}).toString()) != challenge ||
          pollToken is! String || pollToken.isEmpty || displayCode == null || !RegExp(r'^\\d{6}
      timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        if (secondsLeft == 0) { timer?.cancel(); setState(() { pairing = null; message = 'Pairing expired. Generate a fresh QR code.'; }); return; }
        setState(() {});
        if (secondsLeft % 3 == 0) unawaited(poll());
      });
    } catch(e) { if (mounted && current == generation) setState(() => message = 'Could not generate the TV QR code: $e'); }
    finally { starting = false; }
  }
  Future<void> poll() async {
    if (polling || pairing == null || secondsLeft == 0) return;
    final current = generation;
    polling = true;
    try {
      final result = await TvPairingApi.status(pairing!['poll_token'] as String);
      if (!mounted || current != generation) return;
      consecutivePollFailures = 0;
      if (connectionWarning != null) setState(() => connectionWarning = null);
      if (result['device_token'] is String && (result['device_token'] as String).isNotEmpty) {
        timer?.cancel();
        await NativeBackend.instance.setTvDeviceToken(result['device_token'] as String);
        if (mounted && current == generation) Navigator.pop(context, true);
      } else if (result['already_claimed'] == true) {
        timer?.cancel();
        setState(() { pairing = null; message = 'This pairing was already claimed. Generate a new QR code.'; });
      }
    } catch(e) {
      // A dropped request must not destroy a valid, unexpired pairing QR.
      if (mounted && current == generation) {
        consecutivePollFailures++;
        if (consecutivePollFailures >= 2) setState(() => connectionWarning = 'Connection interrupted. Retrying automatically while this QR remains valid.');
      }
    }
    finally { polling = false; }
  }
  @override
  Widget build(BuildContext context) {
    final challenge = pairing?['challenge'] as String?;
    final url = Uri.https('streamora.co.ke','/tv-pair',{'challenge':challenge ?? ''}).toString();
    return Scaffold(appBar: AppBar(title: const Text('Connect your phone')), body: Center(child: SingleChildScrollView(padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.phonelink, color: Color(0xFF32CED0), size: 45),
      const SizedBox(height: 12),
      const Text('Connect your phone', style: TextStyle(fontSize: 29, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      const Text('Open TikVTV on your Android phone → Connect TV → Scan QR', style: TextStyle(fontSize: 18, color: Colors.white70)),
      const SizedBox(height: 20),
      if (challenge == null && message == null) const CircularProgressIndicator(),
      if (challenge != null) ...[
        Container(decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: Color(0x4432CED0), blurRadius: 25)]), padding: const EdgeInsets.all(24), child: QrImageView(data: url, size: 320, backgroundColor: Colors.white, eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black), dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black), errorCorrectionLevel: QrErrorCorrectLevel.H)),
        const SizedBox(height: 14),
        const Text('Hold your phone steady, point its camera at the entire square, and avoid screen glare.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
        const SizedBox(height: 12),
        const Text('Confirm this six-digit code on your phone:', style: TextStyle(fontSize: 18, color: Colors.white70)),
        SelectableText('${pairing!['display_code']}', style: const TextStyle(fontSize: 42, fontWeight: FontWeight.bold, letterSpacing: 8)),
        Text('Expires in ${secondsLeft ~/ 60}:${(secondsLeft % 60).toString().padLeft(2, '0')}. Do not share this code with strangers.'),
      ],
      if (connectionWarning != null) Padding(padding: const EdgeInsets.all(8), child: Text(connectionWarning!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.orangeAccent))),
      if (message != null) Text(message!, style: const TextStyle(color: Colors.orangeAccent)),
      const SizedBox(height: 18),
      OutlinedButton.icon(onPressed: starting ? null : start, icon: const Icon(Icons.refresh), label: Text(starting ? 'Generating QR code…' : 'Generate new QR code')),
    ]))));
  }
}
).hasMatch(displayCode)) {
        throw const FormatException('Pairing service returned an invalid challenge or confirmation code');
      }
      final lifetime = ((data['expires_in_seconds'] as num?)?.toInt() ?? 300).clamp(1, 300);
      setState(() { pairing = data; expiresAt = DateTime.now().add(Duration(seconds: lifetime)); });
      timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        if (secondsLeft == 0) { timer?.cancel(); setState(() { pairing = null; message = 'Pairing expired. Generate a fresh QR code.'; }); return; }
        setState(() {});
        if (secondsLeft % 3 == 0) unawaited(poll());
      });
    } catch(e) { if (mounted && current == generation) setState(() => message = 'Could not generate the TV QR code: $e'); }
    finally { starting = false; }
  }
  Future<void> poll() async {
    if (polling || pairing == null || secondsLeft == 0) return;
    final current = generation;
    polling = true;
    try {
      final result = await TvPairingApi.status(pairing!['poll_token'] as String);
      if (!mounted || current != generation) return;
      consecutivePollFailures = 0;
      if (connectionWarning != null) setState(() => connectionWarning = null);
      if (result['device_token'] is String && (result['device_token'] as String).isNotEmpty) {
        timer?.cancel();
        await NativeBackend.instance.setTvDeviceToken(result['device_token'] as String);
        if (mounted && current == generation) Navigator.pop(context, true);
      } else if (result['already_claimed'] == true) {
        timer?.cancel();
        setState(() { pairing = null; message = 'This pairing was already claimed. Generate a new QR code.'; });
      }
    } catch(e) {
      // A dropped request must not destroy a valid, unexpired pairing QR.
      if (mounted && current == generation) {
        consecutivePollFailures++;
        if (consecutivePollFailures >= 2) setState(() => connectionWarning = 'Connection interrupted. Retrying automatically while this QR remains valid.');
      }
    }
    finally { polling = false; }
  }
  @override
  Widget build(BuildContext context) {
    final challenge = pairing?['challenge'] as String?;
    final url = Uri.https('streamora.co.ke','/tv-pair',{'challenge':challenge ?? ''}).toString();
    return Scaffold(appBar: AppBar(title: const Text('Connect your phone')), body: Center(child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.phonelink, color: Color(0xFF32CED0), size: 45),
      const SizedBox(height: 12),
      const Text('Connect your phone', style: TextStyle(fontSize: 29, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      const Text('Open TikVTV on your Android phone → Connect TV → Scan QR', style: TextStyle(fontSize: 18, color: Colors.white70)),
      const SizedBox(height: 20),
      if (challenge == null && message == null) const CircularProgressIndicator(),
      if (challenge != null) ...[
        Container(decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: const [BoxShadow(color: Color(0x4432CED0), blurRadius: 25)]), padding: const EdgeInsets.all(18), child: QrImageView(data: url, size: 260)),
        const SizedBox(height: 14),
        const Text('Confirm this six-digit code on your phone:', style: TextStyle(fontSize: 18, color: Colors.white70)),
        SelectableText('${pairing!['display_code']}', style: const TextStyle(fontSize: 42, fontWeight: FontWeight.bold, letterSpacing: 8)),
        Text('Expires in ${secondsLeft ~/ 60}:${(secondsLeft % 60).toString().padLeft(2, '0')}. Do not share this code with strangers.'),
      ],
      if (connectionWarning != null) Padding(padding: const EdgeInsets.all(8), child: Text(connectionWarning!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.orangeAccent))),
      if (message != null) Text(message!, style: const TextStyle(color: Colors.orangeAccent)),
      const SizedBox(height: 18),
      OutlinedButton.icon(onPressed: starting ? null : start, icon: const Icon(Icons.refresh), label: Text(starting ? 'Generating QR code…' : 'Generate new QR code')),
    ]))));
  }
}
