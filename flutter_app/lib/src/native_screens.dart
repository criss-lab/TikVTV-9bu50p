import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'catalogue.dart';
import 'native_backend.dart';
import 'playback_gate.dart';

const _accent = Color(0xFFFF315F);
const _panel = Color(0xFF191A20);

class NativeHotScreen extends StatefulWidget {
  final List<Channel> channels;
  final ValueChanged<Channel> onSelect;
  const NativeHotScreen({super.key, required this.channels, required this.onSelect});
  @override
  State<NativeHotScreen> createState() => _NativeHotScreenState();
}
class _NativeHotScreenState extends State<NativeHotScreen> {
  final backend = NativeBackend.instance;
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> ranks = [];
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final result = await backend.trending();
      if (!mounted) return;
      setState(() { ranks = result; loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { error = e.toString().replaceFirst('Bad state: ', ''); loading = false; });
    }
  }
  @override
  Widget build(BuildContext context) {
    final byId = {for (final channel in widget.channels) channel.id: channel};
    final channels = ranks.map((rank) => byId[rank['channel_id']]).whereType<Channel>().toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(padding: EdgeInsets.fromLTRB(16, 14, 16, 4), child: Text('Hot right now', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
      const Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 12), child: Text('Ranked by reactions (+2) and comments (+1) from the last 24 hours', style: TextStyle(color: Colors.white54, fontSize: 12))),
      if (loading) const LinearProgressIndicator(minHeight: 2),
      if (error != null) Expanded(child: Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off, size: 42, color: Colors.white54), const SizedBox(height: 12),
        Text(error!, textAlign: TextAlign.center), const SizedBox(height: 12),
        FilledButton.icon(onPressed: load, icon: const Icon(Icons.refresh), label: const Text('Retry')),
      ])))),
      if (!loading && error == null && channels.isEmpty) const Expanded(child: Center(child: Text('No trending reactions or comments yet.'))),
      if (!loading && error == null && channels.isNotEmpty) Expanded(child: RefreshIndicator(onRefresh: load, child: ListView.separated(
        padding: const EdgeInsets.all(12), itemCount: channels.length, separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) { final channel = channels[index]; final score = ranks.firstWhere((r) => r['channel_id'] == channel.id)['score'];
          return ListTile(tileColor: _panel, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: CircleAvatar(backgroundColor: _accent, child: Text('${index + 1}')),
            title: Text(channel.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${channel.country} · score $score'),
            trailing: const Icon(Icons.play_circle_outline, color: _accent),
            onTap: () => widget.onSelect(channel));
        },
      ))),
    ]);
  }
}

class NativeAccountScreen extends StatefulWidget {
  const NativeAccountScreen({super.key});
  @override
  State<NativeAccountScreen> createState() => _NativeAccountScreenState();
}
class _NativeAccountScreenState extends State<NativeAccountScreen> {
  final backend = NativeBackend.instance;
  final email = TextEditingController();
  final password = TextEditingController();
  final username = TextEditingController();
  final otp = TextEditingController();
  bool creating = false, awaitingOtp = false, busy = false, obscure = true;
  String? message;
  @override
  void dispose() { email.dispose(); password.dispose(); username.dispose(); otp.dispose(); super.dispose(); }
  Future<void> submit() async {
    FocusScope.of(context).unfocus();
    setState(() { busy = true; message = null; });
    try {
      if (creating && !awaitingOtp) {
        await backend.requestSignupOtp(email.text);
        if (mounted) setState(() { awaitingOtp = true; busy = false; message = 'Verification code sent. Enter the code from your email to finish creating your account.'; });
        return;
      }
      if (creating) { await backend.verifySignupOtp(email.text, otp.text, password.text, username.text); }
      else { await backend.signIn(email.text, password.text); }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(creating ? 'Account created' : 'Signed in successfully')));
      setState(() { busy = false; });
      if (backend.signedIn) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() { message = e.toString().replaceFirst('Bad state: ', ''); busy = false; });
    }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('TikVTV account')),
    body: ListView(padding: const EdgeInsets.all(22), children: [
      const CircleAvatar(radius: 34, backgroundColor: _accent, child: Icon(Icons.person, size: 36)),
      const SizedBox(height: 14),
      Center(child: Text(backend.signedIn ? (backend.email ?? 'Signed in') : (creating ? 'Create your account' : 'Sign in to TikVTV'), style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold))),
      const SizedBox(height: 6),
      Center(child: Text(backend.signedIn ? 'Your account is connected on this device.' : 'Native account access. No Streamora web page is opened.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60))),
      if (!backend.configured) const Padding(padding: EdgeInsets.only(top: 18), child: Text('Account service is not configured in this APK build. Configure SUPABASE_URL and SUPABASE_ANON_KEY at build time.', style: TextStyle(color: Colors.orangeAccent))),
      if (backend.signedIn) ...[
        const SizedBox(height: 24), ListTile(leading: const Icon(Icons.verified_user, color: _accent), title: const Text('Signed in'), subtitle: Text(backend.email ?? 'Account active')),
        FilledButton.icon(onPressed: () async { await backend.signOut(); if (mounted) setState(() {}); }, icon: const Icon(Icons.logout), label: const Text('Sign out')),
      ] else ...[
        const SizedBox(height: 22),
        if (creating && !awaitingOtp) TextField(controller: username, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Username', prefixIcon: Icon(Icons.person_outline), filled: true)),
        const SizedBox(height: 12),
        TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined), filled: true)),
        const SizedBox(height: 12),
        TextField(controller: password, obscureText: obscure, decoration: InputDecoration(labelText: 'Password', prefixIcon: const Icon(Icons.lock_outline), filled: true, suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility : Icons.visibility_off)))),
        if (creating && awaitingOtp) ...[const SizedBox(height: 12), TextField(controller: otp, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Email verification code', prefixIcon: Icon(Icons.mark_email_read_outlined), filled: true))],
        if (message != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(message!, style: const TextStyle(color: Colors.orangeAccent))),
        const SizedBox(height: 18),
        FilledButton(onPressed: busy || !backend.configured ? null : submit, child: Text(busy ? 'Please wait…' : creating ? (awaitingOtp ? 'Verify and create account' : 'Send verification code') : 'Sign in')),
        TextButton(onPressed: busy ? null : () => setState(() { creating = !creating; awaitingOtp = false; message = null; }), child: Text(creating ? 'Already registered? Sign in' : 'New here? Create account')),
      ],
    ]),
  );
}

class NativePremiumScreen extends StatefulWidget {
  const NativePremiumScreen({super.key});
  @override
  State<NativePremiumScreen> createState() => _NativePremiumScreenState();
}
class _NativePremiumScreenState extends State<NativePremiumScreen> with WidgetsBindingObserver {
  final backend = NativeBackend.instance;
  Timer? _paymentTimer;
  Timer? _entitlementTimer;
  bool checking = false;
  String selectedPlan = 'month';
  bool loading = true, paying = false;
  bool active = false;
  String? endsAt, trackingId, message;
  @override
  void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); refresh(); _entitlementTimer = Timer.periodic(const Duration(seconds: 3), (_) { if (mounted && backend.signedIn && !loading) refresh(silent: true); }); }
  @override
  void dispose() { _paymentTimer?.cancel(); _entitlementTimer?.cancel(); WidgetsBinding.instance.removeObserver(this); super.dispose(); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && trackingId != null) verifyPayment();
    else if (state == AppLifecycleState.resumed) refresh();
  }
  Future<void> refresh({bool silent = false}) async {
    if (!mounted) return;
    if (!silent) setState(() { loading = true; message = null; });
    try {
      if (!backend.signedIn) { setState(() { loading = false; active = false; }); return; }
      final status = await backend.premiumStatus();
      if (!mounted) return;
      setState(() { active = status['active'] == true; endsAt = status['ends_at'] as String?; loading = false; });
      PlaybackGate.instance.acceptVerifiedStatus(status);
    } catch (e) { if (mounted) setState(() { message = e.toString().replaceFirst('Bad state: ', ''); loading = false; }); }
  }
  Future<void> checkout() async {
    if (!backend.signedIn) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sign in before subscribing.')));
      Navigator.push(context, MaterialPageRoute(builder: (_) => const NativeAccountScreen()));
      return;
    }
    setState(() { paying = true; message = null; });
    try {
      final order = await backend.initiatePremium(planCode: selectedPlan);
      if (!mounted) return;
      final url = Uri.tryParse(order['redirect_url'] as String? ?? '');
      final host = url?.host;
      if (url == null || url.scheme != 'https' || !['pay.pesapal.com', 'cybqa.pesapal.com'].contains(host)) {
        throw StateError('Secure PesaPal checkout destination was invalid.');
      }
      trackingId = order['order_tracking_id'] as String?;
      _paymentTimer?.cancel();
      _paymentTimer = Timer.periodic(const Duration(seconds: 2), (_) { if (mounted && !checking && trackingId != null) verifyPayment(silent: true); });
      if (kIsWeb) {
        final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
        if (!opened) throw StateError('Could not open PesaPal checkout.');
      } else {
        await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => NativeCheckoutScreen(url: url)));
        if (mounted) await verifyPayment();
      }
      if (mounted) setState(() { message = 'Checkout returned. Payment verification continues until the server records your entitlement.'; paying = false; });
    } catch (e) { if (mounted) setState(() { message = e.toString().replaceFirst('Bad state: ', ''); paying = false; }); }
  }
  Future<void> verifyPayment({bool silent = false}) async {
    final id = trackingId;
    if (id == null || checking) return;
    checking = true;
    if (!silent) setState(() { paying = true; message = null; });
    try {
      final result = await backend.checkPayment(id);
      final status = (result['payment_status_description'] ?? 'pending').toString();
      if (mounted && !silent) setState(() { message = 'PesaPal reports: $status. Access requires a verified server entitlement.'; paying = false; });
      await refresh(silent: silent);
      if (active || ['failed', 'invalid', 'reversed'].contains(status.toLowerCase())) { _paymentTimer?.cancel(); trackingId = null; }
    } catch (e) { if (mounted && !silent) setState(() { message = e.toString().replaceFirst('Bad state: ', ''); paying = false; }); }
    finally { checking = false; }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('TikVTV Premium')),
    body: ListView(padding: const EdgeInsets.all(22), children: [
      const Icon(Icons.workspace_premium, size: 66, color: _accent),
      const SizedBox(height: 12), const Center(child: Text('Premium subscription', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold))),
      const SizedBox(height: 8), const Text('Secure payment verification is handled by the TikVTV server. Your access is not unlocked by a redirect or client-side claim.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white60)),
      const SizedBox(height: 22),
      if (!backend.signedIn) ...[
        const Card(color: _panel, child: Padding(padding: EdgeInsets.all(16), child: Text('Sign in to your TikVTV account to check or purchase Premium.'))),
        FilledButton.icon(onPressed: () async { await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => const NativeAccountScreen())); if (mounted) await refresh(); }, icon: const Icon(Icons.login), label: const Text('Sign in to TikVTV')),
      ],
      if (loading) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
      if (!loading && active) Card(color: _panel, child: ListTile(leading: const Icon(Icons.verified, color: Colors.greenAccent), title: const Text('Premium active'), subtitle: Text(endsAt == null ? 'Subscription verified' : 'Access until ${DateTime.tryParse(endsAt!)?.toLocal() ?? endsAt}'))),
      if (!loading && !active && backend.signedIn) ...[
        const Text('Choose a plan', style: TextStyle(fontWeight: FontWeight.bold)),
        DropdownButtonFormField<String>(
          initialValue: selectedPlan,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Subscription duration'),
          items: const [
            DropdownMenuItem(value: 'half_day', child: Text('13 hours — KSh 5')),
            DropdownMenuItem(value: 'day', child: Text('1 day — KSh 10')),
            DropdownMenuItem(value: 'week', child: Text('1 week — KSh 40')),
            DropdownMenuItem(value: 'month', child: Text('1 month — KSh 130')),
          ],
          onChanged: paying ? null : (value) { if (value != null) setState(() => selectedPlan = value); },
        ),
        FilledButton.icon(onPressed: paying ? null : checkout, icon: const Icon(Icons.lock), label: Text(paying ? 'Connecting to PesaPal…' : 'Subscribe with PesaPal')),
      ],
      if (message != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(message!, style: const TextStyle(color: Colors.white70))),
      const SizedBox(height: 12),
      if (trackingId != null) OutlinedButton.icon(onPressed: paying ? null : verifyPayment, icon: const Icon(Icons.verified_user), label: const Text('Verify payment status')),
      OutlinedButton.icon(onPressed: loading ? null : refresh, icon: const Icon(Icons.refresh), label: const Text('Refresh subscription')),
    ]),
  );
}


class NativeCheckoutScreen extends StatefulWidget {
  final Uri url;
  const NativeCheckoutScreen({super.key, required this.url});
  @override
  State<NativeCheckoutScreen> createState() => _NativeCheckoutScreenState();
}
class _NativeCheckoutScreenState extends State<NativeCheckoutScreen> {
  late final WebViewController controller;
  int progress = 0;
  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (value) { if (mounted) setState(() => progress = value); },
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri == null || uri.scheme != 'https') return NavigationDecision.prevent;
          if ((uri.host == 'streamora.co.ke' || uri.host == 'www.streamora.co.ke') &&
              uri.path.startsWith('/payment-callback')) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) Navigator.pop(context, true);
            });
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(widget.url);
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Secure PesaPal checkout'), leading: IconButton(
      tooltip: 'Return to TikVTV', icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context, false))),
    body: Column(children: [
      if (progress < 100) LinearProgressIndicator(value: progress / 100, minHeight: 2),
      Expanded(child: WebViewWidget(controller: controller)),
    ]),
  );
}
