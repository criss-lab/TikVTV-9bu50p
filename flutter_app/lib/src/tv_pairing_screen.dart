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
  bool starting = false;
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
      if (result['device_token'] is String) {
        timer?.cancel();
        await NativeBackend.instance.setTvDeviceToken(result['device_token'] as String);
        if (mounted && current == generation) Navigator.pop(context, true);
      } else if (result['already_claimed'] == true) {
        timer?.cancel();
        setState(() { pairing = null; message = 'This pairing was already claimed. Generate a new QR code.'; });
      }
    } catch(e) { if (mounted && current == generation) { timer?.cancel(); setState(() { pairing = null; message = e.toString(); }); } }
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
      if (message != null) Text(message!, style: const TextStyle(color: Colors.orangeAccent)),
      const SizedBox(height: 18),
      OutlinedButton.icon(onPressed: starting ? null : start, icon: const Icon(Icons.refresh), label: Text(starting ? 'Generating QR code…' : 'Generate new QR code')),
    ]))));
  }
}
