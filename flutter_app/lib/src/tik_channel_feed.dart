import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'catalogue.dart';
import 'playback.dart';
import 'playback_gate.dart';
import 'library.dart';

/// Three-item lookahead (current + next two). Only the focused item owns a
/// decoder; initializing three live videos simultaneously exhausts many phones.
class TikChannelFeed extends StatefulWidget {
  final List<Channel> channels;
  final VoidCallback onUnlockPremium;
  const TikChannelFeed({super.key, required this.channels, required this.onUnlockPremium});
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
  bool _backgrounded = false;
  String? _ownedId;
  int _request = 0;
  bool _showHints = true;
  bool _likedBurst = false;
  Timer? _likedBurstTimer;
  Timer? _focusDebounce;

  Future<void> _togglePlayback(int index) async {
    if (!mounted || index != _index || _gate.locked || _backgrounded) return;
    final current = _player.controller;
    if (current == null || !current.value.isInitialized || _player.channel?.id != widget.channels[index].id) {
      _focus(index);
      return;
    }
    try {
      if (current.value.isPlaying) {
        await current.pause();
      } else {
        await current.play();
      }
      if (mounted) _refresh();
    } catch (error) {
      debugPrint('Playback toggle failed: $error');
    }
  }

  Future<void> _openLandscape() async {
    if (_gate.locked || _player.channel?.id != widget.channels[_index].id) return;
    await Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => _LandscapePlayer(player: _player, gate: _gate),
    ));
  }

  void _likeFocused(String channelId) {
    if (!mounted) return;
    if (!_library.isFavorite(channelId)) _library.toggleFavorite(channelId);
    _likedBurstTimer?.cancel();
    setState(() => _likedBurst = true);
    _likedBurstTimer = Timer(const Duration(milliseconds: 650), () {
      if (mounted) setState(() => _likedBurst = false);
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _player.addListener(_refresh);
    _library.addListener(_refresh);
    _wasLocked = _gate.locked;
    _gate.addListener(_refresh);
    _gate.onLock = _player.lockForPayment;
    WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _focus(0); });
  }

  bool _wasLocked = true;
  void _refresh() {
    if (!mounted) return;
    final isLocked = _gate.locked;
    if (_wasLocked && !isLocked && widget.channels.isNotEmpty) {
      _wasLocked = false;
      // Locking released the shared decoder. Restart the focused channel as
      // soon as a server-verified subscription unlocks the feed.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_gate.locked && widget.channels.isNotEmpty) _focus(_index.clamp(0, widget.channels.length - 1));
      });
    } else {
      _wasLocked = isLocked;
    }
    setState(() {});
  }

  void _preloadBatch(int index) {
    // Predict forward: warm artwork for the focused channel and the next two.
    // Keep this decoder-free so low-memory devices never open offscreen streams.
    final last = (index + 2).clamp(0, widget.channels.length - 1);
    for (var i = index; i <= last; i++) {
      final logo = widget.channels[i].logo;
      if (logo.isNotEmpty) {
        unawaited(precacheImage(NetworkImage(logo), context).catchError((Object _) {}));
      }
    }
  }

  void _onPageChanged(int index) {
    if (!mounted || index < 0 || index >= widget.channels.length) return;
    // Update selection immediately, but wait for a short settle window before
    // creating a native decoder. Fast multi-page swipes won't open every stream.
    setState(() { _index = index; _showHints = index == 0; });
    _preloadBatch(index);
    _focusDebounce?.cancel();
    _focusDebounce = Timer(const Duration(milliseconds: 110), () {
      if (mounted && index == _index) _focus(index);
    });
  }

  void _focus(int index) {
    if (!mounted || index < 0 || index >= widget.channels.length) return;
    final channel = widget.channels[index];
    final request = ++_request;
    setState(() { _index = index; _showHints = index == 0; });
    _preloadBatch(index);
    _ownedId = channel.id;
    // Reserve ownership before the asynchronous open completes so disposal
    // cannot accidentally stop a newer route's playback.
    _lease = null;
    unawaited(_library.recordWatch(channel.id).catchError((Object error) {
      debugPrint('Could not record channel watch: $error');
    }));
    unawaited(_player.open(channel).then((_) {
      if (!mounted || request != _request) return;
      _lease = _player.lease;
    }).catchError((Object error) {
      if (mounted && request == _request) {
        debugPrint('Channel focus failed: $error');
        _refresh();
      }
    }));
  }

  @override
  void didUpdateWidget(covariant TikChannelFeed oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.channels.isEmpty) {
      ++_request;
      if (_ownedId != null && _lease != null) {
        _player.stopIfCurrent(_ownedId!, lease: _lease);
      }
      _ownedId = null;
      _lease = null;
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
    _backgrounded = state != AppLifecycleState.resumed;
    _player.setBackgrounded(_backgrounded);
    _refresh();
  }

  @override
  void dispose() {
    ++_request;
    _likedBurstTimer?.cancel();
    _focusDebounce?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _player.removeListener(_refresh);
    _library.removeListener(_refresh);
    _gate.removeListener(_refresh);
    // Do not tear down playback owned by another route or an unfinished open.
    if (_ownedId != null && _lease != null) {
      _player.stopIfCurrent(_ownedId!, lease: _lease);
    }
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.channels.isEmpty
      ? const Center(child: Text('No channels available yet. Try refreshing the catalogue.'))
      : PageView.builder(
    controller: _pages,
    scrollDirection: Axis.vertical,
    itemCount: widget.channels.length,
    allowImplicitScrolling: true,
    pageSnapping: true,
    physics: const PageScrollPhysics(parent: ClampingScrollPhysics()),
    onPageChanged: _onPageChanged,
    itemBuilder: (context, index) {
      final channel = widget.channels[index];
      final focused = index == _index && _player.channel?.id == channel.id;
      final selected = index == _index;
      final controller = focused ? _player.controller : null;
      return Padding(
        padding: const EdgeInsets.fromLTRB(10, 5, 10, 9),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: ColoredBox(
            color: const Color(0xFF191A20),
            child: Stack(fit: StackFit.expand, children: [
              if (focused && !_backgrounded && !_gate.locked && controller != null && controller.value.isInitialized)
                FittedBox(
                  fit: BoxFit.contain,
                  child: SizedBox(width: controller.value.size.width, height: controller.value.size.height,
                    child: VideoPlayer(controller)),
                )
              else if (channel.logo.isNotEmpty)
                Image.network(channel.logo, fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Icons.live_tv, size: 60, color: Colors.white24))
              else const Icon(Icons.live_tv, size: 60, color: Colors.white24),
              if (selected) const IgnorePointer(child: DecoratedBox(
                decoration: BoxDecoration(gradient: LinearGradient(
                  begin: Alignment.topCenter, end: Alignment.bottomCenter,
                  colors: [Color(0x44000000), Colors.transparent, Color(0x99000000)],
                  stops: [0, 0.42, 1],
                )),
              )),
              if (selected && !_gate.locked && !_backgrounded)
                Positioned.fill(child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: () => _togglePlayback(index),
                  onDoubleTap: () => _likeFocused(channel.id),
                  child: Center(child: AnimatedOpacity(
                    opacity: focused && controller != null && controller.value.isInitialized && !controller.value.isPlaying ? 1 : 0,
                    duration: const Duration(milliseconds: 160),
                    child: const DecoratedBox(
                      decoration: BoxDecoration(color: Color(0x66000000), shape: BoxShape.circle),
                      child: Padding(padding: EdgeInsets.all(18), child: Icon(Icons.play_arrow_rounded, size: 54, color: Colors.white)),
                    ),
                  )),
                )),
              if (selected && _likedBurst)
                IgnorePointer(child: Center(child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0.45, end: 1.0),
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.elasticOut,
                  builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
                  child: const Icon(Icons.favorite, color: Color(0xFFFF315F), size: 104),
                ))),

              if (focused && _player.loading && !_gate.locked && !_backgrounded)
                const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  CircularProgressIndicator(), SizedBox(height: 12),
                  Text('Connecting to live channel…', style: TextStyle(color: Colors.white70)),
                ])),
              if (focused && _player.buffering && !_player.loading && !_gate.locked && !_backgrounded)
                const Positioned(top: 16, left: 90, child: Row(mainAxisSize: MainAxisSize.min, children: [
                  SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
                  SizedBox(width: 7), Text('Buffering', style: TextStyle(fontSize: 11)),
                ])),
              if (focused && _player.error != null && !_gate.locked && !_backgrounded)
                Center(child: Padding(padding: const EdgeInsets.all(20),
                  child: FilledButton.icon(onPressed: () => _focus(index),
                    icon: const Icon(Icons.refresh), label: const Text('Retry stream')))),
              if (selected && _gate.locked && !_gate.ready)
                const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  CircularProgressIndicator(), SizedBox(height: 12),
                  Text('Checking your access…', style: TextStyle(color: Colors.white70)),
                ])),
              if (selected && _gate.locked && _gate.ready && _gate.verificationUnavailable)
                Center(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 28), child: Column(
                  mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.verified_user_outlined, size: 36, color: Colors.white70),
                    const SizedBox(height: 12),
                    const Text('Viewing access could not be verified', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('The access service has not confirmed this channel. Your Wi-Fi may be working normally. We are retrying; do not pay again.', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(onPressed: () => unawaited(_gate.refresh()), icon: const Icon(Icons.refresh), label: const Text('Retry now')),
                  ],
                ))),
              if (selected && _gate.locked && _gate.ready && !_gate.verificationUnavailable)
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: widget.onUnlockPremium,
                  child: Center(child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const CircleAvatar(radius: 28, backgroundColor: Color(0x33FF315F), child: Icon(Icons.lock_open_rounded, size: 29, color: Color(0xFFFF315F))),
                    const SizedBox(height: 12),
                    const Text('Preview finished · Tap to unlock', textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text('One subscription opens every channel. Already paid? Check your access without paying again.',
                      textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: widget.onUnlockPremium,
                      icon: const Icon(Icons.workspace_premium),
                      label: const Text('Choose a plan · Pay securely'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(onPressed: () => unawaited(_gate.refresh()), icon: const Icon(Icons.refresh), label: const Text('Already paid? Check access')),
                  ]),
                ))),
              Positioned(top: 14, left: 14, child: DecoratedBox(
                decoration: BoxDecoration(color: const Color(0xFFFF315F), borderRadius: BorderRadius.circular(6)),
                child: const Padding(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  child: Text('LIVE', style: TextStyle(fontWeight: FontWeight.bold))))),
              if (selected && _showHints && !_gate.locked)
                const Positioned(top: 16, right: 14, child: Text('SWIPE ↑',
                  style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600))),
              if (selected && !_gate.locked) Positioned(
                top: 10, right: 10,
                child: IconButton.filledTonal(
                  tooltip: 'Watch in landscape fullscreen',
                  onPressed: _openLandscape,
                  icon: const Icon(Icons.fullscreen),
                ),
              ),
              if (selected) Positioned(right: 12, bottom: 70, child: Column(children: [
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
}

/// Uses the existing live controller: rotation must never reopen a stream or
/// allocate another free preview. Closing restores the portrait feed.
class _LandscapePlayer extends StatefulWidget {
  final SharedPlayback player;
  final PlaybackGate gate;
  const _LandscapePlayer({required this.player, required this.gate});
  @override
  State<_LandscapePlayer> createState() => _LandscapePlayerState();
}

class _LandscapePlayerState extends State<_LandscapePlayer> {
  @override
  void initState() {
    super.initState();
    widget.player.addListener(_refresh);
    widget.gate.addListener(_refresh);
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  void _refresh() { if (mounted) setState(() {}); }

  @override
  void dispose() {
    widget.player.removeListener(_refresh);
    widget.gate.removeListener(_refresh);
    SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.player.controller;
    final playable = !widget.gate.locked && controller != null && controller.value.isInitialized;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(child: Stack(fit: StackFit.expand, children: [
        if (playable)
          Center(child: AspectRatio(
            aspectRatio: controller.value.aspectRatio > 0 ? controller.value.aspectRatio : 16 / 9,
            child: VideoPlayer(controller),
          ))
        else Center(child: Text(widget.gate.locked
          ? 'Viewing access ended. Return to the feed to unlock.'
          : widget.player.error ?? 'Connecting to live channel…',
          textAlign: TextAlign.center)),
        if (playable) Center(child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () async {
            if (controller.value.isPlaying) { await controller.pause(); }
            else if (!widget.gate.locked) { await controller.play(); }
            _refresh();
          },
          child: const SizedBox.expand(),
        )),
        Positioned(top: 8, left: 8, child: IconButton.filledTonal(
          tooltip: 'Return to portrait', onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.fullscreen_exit),
        )),
      ])),
    );
  }
}
