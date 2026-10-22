import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'src/catalogue.dart';
import 'src/native_backend.dart';
import 'src/playback.dart';
import 'src/playback_gate.dart';
import 'src/library.dart';
import 'src/native_screens.dart';
import 'src/tv_pairing_screen.dart';
import 'src/tv_pairing_api.dart';

/// Android TV entry point: a remote-first experience using the same catalogue,
/// account, viewing-access service and shared decoder as the mobile application.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight,
  ]);
  runApp(const TikVtvTelevision());
}

class TikVtvTelevision extends StatelessWidget {
  const TikVtvTelevision({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TikVTV TV',
    debugShowCheckedModeBanner: false,
    theme: ThemeData.dark(useMaterial3: true).copyWith(
      scaffoldBackgroundColor: const Color(0xFF0B0D15),
      colorScheme: const ColorScheme.dark(primary: Color(0xFFFF315F), secondary: Color(0xFF32CED0), surface: Color(0xFF171A26), onSurface: Color(0xFFF5F5FA)),
      appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF10121B), foregroundColor: Colors.white, centerTitle: false, elevation: 0),
      cardTheme: CardThemeData(color: const Color(0xFF171A26), elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Color(0xFF303344)))),
      inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: const Color(0xFF191C29), contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17), border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF343748))), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF343748))), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFFF315F), width: 2))),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF315F), foregroundColor: Colors.white, minimumSize: const Size(52, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFF5F5FA), side: const BorderSide(color: Color(0xFF414558)), minimumSize: const Size(52, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)))),
      chipTheme: ChipThemeData(backgroundColor: const Color(0xFF191C29), selectedColor: const Color(0xFF542035), side: const BorderSide(color: Color(0xFF353849)), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
    ),
    home: const TvHome(),
  );
}

class TvHome extends StatefulWidget {
  const TvHome({super.key});
  @override
  State<TvHome> createState() => _TvHomeState();
}

class _TvHomeState extends State<TvHome> with WidgetsBindingObserver {
  final catalogue = ChannelCatalogue();
  final player = SharedPlayback();
  final gate = PlaybackGate.instance;
  final search = TextEditingController();
  final searchFocus = FocusNode(debugLabel: 'TV channel search');
  final library = ChannelLibrary();
  int section = 0;
  String country = 'All';
  String category = 'All';
  Channel? selected;
  String query = '';
  bool openingChannel = false;
  Timer? remoteTimer;
  bool remotePolling = false;
  int remoteCursor = 0;
  Future<void> connectPhone() async {
    await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const TvPairingScreen()));
    if (mounted) { await gate.refresh(); refresh(); }
  }
  Future<void> pollRemote() async {
    final token = NativeBackend.instance.tvDeviceToken;
    if (remotePolling || token == null) return;
    remotePolling = true;
    try {
      final commands = await TvPairingApi.pollCommands(token, remoteCursor);
      for (final item in commands) {
        remoteCursor = (item['id'] as num).toInt();
        if (!mounted) break;
        final command = item['command'] as String;
        if (command == 'home' || command == 'back') {
          if (Navigator.canPop(context)) Navigator.pop(context);
          else if (command == 'home') setState(() => section = 0);
        } else if (command == 'select') {
          final focus = FocusManager.instance.primaryFocus;
          if (focus?.context != null) Actions.maybeInvoke(focus!.context!, const ActivateIntent());
        } else if (['up','down','left','right'].contains(command)) {
          final direction = <String, TraversalDirection>{'up':TraversalDirection.up,'down':TraversalDirection.down,'left':TraversalDirection.left,'right':TraversalDirection.right}[command]!;
          FocusScope.of(context).focusInDirection(direction);
        } else if (command == 'play_pause' && player.controller != null) {
          final controller = player.controller!;
          if (controller.value.isPlaying) { await controller.pause(); } else if (!gate.locked) { await controller.play(); }
        }
      }
    } catch (e) { debugPrint('TV remote polling unavailable: $e'); }
    finally { remotePolling = false; }
  }

  final firstChannelFocus = FocusNode(debugLabel: 'First TV channel');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    catalogue.addListener(refresh);
    player.addListener(refresh);
    gate.addListener(refresh);
    gate.onLock = player.lockForPayment;
    library.addListener(refresh);
    NativeBackend.instance.addListener(onAccountChanged);
    unawaited(library.load());
    unawaited(catalogue.load());
    unawaited(NativeBackend.instance.restore().then((_) => gate.refresh()));
    unawaited(NativeBackend.instance.restoreTvDevice().then((_) => gate.refresh()));
    remoteTimer = Timer.periodic(const Duration(seconds: 1), (_) => unawaited(pollRemote()));
  }

  void refresh() { if (mounted) setState(() {}); }
  void onAccountChanged() { refresh(); unawaited(gate.refresh()); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    player.setBackgrounded(state != AppLifecycleState.resumed);
    if (state == AppLifecycleState.resumed) {
      unawaited(gate.refresh());
      unawaited(catalogue.load());
    }
  }

  Future<void> tune(Channel channel) async {
    // A remote can deliver repeated OK events before navigation completes.
    // Keep one decoder/open attempt and one fullscreen route at a time.
    if (openingChannel) return;
    openingChannel = true;
    setState(() => selected = channel);
    try {
      await player.open(channel); // The shared player enforces the access gate.
      if (!mounted) return;
      if (!gate.locked && player.controller != null) {
        unawaited(library.recordWatch(channel.id));
      }
      final playbackLease = player.lease;
      await Navigator.push(context, MaterialPageRoute<void>(
        builder: (_) => TvPlayer(channel: channel, player: player, gate: gate),
      ));
      player.stopIfCurrent(channel.id, lease: playbackLease);
    } finally {
      openingChannel = false;
      if (mounted) setState(() => selected = null);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    catalogue.removeListener(refresh);
    player.removeListener(refresh);
    gate.removeListener(refresh);
    library.removeListener(refresh);
    NativeBackend.instance.removeListener(onAccountChanged);
    remoteTimer?.cancel();
    search.dispose();
    searchFocus.dispose();
    firstChannelFocus.dispose();
    final current = selected;
    if (current != null) player.stopIfCurrent(current.id, lease: player.lease);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final all = catalogue.channels;
    final countries = (all.map((c) => c.country).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final categories = (all.expand((c) => c.categories).where((v) => v.isNotEmpty).toSet().toList()..sort());
    final channels = all.where((c) => (section != 1 || library.isFavorite(c.id)) && (section != 2 || library.wasWatched(c.id)) && (country == 'All' || c.country == country) && (category == 'All' || c.categories.contains(category)) && [c.name,c.country,...c.categories,...c.languages].any((v) => v.toLowerCase().contains(query.toLowerCase()))).toList();
    if (section == 2) channels.sort((a,b) => library.history.indexOf(a.id).compareTo(library.history.indexOf(b.id)));
    return Scaffold(
      body: SafeArea(child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('TikVTV  TV', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const Spacer(),
            TextButton.icon(onPressed: connectPhone, icon: const Icon(Icons.qr_code_2), label: Text(NativeBackend.instance.tvPaired ? 'Phone connected' : 'Connect phone')),
            TextButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const NativePremiumScreen())), icon: const Icon(Icons.workspace_premium), label: const Text('Premium')),
            TextButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const NativeAccountScreen())), icon: const Icon(Icons.person), label: Text(NativeBackend.instance.signedIn ? 'Account' : 'Sign in')),
            SizedBox(width: 320, child: TextField(
              controller: search,
              focusNode: searchFocus,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => searchFocus.unfocus(),
              onChanged: (value) => setState(() => query = value),
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search channels', border: OutlineInputBorder()),
            )),
            const SizedBox(width: 16),
            IconButton(tooltip: 'Refresh catalogue', onPressed: () => catalogue.load(force: true), icon: const Icon(Icons.refresh)),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, children: [for (var i = 0; i < 4; i++) ChoiceChip(label: Text(const ['Channels','Favorites','History','Hot'][i]), selected: section == i, onSelected: (_) => setState(() => section = i))]),
          Row(children: [const Text('Country  '), DropdownButton<String>(value: countries.contains(country) ? country : 'All', items: ['All',...countries].map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(), onChanged: (v) => setState(() => country = v ?? 'All')), const SizedBox(width: 18), const Text('Category  '), DropdownButton<String>(value: categories.contains(category) ? category : 'All', items: ['All',...categories].map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(), onChanged: (v) => setState(() => category = v ?? 'All'))]),
          const SizedBox(height: 12),
          if (catalogue.loading) const LinearProgressIndicator(),
          if (catalogue.error != null) Text('Catalogue unavailable: ${catalogue.error}', style: const TextStyle(color: Colors.orange)),
          Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text('Live channels · ${channels.length}', style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w600))),
          Expanded(child: section == 3 ? NativeHotScreen(channels: all, onSelect: tune) : channels.isEmpty
            ? const Center(child: Text('No channels available. Refresh or change your search.'))
            : GridView.builder(
                itemCount: channels.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 5, childAspectRatio: 1.7, crossAxisSpacing: 16, mainAxisSpacing: 16,
                ),
                itemBuilder: (context, index) {
                  final channel = channels[index];
                  return OutlinedButton(
                    focusNode: index == 0 ? firstChannelFocus : null,
                    autofocus: index == 0,
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(12)),
                    onPressed: () => tune(channel),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      if (channel.logo.isNotEmpty) Expanded(child: Image.network(channel.logo, errorBuilder: (_, __, ___) => const Icon(Icons.live_tv, size: 40))),
                      const SizedBox(height: 8),
                      Text(channel.name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                      IconButton(tooltip: 'Toggle favorite', onPressed: () => library.toggleFavorite(channel.id), icon: Icon(library.isFavorite(channel.id) ? Icons.favorite : Icons.favorite_border, size: 20)),
                    ]),
                  );
                },
              )),
        ]),
      )),
      floatingActionButton: selected == null || openingChannel ? null : FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => TvPlayer(channel: selected!, player: player, gate: gate),
        )),
        icon: const Icon(Icons.fullscreen), label: const Text('Fullscreen'),
      ),
    );
  }
}

class TvPlayer extends StatefulWidget {
  final Channel channel;
  final SharedPlayback player;
  final PlaybackGate gate;
  const TvPlayer({super.key, required this.channel, required this.player, required this.gate});
  @override
  State<TvPlayer> createState() => _TvPlayerState();
}

class _TvPlayerState extends State<TvPlayer> {
  bool retrying = false;
  Future<void> openPremium() async {
    await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => const NativePremiumScreen()));
    if (mounted) await widget.gate.refresh();
  }
  Future<void> retry() async {
    if (retrying || widget.gate.locked) return;
    setState(() => retrying = true);
    try {
      await widget.player.open(widget.channel);
    } finally {
      if (mounted) setState(() => retrying = false);
    }
  }
  @override
  void initState() {
    super.initState();
    widget.player.addListener(refresh);
    widget.gate.addListener(refresh);
  }
  void refresh() { if (mounted) setState(() {}); }
  @override
  void dispose() {
    widget.player.removeListener(refresh);
    widget.gate.removeListener(refresh);
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    final controller = widget.player.controller;
    return Scaffold(body: Stack(children: [
      Positioned.fill(child: widget.gate.locked
        ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lock_outline, size: 58),
            const SizedBox(height: 12),
            Text(widget.gate.verificationUnavailable ? 'Unable to verify access. Check your connection.' : 'Unlock all channels with the same TikVTV account and PesaPal plans as the phone app.', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(onPressed: openPremium, icon: const Icon(Icons.workspace_premium), label: const Text('Open Premium and pay')),
            const SizedBox(height: 8),
            TextButton(onPressed: widget.gate.checking ? null : () => widget.gate.refresh(), child: Text(widget.gate.checking ? 'Checking access…' : 'Retry access check')),
          ]))
        : controller != null && controller.value.isInitialized
          ? Center(child: AspectRatio(aspectRatio: controller.value.aspectRatio, child: VideoPlayer(controller)))
          : Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (widget.player.loading) const CircularProgressIndicator(),
              const SizedBox(height: 14),
              Text(widget.player.error ?? 'Connecting to live channel…', textAlign: TextAlign.center),
              if (!widget.player.loading) TextButton.icon(onPressed: retrying ? null : retry, icon: const Icon(Icons.refresh), label: Text(retrying ? 'Retrying…' : 'Retry channel')),
            ]))),
      Positioned(left: 24, top: 24, child: Text(widget.channel.name, style: const TextStyle(fontSize: 22, shadows: [Shadow(blurRadius: 8)]))),
      if (!widget.gate.locked && widget.player.buffering) const Positioned(right: 24, top: 24, child: Chip(avatar: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)), label: Text('Buffering'))),
      Positioned(left: 24, bottom: 24, child: ElevatedButton.icon(
        autofocus: true,
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.arrow_back), label: const Text('Back to channels'),
      )),
    ]));
  }
}
