import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
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
  final manualLink = TextEditingController();
  int scannerSession = 0;
  bool requestingCamera = false;
  bool cameraBlocked = false;
  bool acceptingQr = false;
  bool scannerFailed = false;
  @override
  void initState() { super.initState(); load(); }
  @override
  void dispose() { code.dispose(); manualLink.dispose(); super.dispose(); }
  Future<void> load() async {
    try { final result = await TvPairingApi.devices(); if (mounted) setState(() => devices = result); }
    catch (e) { if (mounted) setState(() => message = e.toString()); }
  }
  Future<void> openScanner() async {
    if (requestingCamera || (scanning && !scannerFailed) || challenge != null) return;
    if (scannerFailed && mounted) setState(() { scanning = false; scannerFailed = false; });
    if (kIsWeb) {
      setState(() { scanning = true; scannerFailed = false; scannerSession++; message = null; });
      return;
    }
    setState(() { requestingCamera = true; message = null; });
    try {
      var status = await Permission.camera.status;
      if (!status.isGranted && !status.isPermanentlyDenied && !status.isRestricted) {
        status = await Permission.camera.request();
      }
      if (!mounted) return;
      setState(() {
        cameraBlocked = status.isPermanentlyDenied || status.isRestricted;
        scanning = status.isGranted;
        scannerFailed = false;
        if (status.isGranted) scannerSession++;
        if (!status.isGranted) message = cameraBlocked
            ? 'Camera access is blocked. You can enable it in App Settings or paste your TV pairing link below.'
            : 'Camera permission was declined. Tap Scan TV QR code to try again, or use the pairing link below.';
      });
    } catch (_) {
      if (mounted) setState(() { scanning = false; scannerFailed = true; message = 'Unable to request camera access. You can still connect using the TV pairing link.'; });
    } finally {
      if (mounted) setState(() => requestingCamera = false);
    }
  }
  void acceptLink(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri?.scheme != 'https' || !['streamora.co.ke', 'www.streamora.co.ke'].contains(uri?.host) || uri?.path != '/tv-pair') {
      setState(() => message = 'Enter the complete HTTPS pairing link shown on your TV.');
      return;
    }
    final value = uri!.queryParameters['challenge'];
    if (value == null || value.length != 43 || RegExp(r'[^A-Za-z0-9_-]').hasMatch(value)) {
      setState(() => message = 'Invalid or incomplete TV pairing link. Generate a fresh QR code on your TV.');
      return;
    }
    code.clear();
    setState(() { challenge = value; scanning = false; scannerFailed = false; message = null; cameraBlocked = false; });
  }
  void scan(BarcodeCapture capture) {
    if (!mounted || !scanning || challenge != null || acceptingQr) return;
    for (final barcode in capture.barcodes) {
      final uri = Uri.tryParse(barcode.rawValue ?? '');
      if (uri?.scheme != 'https' || !['streamora.co.ke', 'www.streamora.co.ke'].contains(uri?.host) || uri?.path != '/tv-pair') continue;
      final value = uri!.queryParameters['challenge'];
      if (value == null || value.length != 43 || RegExp(r'[^A-Za-z0-9_-]').hasMatch(value)) continue;
      acceptingQr = true;
      acceptLink(barcode.rawValue ?? '');
      return;
    }
  }
  Future<void> approve() async {
    if (challenge == null || busy || !RegExp(r'^\d{6}$').hasMatch(code.text.trim())) return;
    setState(() { busy = true; message = null; });
    try {
      final result = await TvPairingApi.approve(challenge!, code.text.trim());
      if (!mounted) return;
      setState(() { pairingId = result['pairing_id'] as String; challenge = null; acceptingQr = false; message = 'TV connected. You can now control it from this phone.'; });
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
        ClipRRect(borderRadius: BorderRadius.circular(20), child: SizedBox(height: 280,
          child: MobileScanner(key: ValueKey(scannerSession), onDetect: scan,
            errorBuilder: (context, error, child) => Container(
              color: const Color(0xFF171B24), padding: const EdgeInsets.all(18),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.no_photography_outlined, size: 42, color: Color(0xFF32CED0)),
                const SizedBox(height: 12),
                const Text('Camera could not start', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text('Allow camera permission for TikVTV in Android Settings, then try again. You can also paste the TV pairing link below.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton.icon(onPressed: () { setState(() { scanning = false; scannerFailed = true; }); openScanner(); }, icon: const Icon(Icons.refresh), label: const Text('Retry camera')),
                if (!kIsWeb) TextButton.icon(onPressed: openAppSettings, icon: const Icon(Icons.settings), label: const Text('Camera settings')),
              ]))),
        )),
        TextButton.icon(onPressed: () => setState(() { scanning = false; scannerFailed = false; message = null; }), icon: const Icon(Icons.close), label: const Text('Close scanner')),
      ],
      if (challenge == null) ...[
        if (!scanning) FilledButton.icon(onPressed: requestingCamera ? null : openScanner, icon: const Icon(Icons.qr_code_scanner), label: Text(requestingCamera ? 'Requesting camera access…' : 'Scan TV QR code')),
        if (cameraBlocked && !kIsWeb) TextButton.icon(onPressed: openAppSettings, icon: const Icon(Icons.settings), label: const Text('Open camera permission settings')),
        const SizedBox(height: 18),
        const Text('Camera not working? Connect using the TV pairing link', style: TextStyle(color: Colors.white70)),
        const SizedBox(height: 8),
        TextField(controller: manualLink, keyboardType: TextInputType.url, autocorrect: false,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.link), labelText: 'Paste TV pairing link', border: OutlineInputBorder()),
          onSubmitted: acceptLink),
        const SizedBox(height: 8),
        OutlinedButton.icon(onPressed: () => acceptLink(manualLink.text), icon: const Icon(Icons.link), label: const Text('Continue without camera')),
      ],
      if (challenge != null) ...[
        const SizedBox(height: 12),
        const Text('Confirm the six-digit number displayed on your TV before connecting.'),
        TextField(controller: code, maxLength: 6, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], textInputAction: TextInputAction.done, onSubmitted: (_) => approve(), decoration: const InputDecoration(labelText: 'TV confirmation code')),
        FilledButton(onPressed: busy ? null : approve, child: Text(busy ? 'Connecting…' : 'Confirm and connect TV')),
        TextButton(onPressed: () => setState(() { challenge = null; acceptingQr = false; code.clear(); message = null; }), child: const Text('Cancel')),
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
