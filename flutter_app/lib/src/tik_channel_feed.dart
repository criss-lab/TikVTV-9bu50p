import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'catalogue.dart';
import 'playback.dart';
import 'playback_gate.dart';
import 'library.dart';

/// Three-item lookahead (current + next two). Only the focused item owns a
/// decoder; initializing three live videos simultaneously exhausts many phones.
class TikChannelFeed extends StatefulWidget {
  final List<Channel> channels;
  const TikChannelFeed({super.key, required this.channels});
  @override
  State<TikChannelFeed> createState() => _TikChannelFeedState();
}

class _TikChannelFeedState extends State<TikChannelFeed> with WidgetsBindingObserver {
  final PageController _pages = PageController();
  final SharedPlayback _player = SharedPlayback();
  final ChannelLibrary _library = ChannelLibrary();
  final PlaybackGate _gate = PlaybackGate.instance;
  int _index = 0;
  int? _lease;
  String? _ownedId;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _player.addListener(_refresh);
    _library.addListener(_refresh);
    _gate.addListener(_refresh);
    _gate.onLock = _player.lockForPayment;
    WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _focus(0); });
  }

  void _refresh() { if (mounted) setState(() {}); }

  void _preloadBatch(int index) {
    // Warm images/metadata for a batch of three without playing offscreen audio.
    for (var i = index; i < index + 3 && i < widget.channels.length; i++) {
      final logo = widget.channels[i].logo;
      if (logo.isNotEmpty) unawaited(precacheImage(NetworkImage(logo), context).catchError((Object _) {}));
    }
  }

  void _focus(int index) {
    if (!mounted || index < 0 || index >= widget.channels.length) return;
    final channel = widget.channels[index];
    final request = ++_request;
    setState(() => _index = index);
    _preloadBatch(index);
    _ownedId = channel.id;
    _lease = null;
    unawaited(_player.open(channel).then((_) {
      if (!mounted || request != _request) return;
      _lease = _player.lease;
    }));
  }

  @override
  void didUpdateWidget(covariant TikChannelFeed oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.channels.isEmpty) {
      if (_ownedId != null) _player.stopIfCurrent(_ownedId!, lease: _lease);
      _ownedId = null;
      return;
    }
    if (_index >= widget.channels.length ||
        widget.channels[_index].id != _ownedId) {
      _index = 0;
      if (_pages.hasClients) _pages.jumpToPage(0);
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _focus(0); });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Keep explicit background audio policy in SharedPlayback; do not autoplay
    // a different item while the app is backgrounded.
    _player.setBackgrounded(state != AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    ++_request;
    WidgetsBinding.instance.removeObserver(this);
    _player.removeListener(_refresh);
    _library.removeListener(_refresh);
    _gate.removeListener(_refresh);
    if (_ownedId != null) _player.stopIfCurrent(_ownedId!, lease: _lease);
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PageView.builder(
    controller: _pages,
    scrollDirection: Axis.vertical,
    itemCount: widget.channels.length,
    onPageChanged: _focus,
    itemBuilder: (context, index) {
      final channel = widget.channels[index];
      final focused = index == _index && _player.channel?.id == channel.id;
      final controller = focused ? _player.controller : null;
      return Padding(
        padding: const EdgeInsets.fromLTRB(10, 5, 10, 9),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: ColoredBox(
            color: const Color(0xFF191A20),
            child: Stack(fit: StackFit.expand, children: [
              if (focused && !_gate.locked && controller != null && controller.value.isInitialized)
                FittedBox(
                  fit: BoxFit.contain,
                  child: SizedBox(width: controller.value.size.width, height: controller.value.size.height,
                    child: VideoPlayer(controller)),
                )
              else if (channel.logo.isNotEmpty)
                Image.network(channel.logo, fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Icons.live_tv, size: 60, color: Colors.white24))
              else const Icon(Icons.live_tv, size: 60, color: Colors.white24),
              if (focused && _player.loading && !_gate.locked)
                const Center(child: CircularProgressIndicator()),
              if (focused && _player.error != null && !_gate.locked)
                Center(child: Padding(padding: const EdgeInsets.all(20),
                  child: FilledButton.icon(onPressed: () => _focus(index),
                    icon: const Icon(Icons.refresh), label: const Text('Retry stream')))),
              if (_gate.locked)
                const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.lock, size: 42), SizedBox(height: 8),
                  Text('Subscription required to play live TV'),
                ])),
              Positioned(top: 14, left: 14, child: DecoratedBox(
                decoration: BoxDecoration(color: const Color(0xFFFF315F), borderRadius: BorderRadius.circular(6)),
                child: const Padding(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  child: Text('LIVE', style: TextStyle(fontWeight: FontWeight.bold))))),
              Positioned(right: 12, bottom: 70, child: Column(children: [
                IconButton(tooltip: 'Favorite', onPressed: () => _library.toggleFavorite(channel.id),
                  icon: Icon(_library.isFavorite(channel.id) ? Icons.favorite : Icons.favorite_border,
                    color: _library.isFavorite(channel.id) ? const Color(0xFFFF315F) : Colors.white)),
                IconButton(tooltip: 'Retry live channel', onPressed: () => _focus(index),
                  icon: const Icon(Icons.refresh, color: Colors.white)),
              ])),
              Positioned(left: 16, right: 68, bottom: 18, child: Column(
                crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min,
                children: [
                  Text(channel.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 19,
                      shadows: [Shadow(blurRadius: 8, color: Colors.black)])),
                  Text('${channel.country} · Swipe up for next channel',
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
                ])),
            ]),
          ),
        ),
      );
    },
  );
