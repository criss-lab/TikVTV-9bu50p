import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:volume_controller/volume_controller.dart';
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
      builder: (_) => _LandscapePlayer(
        player: _player,
        gate: _gate,
        channels: widget.channels,
        currentIndex: _index,
        onPlayChannel: (index) {
          Navigator.of(context).pop();
          _focus(index);
        },
      ),
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
              // A transient guest API failure should not cover the welcome channel with a blocker card.
              // Keep artwork visible and offer a small retry affordance; never bypass server access.
              if (selected && _gate.locked && _gate.ready && _gate.verificationUnavailable)
                Positioned(top: 14, right: 14, child: ActionChip(
                  avatar: const Icon(Icons.refresh, size: 18),
                  label: const Text('Retry connection'),
                  onPressed: () => unawaited(_gate.refresh()),
                )),
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
  final List<Channel> channels;
  final int currentIndex;
  final ValueChanged<int> onPlayChannel;
  const _LandscapePlayer({required this.player, required this.gate, required this.channels, required this.currentIndex, required this.onPlayChannel});
  @override
  State<_LandscapePlayer> createState() => _LandscapePlayerState();
}

class _LandscapePlayerState extends State<_LandscapePlayer> {
  double? _gestureValue;
  String? _gestureKind;
  double _gestureStartY = 0;
  double _gestureStartValue = 0;
  bool _gestureBusy = false;
  bool _showNextSuggestion = false;
  Timer? _suggestionTimer;
  double _lastAppliedValue = -1;
  bool _applyingNativeValue = false;
  double? _pendingNativeValue;
  String? _pendingNativeKind;
  int _gestureEpoch = 0;
  int? _pendingNativeEpoch;

  @override
  void initState() {
    super.initState();
    widget.player.addListener(_refresh);
    widget.gate.addListener(_refresh);
    VolumeController.instance.showSystemUI = false;
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  void _refresh() { if (mounted) setState(() {}); }

  void _showSuggestion() {
    if (widget.currentIndex + 1 >= widget.channels.length) return;
    _suggestionTimer?.cancel();
    setState(() => _showNextSuggestion = true);
    _suggestionTimer = Timer(const Duration(seconds: 8), () {
      if (mounted) setState(() => _showNextSuggestion = false);
    });
  }

  void _dismissSuggestion() {
    _suggestionTimer?.cancel();
    if (mounted) setState(() => _showNextSuggestion = false);
  }

  Future<void> _beginSwipe(bool leftSide, double y) async {
    if (_gestureBusy) return;
    _gestureBusy = true;
    final epoch = ++_gestureEpoch;
    try {
      final value = leftSide ? await VolumeController.instance.getVolume() : await ScreenBrightness.instance.application;
      if (!mounted || epoch != _gestureEpoch) return;
      setState(() {
        _gestureKind = leftSide ? 'volume' : 'brightness';
        _gestureStartValue = value.clamp(0.0, 1.0);
        _gestureValue = _gestureStartValue;
        _gestureStartY = y;
      });
    } catch (e) { debugPrint('Landscape swipe control read failed: $e'); }
    finally { _gestureBusy = false; }
  }

  void _updateSwipe(double y) {
    final kind = _gestureKind;
    if (kind == null) return;
    final next = (_gestureStartValue + (_gestureStartY - y) / 220).clamp(0.0, 1.0).toDouble();
    setState(() => _gestureValue = next);

    // Keep only the latest desired native value while a platform call is in
    // flight. A serialized drain prevents dropped end-of-gesture updates and
    // avoids flooding the platform channel with every pointer event.
    if ((next - _lastAppliedValue).abs() < 0.015) return;
    _lastAppliedValue = next;
    _pendingNativeKind = kind;
    _pendingNativeValue = next;
    _pendingNativeEpoch = _gestureEpoch;
    if (!_applyingNativeValue) unawaited(_drainNativeUpdates());
  }

  Future<void> _drainNativeUpdates() async {
    if (_applyingNativeValue) return;
    _applyingNativeValue = true;
    try {
      while (mounted && _pendingNativeValue != null && _pendingNativeKind != null && _pendingNativeEpoch == _gestureEpoch) {
        final value = _pendingNativeValue!;
        final kind = _pendingNativeKind!;
        _pendingNativeValue = null;
        _pendingNativeKind = null;
        _pendingNativeEpoch = null;
        try {
          if (kind == 'volume') {
            await VolumeController.instance.setVolume(value);
          } else {
            await ScreenBrightness.instance.setApplicationScreenBrightness(value);
          }
        } catch (error) {
          debugPrint('Landscape $kind adjustment failed: $error');
        }
      }
    } finally {
      _applyingNativeValue = false;
      if (mounted && _pendingNativeValue != null && _pendingNativeKind != null) {
        unawaited(_drainNativeUpdates());
      }
    }
  }

  void _endSwipe() {
    // Invalidate an outstanding async system-value read and discard values
    // queued by a gesture that has already ended. An in-flight platform call
    // cannot be cancelled, but stale queued writes must never run afterward.
    ++_gestureEpoch;
    _pendingNativeValue = null;
    _pendingNativeKind = null;
    _pendingNativeEpoch = null;
    _lastAppliedValue = -1;
    if (_gestureKind == null) return;
    if (mounted) setState(() { _gestureKind = null; _gestureValue = null; });
  }

  @override
  void dispose() {
    _suggestionTimer?.cancel();
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
        if (playable) Positioned.fill(child: Row(children: [
          Expanded(child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: _showSuggestion,
            onVerticalDragStart: (details) => _beginSwipe(true, details.globalPosition.dy),
            onVerticalDragUpdate: (details) => _updateSwipe(details.globalPosition.dy),
            onVerticalDragEnd: (_) => _endSwipe(),
            onVerticalDragCancel: _endSwipe,
            child: const SizedBox.expand(),
          )),
          Expanded(flex: 2, child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: _showSuggestion,
            child: const SizedBox.expand(),
          )),
          Expanded(child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: _showSuggestion,
            onVerticalDragStart: (details) => _beginSwipe(false, details.globalPosition.dy),
            onVerticalDragUpdate: (details) => _updateSwipe(details.globalPosition.dy),
            onVerticalDragEnd: (_) => _endSwipe(),
            onVerticalDragCancel: _endSwipe,
            child: const SizedBox.expand(),
          )),
        ])),
        if (playable && _showNextSuggestion && widget.channels.length > widget.currentIndex + 1)
          Positioned(
            right: 24, top: 24, bottom: 24, width: 270,
            child: Center(child: Material(
              color: Colors.black.withValues(alpha: 0.82),
              borderRadius: BorderRadius.circular(20),
              clipBehavior: Clip.antiAlias,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Expanded(child: Text('Up next for you', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold))),
                      IconButton(
                        tooltip: 'Dismiss suggestion',
                        visualDensity: VisualDensity.compact,
                        onPressed: _dismissSuggestion,
                        icon: const Icon(Icons.close, color: Colors.white70),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Container(
                      height: 84, width: double.infinity,
                      decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(12)),
                      clipBehavior: Clip.antiAlias,
                      child: widget.channels[widget.currentIndex + 1].logo.isEmpty
                        ? const Center(child: Icon(Icons.live_tv, color: Colors.white70, size: 38))
                        : Image.network(
                            widget.channels[widget.currentIndex + 1].logo,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.live_tv, color: Colors.white70, size: 38)),
                          ),
                    ),
                    const SizedBox(height: 10),
                    Text(widget.channels[widget.currentIndex + 1].name,
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 4),
                    Text(widget.channels[widget.currentIndex + 1].country,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 12),
                    SizedBox(width: double.infinity, child: FilledButton.icon(
                      onPressed: () => widget.onPlayChannel(widget.currentIndex + 1),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('Play next channel'),
                    )),
                    TextButton(
                      onPressed: _dismissSuggestion,
                      child: const Text('Keep watching'),
                    ),
                  ],
                ),
              ),
            )),
          ),
        if (playable) Center(child: IgnorePointer(child: AnimatedOpacity(
          opacity: _gestureValue == null ? 0 : 1,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: 108, padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.65), borderRadius: BorderRadius.circular(16)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(_gestureKind == 'brightness' ? Icons.brightness_6 : Icons.volume_up, color: Colors.white, size: 28),
              const SizedBox(height: 10),
              SizedBox(height: 100, width: 12, child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Align(alignment: Alignment.bottomCenter, child: FractionallySizedBox(
                  heightFactor: (_gestureValue ?? 0).clamp(0.0, 1.0),
                  widthFactor: 1,
                  child: const ColoredBox(color: Colors.white),
                )),
              )),
              const SizedBox(height: 8),
              Text('${((_gestureValue ?? 0) * 100).round()}%', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              Text(_gestureKind == 'brightness' ? 'Brightness' : 'Volume', style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ]),
          ),
        ))),
        Positioned(top: 8, left: 8, child: IconButton.filledTonal(
          tooltip: 'Return to portrait', onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.fullscreen_exit),
        )),
      ])),
    );
  }
}
