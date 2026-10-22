import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'native_backend.dart';
import 'tv_pairing_api.dart';

class TvPairingScreen extends StatefulWidget {
  const TvPairingScreen({super.key});
  @override
  State<TvPairingScreen> createState() => _TvPairingScreenState();
}
class _TvPairingScreenState extends State<TvPairingScreen> {
  Map<String, dynamic>? pairing;
  Timer? timer;
  bool polling = false;
  DateTime? expiresAt;
  int generation = 0;
  int get secondsLeft => expiresAt == null ? 0 : expiresAt!.difference(DateTime.now()).inSeconds.clamp(0, 300);
  String? message;
  @override
  void initState() { super.initState(); unawaited(start()); }
  @override
  void dispose() { timer?.cancel(); super.dispose(); }
  Future<void> start() async {
    timer?.cancel();
    final current = ++generation;
    if (mounted) setState(() { pairing = null; message = null; expiresAt = null; });
    try {
      final data = await TvPairingApi.start();
      if (!mounted || current != generation) return;
      setState(() { pairing = data; expiresAt = DateTime.now().add(Duration(seconds: (data['expires_in_seconds'] as num?)?.toInt() ?? 300)); });
      timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        if (secondsLeft == 0) { timer?.cancel(); setState(() { pairing = null; message = 'Pairing expired. Generate a fresh QR code.'; }); return; }
        setState(() {});
        if (secondsLeft % 3 == 0) unawaited(poll());
      });
    } catch(e) { if (mounted) setState(() => message = e.toString()); }
  }
  Future<void> poll() async {
    if (polling || pairing == null || secondsLeft == 0) return;
    final current = generation;
    polling = true;
    try {
      final result = await TvPairingApi.status(pairing!['poll_token'] as String);
      if (!mounted || current != generation) return;
      if (result['device_token'] is String) {
        timer?.cancel();
        await NativeBackend.instance.setTvDeviceToken(result['device_token'] as String);
        if (mounted) Navigator.pop(context, true);
      } else if (result['already_claimed'] == true) {
        timer?.cancel();
        setState(() => message = 'This pairing was already claimed. Generate a new QR code.');
      }
    } catch(e) { if (mounted && current == generation) { timer?.cancel(); setState(() { pairing = null; message = e.toString(); }); } }
    finally { polling = false; }
  }
  @override
  Widget build(BuildContext context) {
    final challenge = pairing?['challenge'] as String?;
    final url = Uri.https('streamora.co.ke','/tv-pair',{'challenge':challenge ?? ''}).toString();
    return Scaffold(appBar: AppBar(title: const Text('Connect your phone')), body: Center(child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Text('Open TikVTV on your Android phone → Connect TV → Scan QR', style: TextStyle(fontSize: 23)),
      const SizedBox(height: 20),
      if (challenge == null && message == null) const CircularProgressIndicator(),
      if (challenge != null) ...[
        Container(color: Colors.white, padding: const EdgeInsets.all(14), child: QrImageView(data: url, size: 230)),
        const SizedBox(height: 14),
        const Text('Confirm this six-digit code on your phone:', style: TextStyle(fontSize: 18)),
        SelectableText('${pairing!['display_code']}', style: const TextStyle(fontSize: 42, fontWeight: FontWeight.bold, letterSpacing: 8)),
        Text('Expires in ${secondsLeft ~/ 60}:${(secondsLeft % 60).toString().padLeft(2, '0')}. Do not share this code with strangers.'),
      ],
      if (message != null) Text(message!, style: const TextStyle(color: Colors.orangeAccent)),
      const SizedBox(height: 18),
      OutlinedButton.icon(onPressed: start, icon: const Icon(Icons.refresh), label: const Text('Generate new QR code')),
    ]))));
  }
}
