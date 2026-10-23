import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'tv_pairing_api.dart';

class PhoneTvConnectScreen extends StatefulWidget {
  const PhoneTvConnectScreen({super.key});
  @override
  State<PhoneTvConnectScreen> createState() => _PhoneTvConnectScreenState();
}
class _PhoneTvConnectScreenState extends State<PhoneTvConnectScreen> with WidgetsBindingObserver {
  final MobileScannerController scannerController = MobileScannerController(autoStart: false, facing: CameraFacing.back, detectionSpeed: DetectionSpeed.noDuplicates);
  final manualLink = TextEditingController();
  bool scannerStarting = false;
  String? scannerFailure;
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!scanning || kIsWeb) return;
    if (state == AppLifecycleState.resumed) { _startScanner(); }
    else if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) { scannerController.stop(); }
  }
  Future<void> _startScanner() async {
    if (!mounted || !scanning || scannerStarting) return;
    scannerStarting = true;
    try {
      await scannerController.stop();
      if (!mounted || !scanning) return;
      await scannerController.start();
      if (mounted) setState(() => scannerFailure = null);
    } catch (e) {
      debugPrint('TV pairing scanner start failed: $e');
      if (mounted) setState(() => scannerFailure = 'Camera initialization failed. You can retry or enter the TV pairing link manually.');
    } finally { scannerStarting = false; }
  }
  Future<void> _stopScanner() async { await scannerController.stop(); }
  void _openScanner() { setState(() { scanning = true; scannerFailure = null; message = null; }); WidgetsBinding.instance.addPostFrameCallback((_) => _startScanner()); }
  Future<void> _retryScanner() async { await _stopScanner(); if (mounted) _startScanner(); }
  void _acceptLink(String input) {
    final uri = Uri.tryParse(input.trim());
    if (uri?.scheme != 'https' || !['streamora.co.ke','www.streamora.co.ke'].contains(uri?.host) || uri?.path != '/tv-pair') { setState(() => message = 'Enter the complete HTTPS pairing link shown on your TV.'); return; }
    final value = uri!.queryParameters['challenge'];
    if (value == null || value.length != 43 || !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value)) {
      setState(() => message = 'Invalid TV pairing challenge. Generate a fresh link on your TV.');
      return;
    }
    code.clear();
    setState(() { challenge = value; scanning = false; message = null; });
    _stopScanner();
  }
  String? challenge, pairingId, message;
  bool scanning = false, busy = false;
  bool sending = false;
  List<Map<String, dynamic>> devices = [];
  final code = TextEditingController();
  @override
  void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); load(); }
  @override
  void dispose() { WidgetsBinding.instance.removeObserver(this); scannerController.dispose(); manualLink.dispose(); code.dispose(); super.dispose(); }
  Future<void> load() async {
    try { final result = await TvPairingApi.devices(); if (mounted) setState(() => devices = result); }
    catch (e) { if (mounted) setState(() => message = e.toString()); }
  }
  void scan(BarcodeCapture capture) {
    if (!mounted || !scanning || challenge != null) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value != null) {
        final uri = Uri.tryParse(value.trim());
        if (uri?.scheme == 'https' && ['streamora.co.ke','www.streamora.co.ke'].contains(uri?.host) && uri?.path == '/tv-pair' && RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(uri?.queryParameters['challenge'] ?? '')) { _acceptLink(value); return; }
      }
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
    return Scaffold(appBar: AppBar(title: const Text('Connect Android TV')), body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 680), child: ListView(padding: const EdgeInsets.all(20), children: [
      Container(padding: const EdgeInsets.all(22), decoration: BoxDecoration(gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF382039), Color(0xFF172C36)]), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFF594253))), child: const Column(children: [Icon(Icons.connected_tv, color: Color(0xFF32CED0), size: 46), SizedBox(height: 12), Text('Your TV, your phone', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800)), SizedBox(height: 8), Text('Open Connect phone on TikVTV TV, scan its QR code and confirm the six-digit number. Your account and remote will be linked securely.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, height: 1.4))])),
      const SizedBox(height: 20),
      if (kIsWeb) const Padding(padding: EdgeInsets.only(bottom: 12), child: Text('On web, allow camera access in your browser. Use HTTPS and a device with a camera.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70))),
      if (scanning) ...[
        SizedBox(height: 290, child: MobileScanner(controller: scannerController, onDetect: scan, errorBuilder: (context, error, child) => Center(child: Padding(padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.no_photography_outlined, size: 42, color: Colors.orangeAccent),
          const SizedBox(height: 12),
          Text(error.errorCode == MobileScannerErrorCode.permissionDenied
              ? 'Camera permission was denied. Allow Camera for TikVTV in Android Settings, then return and retry.'
              : 'Unable to start the camera. Close other camera apps and retry. Details: ${error.errorCode.name}', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: _retryScanner, icon: const Icon(Icons.refresh), label: const Text('Retry camera')),
        ]))))),
        if (scannerFailure != null) Padding(padding: const EdgeInsets.all(8), child: Text(scannerFailure!, textAlign: TextAlign.center)),
        TextButton.icon(onPressed: () { _stopScanner(); setState(() { scanning = false; message = null; }); }, icon: const Icon(Icons.close), label: const Text('Close scanner')),
      ],
      if (!scanning && challenge == null) FilledButton.icon(onPressed: _openScanner, icon: const Icon(Icons.qr_code_scanner), label: const Text('Scan TV QR code')),
      if (challenge == null) ...[
        const SizedBox(height: 12),
        const Text('Camera not working? Enter the pairing link displayed on your TV instead.', textAlign: TextAlign.center),
        TextField(controller: manualLink, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(labelText: 'TV pairing link', hintText: 'https://streamora.co.ke/tv-pair?challenge=…')),
        TextButton.icon(onPressed: () => _acceptLink(manualLink.text), icon: const Icon(Icons.link), label: const Text('Continue with pairing link')),
      ],
      if (challenge != null) ...[
        const SizedBox(height: 12),
        const Text('Confirm the six-digit number displayed on your TV before connecting.'),
        TextField(controller: code, maxLength: 6, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], textInputAction: TextInputAction.done, onSubmitted: (_) => approve(), decoration: const InputDecoration(labelText: 'TV confirmation code')),
        FilledButton(onPressed: busy ? null : approve, child: Text(busy ? 'Connecting…' : 'Confirm and connect TV')),
        TextButton(onPressed: () => setState(() { challenge = null; code.clear(); message = null; }), child: const Text('Cancel')),
      ],
      if (message != null) Padding(padding: const EdgeInsets.all(12), child: Text(message!, textAlign: TextAlign.center)),
      const Divider(height: 32),
      const Row(children: [Icon(Icons.devices, color: Color(0xFF32CED0)), SizedBox(width: 10), Text('Connected TVs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))]),
      if (devices.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 18), child: Text('No TVs linked yet. Scan the QR code on your TV to get started.', style: TextStyle(color: Colors.white60))),
      for (final device in devices) ListTile(title: Text('TikVTV TV · ${device['display_code']}'), subtitle: const Text('Tap to use as remote'), onTap: () => setState(() => pairingId = device['id'] as String), trailing: IconButton(tooltip: 'Disconnect TV', icon: const Icon(Icons.link_off), onPressed: () async { try { await TvPairingApi.revoke(device['id'] as String); if (mounted) { setState(() => pairingId = null); await load(); } } catch (e) { if (mounted) setState(() => message = 'Could not disconnect TV: $e'); } })),
      if (current != null) ...[
        const SizedBox(height: 12),
        const Text('Phone remote', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const Padding(padding: EdgeInsets.only(bottom: 14, top: 5), child: Text('Tap to navigate your TV', textAlign: TextAlign.center, style: TextStyle(color: Colors.white60))),
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
    ]))));
  }
}
