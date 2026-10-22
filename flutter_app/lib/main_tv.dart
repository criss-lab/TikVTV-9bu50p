import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'src/catalogue.dart';
import 'src/native_backend.dart';
import 'src/playback.dart';
import 'src/playback_gate.dart';

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
      scaffoldBackgroundColor: const Color(0xFF101014),
      colorScheme: const ColorScheme.dark(primary: Color(0xFFFF315F)),
    ),
    home: const TvHome(),
  );
}

class TvHome extends StatefulWidget {
  const TvHome({super.key});
  @override
  State<TvHome> createState() => _TvHomeState();
}

class _TvHomeState extends State<TvHome> {
  final catalogue = ChannelCatalogue();
  final player = SharedPlayback();
  final gate = PlaybackGate.instance;
  final search = TextEditingController();
  Channel? selected;
  String query = '';

  @override
  void initState() {
    super.initState();
    catalogue.addListener(refresh);
    player.addListener(refresh);
    gate.addListener(refresh);
    unawaited(catalogue.load());
    unawaited(NativeBackend.instance.restore().then((_) => gate.refresh()));
  }

  void refresh() { if (mounted) setState(() {}); }

  Future<void> tune(Channel channel) async {
    setState(() => selected = channel);
    await player.open(channel); // Server entitlement is checked before opening.
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    catalogue.removeListener(refresh);
    player.removeListener(refresh);
    gate.removeListener(refresh);
    search.dispose();
    final current = selected;
    if (current != null) player.stopIfCurrent(current.id, lease: player.lease);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final channels = catalogue.channels.where((c) => c.name.toLowerCase().contains(query.toLowerCase())).toList();
    return Scaffold(
      body: SafeArea(child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('TikVTV  TV', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const Spacer(),
            SizedBox(width: 320, child: TextField(
              controller: search,
              onChanged: (value) => setState(() => query = value),
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search channels', border: OutlineInputBorder()),
            )),
            const SizedBox(width: 16),
            IconButton(tooltip: 'Refresh catalogue', onPressed: () => catalogue.load(force: true), icon: const Icon(Icons.refresh)),
          ]),
          const SizedBox(height: 20),
          if (catalogue.loading) const LinearProgressIndicator(),
          if (catalogue.error != null) Text('Catalogue unavailable: ${catalogue.error}', style: const TextStyle(color: Colors.orange)),
          const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Live channels', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w600))),
          Expanded(child: channels.isEmpty
            ? const Center(child: Text('No channels available. Refresh or change your search.'))
            : GridView.builder(
                itemCount: channels.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 5, childAspectRatio: 1.7, crossAxisSpacing: 16, mainAxisSpacing: 16,
                ),
                itemBuilder: (context, index) {
                  final channel = channels[index];
                  return OutlinedButton(
                    autofocus: index == 0,
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.all(12)),
                    onPressed: () => tune(channel),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      if (channel.logo.isNotEmpty) Expanded(child: Image.network(channel.logo, errorBuilder: (_, __, ___) => const Icon(Icons.live_tv, size: 40))),
                      const SizedBox(height: 8),
                      Text(channel.name, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                    ]),
                  );
                },
              )),
        ]),
      )),
      floatingActionButton: selected == null ? null : FloatingActionButton.extended(
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
            Text(widget.gate.verificationUnavailable ? 'Unable to verify access. Check your connection.' : 'Sign in or unlock channels on your phone or Web account.', textAlign: TextAlign.center),
            TextButton(onPressed: () => widget.gate.refresh(), child: const Text('Retry access check')),
          ]))
        : controller != null && controller.value.isInitialized
          ? Center(child: AspectRatio(aspectRatio: controller.value.aspectRatio, child: VideoPlayer(controller)))
          : Center(child: Text(widget.player.error ?? 'Connecting to live channel…'))),
      Positioned(left: 24, top: 24, child: Text(widget.channel.name, style: const TextStyle(fontSize: 22, shadows: [Shadow(blurRadius: 8)]))),
      Positioned(left: 24, bottom: 24, child: ElevatedButton.icon(
        autofocus: true,
        onPressed: () => Navigator.pop(context),
        icon: const Icon(Icons.arrow_back), label: const Text('Back to channels'),
      )),
    ]));
  }
}
