import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'tv_pairing_api.dart';

class PhoneTvConnectScreen extends StatefulWidget {
  const PhoneTvConnectScreen({super.key});
  @override
  State<PhoneTvConnectScreen> createState() => _PhoneTvConnectScreenState();
}
class _PhoneTvConnectScreenState extends State<PhoneTvConnectScreen> {
  String? challenge, pairingId, message;
  bool scanning = false, busy = false;
  bool sending = false;
  List<Map<String, dynamic>> devices = [];
  final code = TextEditingController();
  @override
  void initState() { super.initState(); load(); }
  @override
  void dispose() { code.dispose(); super.dispose(); }
  Future<void> load() async {
    try { final result = await TvPairingApi.devices(); if (mounted) setState(() => devices = result); }
    catch (e) { if (mounted) setState(() => message = e.toString()); }
  }
  void scan(BarcodeCapture capture) {
    if (!mounted || !scanning || challenge != null) return;
    for (final barcode in capture.barcodes) {
      final uri = Uri.tryParse(barcode.rawValue ?? '');
      if (uri?.scheme != 'https' || !['streamora.co.ke','www.streamora.co.ke'].contains(uri?.host) || uri?.path != '/tv-pair') continue;
      final value = uri!.queryParameters['challenge'];
      if (value == null || !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(value)) continue;
      setState(() { challenge = value; scanning = false; message = null; });
      return;
    }
  }
  Future<void> approve() async {
    if (challenge == null || busy || !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) return;
    setState(() { busy = true; message = null; });
    try {
      final result = await TvPairingApi.approve(challenge!, code.text.trim());
      if (!mounted) return;
      setState(() { pairingId = result['pairing_id'] as String; challenge = null; message = 'TV connected. You can now control it from this phone.'; });
      await load();
    } catch(e) { if (mounted) setState(() => message = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> send(String command, String id) async {
    if (sending) return;
    sending = true;
    try { await TvPairingApi.command(id, command); }
    catch(e) { if (mounted) setState(() => message = 'Remote command failed: $e'); }
    finally { sending = false; }
  }
  @override
  Widget build(BuildContext context) {
    final current = pairingId ?? (devices.isNotEmpty ? devices.first['id'] as String : null);
    return Scaffold(appBar: AppBar(title: const Text('Connect Android TV')), body: ListView(padding: const EdgeInsets.all(20), children: [
      const Text('On your TV, choose Connect phone. Scan its QR code here, then enter the six-digit code shown on the TV.', textAlign: TextAlign.center),
      const SizedBox(height: 18),
      if (scanning) ...[
        SizedBox(height: 290, child: MobileScanner(onDetect: scan, errorBuilder: (context, error) => Center(child: Padding(padding: const EdgeInsets.all(16), child: Text('Camera unavailable. Allow camera access in Android settings, then retry.', textAlign: TextAlign.center))))),
        TextButton.icon(onPressed: () => setState(() { scanning = false; message = null; }), icon: const Icon(Icons.close), label: const Text('Close scanner')),
      ],
      if (!scanning && challenge == null) FilledButton.icon(onPressed: () => setState(() { scanning = true; message = null; }), icon: const Icon(Icons.qr_code_scanner), label: const Text('Scan TV QR code')),
      if (challenge != null) ...[
        const SizedBox(height: 12),
        const Text('Confirm the six-digit number displayed on your TV before connecting.'),
        TextField(controller: code, maxLength: 6, keyboardType: TextInputType.number, textInputAction: TextInputAction.done, onSubmitted: (_) => approve(), decoration: const InputDecoration(labelText: 'TV confirmation code')),
        FilledButton(onPressed: busy ? null : approve, child: Text(busy ? 'Connecting…' : 'Confirm and connect TV')),
        TextButton(onPressed: () => setState(() { challenge = null; code.clear(); message = null; }), child: const Text('Cancel')),
      ],
      if (message != null) Padding(padding: const EdgeInsets.all(12), child: Text(message!, textAlign: TextAlign.center)),
      const Divider(height: 32),
      const Text('Connected TVs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      for (final device in devices) ListTile(title: Text('TikVTV TV · ${device['display_code']}'), subtitle: const Text('Tap to use as remote'), onTap: () => setState(() => pairingId = device['id'] as String), trailing: IconButton(tooltip: 'Disconnect TV', icon: const Icon(Icons.link_off), onPressed: () async { await TvPairingApi.revoke(device['id'] as String); if (mounted) { setState(() => pairingId = null); await load(); } })),
      if (current != null) ...[
        const SizedBox(height: 12),
        const Text('Phone remote', textAlign: TextAlign.center, style: TextStyle(fontSize: 20)),
        Center(child: IconButton.filled(onPressed: () => send('up', current), icon: const Icon(Icons.keyboard_arrow_up), iconSize: 36)),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          IconButton.filled(onPressed: () => send('left', current), icon: const Icon(Icons.keyboard_arrow_left), iconSize: 36),
          const SizedBox(width: 12),
          IconButton.filled(onPressed: () => send('select', current), icon: const Icon(Icons.check), iconSize: 32),
          const SizedBox(width: 12),
          IconButton.filled(onPressed: () => send('right', current), icon: const Icon(Icons.keyboard_arrow_right), iconSize: 36),
        ]),
        Center(child: IconButton.filled(onPressed: () => send('down', current), icon: const Icon(Icons.keyboard_arrow_down), iconSize: 36)),
        Wrap(alignment: WrapAlignment.center, spacing: 8, children: [
          OutlinedButton.icon(onPressed: () => send('back', current), icon: const Icon(Icons.arrow_back), label: const Text('Back')),
          OutlinedButton.icon(onPressed: () => send('home', current), icon: const Icon(Icons.home), label: const Text('Home')),
          OutlinedButton.icon(onPressed: () => send('play_pause', current), icon: const Icon(Icons.play_arrow), label: const Text('Play/Pause')),
          OutlinedButton(onPressed: () => send('previous', current), child: const Text('Previous')),
          OutlinedButton(onPressed: () => send('next', current), child: const Text('Next')),
        ]),
      ],
    ]));
  }
}
