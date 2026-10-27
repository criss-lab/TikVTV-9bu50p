import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';
import 'catalogue.dart';
import 'playback_gate.dart';

/// Exactly one active playback owner. All asynchronous work is generation-guarded.
class SharedPlayback extends ChangeNotifier {
  static final SharedPlayback _instance = SharedPlayback._();
  factory SharedPlayback() => _instance;
  SharedPlayback._();

  VideoPlayerController? controller;
  Channel? channel;
  String? error;
  int sourceIndex = 0;
  bool loading = false;
  int _generation = 0;
  Future<void> _disposals = Future<void>.value();
  VideoPlayerController? _candidate;
  Completer<void>? _candidateSettled;
  int _lease = 0;
  static const Duration targetBufferAhead = Duration(seconds: 15);
  static const Duration startupBufferTarget = Duration(seconds: 10);
  static const Duration startupBufferTimeout = Duration(seconds: 18);
  static const Duration lowBufferThreshold = Duration(seconds: 5);
  bool startupBufferReady = false;
  bool get bufferCritical => bufferedAhead < lowBufferThreshold;

  static Duration playableAhead(VideoPlayerValue state) {
    for (final range in state.buffered) {
      if (range.start <= state.position && range.end > state.position) {
        return range.end - state.position;
      }
    }
    return Duration.zero;
  }

  /// Start the native pipeline while the UI still shows its loading surface.
  /// Live sources may expose less than ten seconds; never wait forever for
  /// segments which the broadcaster has not yet published.
  Future<void> _prime(VideoPlayerController player, int token) async {
    final deadline = DateTime.now().add(startupBufferTimeout);
    await player.play().timeout(const Duration(seconds: 8));
    while (token == _generation && !PlaybackGate.instance.locked &&
        !player.value.hasError && DateTime.now().isBefore(deadline)) {
      final ahead = playableAhead(player.value);
      bufferedAhead = ahead;
      if (ahead >= startupBufferTarget) {
        startupBufferReady = true;
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    if (player.value.hasError) throw StateError(player.value.errorDescription ?? 'Preload failed');
    // Best effort for short live windows, with an explicit observable flag.
    startupBufferReady = playableAhead(player.value) >= startupBufferTarget;
  }
  Duration bufferedAhead = Duration.zero;
  bool get bufferBelowTarget => bufferedAhead < targetBufferAhead;
  double get bufferHealth => (bufferedAhead.inMilliseconds / targetBufferAhead.inMilliseconds).clamp(0.0, 1.0);
  bool buffering = false;
  bool _userPaused = false;
  DateTime? _bufferingStartedAt;
  Duration totalBuffering = Duration.zero;
  int rebufferEvents = 0;
  DateTime? _playbackStartedAt;
  Duration? get playbackUptime => _playbackStartedAt == null ? null : DateTime.now().difference(_playbackStartedAt!);
  double? get rebufferRatio {
    final uptime = playbackUptime;
    if (uptime == null || uptime.inMilliseconds == 0) return null;
    final active = _bufferingStartedAt == null ? Duration.zero : DateTime.now().difference(_bufferingStartedAt!);
    return ((totalBuffering + active).inMilliseconds / uptime.inMilliseconds).clamp(0.0, 1.0);
  }
  void _updateBuffering(bool next) {
    if (next == buffering) return;
    if (next) { rebufferEvents++; _bufferingStartedAt = DateTime.now(); }
    else if (_bufferingStartedAt != null) {
      totalBuffering += DateTime.now().difference(_bufferingStartedAt!);
      _bufferingStartedAt = null;
    }
    buffering = next;
  }
  DateTime? _lastRecoveryAt;
  static const Duration stallRecoveryDelay = Duration(seconds: 8);
  static const Duration recoveryCooldown = Duration(seconds: 5);
  int recoveryCount = 0;
  int _lastReportedSecond = -1;
  int _lastReportedBufferSecond = -1;
  bool _lastReportedBuffering = false;
  Timer? _watchdog;
  DateTime? _stalledAt;
  Duration? _previousPosition;
  Duration _previousBufferedAhead = Duration.zero;
  int stallCount = 0;
  int _sameSourceRetries = 0;
  static const int maxSameSourceRetries = 1;
  void _cancelWatchdog() {
    _watchdog?.cancel();
    _watchdog = null;
    _stalledAt = null;
    _previousPosition = null;
    _previousBufferedAhead = Duration.zero;
  }

  /// A route owns only its lease; an older route cannot stop a newer player.
  int get lease => _lease;

  Future<void> _release(VideoPlayerController? player) {
    if (player == null) { return _disposals; }
    _disposals = _disposals.then((_) async {
      try { await player.dispose(); }
      catch (e) { debugPrint('Player dispose failed: $e'); }
    });
    return _disposals;
  }

  void setBackgrounded(bool value) {
    final current = controller;
    if (current == null) { return; }
    if (value) {
      _stalledAt = null;
      // Keep the selected stream running when the screen locks or the user switches apps.
      // Android foreground media-service configuration is installed by configure_android.py.
    } else if (channel != null && !_userPaused && !current.value.hasError) {
      if (!current.value.isPlaying) unawaited(current.play().catchError((Object e) => debugPrint('$e')));
    }
  }

  void setUserPaused(bool paused) {
    _userPaused = paused;
    if (paused) _stalledAt = null;
  }

  Future<void> lockForPayment() async {
    ++_generation;
    _cancelWatchdog();
    final old = controller;
    controller = null;
    channel = null;
    loading = false;
    _updateBuffering(false);
    bufferedAhead = Duration.zero;
    error = null;
    notifyListeners();
    await _release(old);
  }

  Future<void> open(Channel next) async {
    await PlaybackGate.instance.focus(next.id);
    if (PlaybackGate.instance.locked) {
      await lockForPayment();
      return;
    }
    final token = ++_generation;
    _userPaused = false;
    _lease = token;
    _cancelWatchdog();
    _sameSourceRetries = 0;
    _lastRecoveryAt = null;
    _lastReportedSecond = -1;
    _lastReportedBufferSecond = -1;
    bufferedAhead = Duration.zero;
    startupBufferReady = false;
    _updateBuffering(false);
    rebufferEvents = 0;
    totalBuffering = Duration.zero;
    _playbackStartedAt = DateTime.now();
    final previous = controller;
    final pending = _candidateSettled?.future;
    controller = null;
    _candidate = null;
    channel = next;
    sourceIndex = 0;
    error = null;
    loading = true;
    notifyListeners();
    await _release(previous);
    // An initialization that is still in flight owns its candidate until it
    // settles; don't dispose it concurrently with initialize().
    // Do not start a second decoder while the previous initialize is in flight.
    if (pending != null) {
      await pending;
    }
    await _disposals;
    if (token == _generation) { await _trySources(next, token, 0); }
  }

  Future<void> _trySources(Channel selected, int token, int start) async {
    for (var i = start; i < selected.urls.length; i++) {
      if (PlaybackGate.instance.locked) { await lockForPayment(); return; }
      if (token != _generation) { return; }
      _updateBuffering(false);
      sourceIndex = i;
      error = null;
      loading = true;
      notifyListeners();
      final uri = Uri.tryParse(selected.urls[i]);
      if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http') || uri.host.isEmpty) {
        error = 'Source ${i + 1} has an invalid URL';
        notifyListeners();
        continue;
      }
      final candidate = VideoPlayerController.networkUrl(uri, videoPlayerOptions: VideoPlayerOptions(allowBackgroundPlayback: true));
      _candidate = candidate;
      final settled = Completer<void>();
      _candidateSettled = settled;
      try {
        // A timeout does not cancel initialize(). Wait for its completion
        // before disposing the native controller on a timed-out attempt.
        final initialization = candidate.initialize();
        try {
          await initialization.timeout(const Duration(seconds: 15));
        } on TimeoutException {
          recoveryCount++;
          if (token == _generation) {
            error = 'Source ${i + 1} timed out. Waiting for native player cleanup before retry.';
            notifyListeners();
          }
          // Keep ownership until initialization settles; a timeout is not cancellation.
          try { await initialization; } catch (_) { /* release below */ }
          await _release(candidate);
          if (identical(_candidate, candidate)) { _candidate = null; }
          if (token != _generation) { return; }
          continue;
        }
        if (token != _generation) {
          await _release(candidate);
          return;
        }
        await candidate.setLooping(false);
        if (PlaybackGate.instance.locked) { await _release(candidate); return; }
        await _prime(candidate, token);
        if (token != _generation) {
          await _release(candidate);
          return;
        }
        _candidate = null;
        controller = candidate;
        loading = false;
        error = null;
        final fallbackIndex = i + 1;
        _cancelWatchdog();
        _watchdog = Timer.periodic(const Duration(seconds: 2), (_) {
          if (token != _generation || !identical(controller, candidate)) {
            _cancelWatchdog();
            return;
          }
          final state = candidate.value;
          if (_userPaused || !state.isInitialized || state.hasError ||
              (!state.isPlaying && !state.isBuffering)) {
            _stalledAt = null;
            _previousPosition = state.position;
            return;
          }
          // Native ExoPlayer can pause its clock while filling an HLS buffer.
          // Restarting a stream that is actively receiving data discards useful
          // segments and can create an endless play/buffer/reconnect cycle.
          var ahead = Duration.zero;
          for (final range in state.buffered) {
            if (range.start <= state.position && range.end > state.position) {
              ahead = range.end - state.position;
              break;
            }
          }
          final progressing = _previousPosition != state.position ||
              ahead > _previousBufferedAhead + const Duration(milliseconds: 250);
          _previousPosition = state.position;
          _previousBufferedAhead = ahead;
          if (progressing) {
            _stalledAt = null;
            return;
          }
          _stalledAt ??= DateTime.now();
          final now = DateTime.now();
          if (loading || now.difference(_stalledAt!) < stallRecoveryDelay ||
              (_lastRecoveryAt != null && now.difference(_lastRecoveryAt!) < recoveryCooldown)) { return; }
          _lastRecoveryAt = now;
          _cancelWatchdog();
          stallCount++;
          recoveryCount++;
          loading = true;
          _updateBuffering(false);
          error = 'Playback stalled; recovering stream';
          controller = null;
          notifyListeners();
          final retryIndex = _sameSourceRetries < maxSameSourceRetries ? i : fallbackIndex;
          if (retryIndex == i) { _sameSourceRetries++; }
          unawaited(_release(candidate).then((_) {
            if (token == _generation) { return _trySources(selected, token, retryIndex); }
          }));
        });
        candidate.addListener(() {
          if (token != _generation || !identical(controller, candidate)) return;
          if (candidate.value.hasError && !loading) {
            _cancelWatchdog();
            recoveryCount++;
            error = candidate.value.errorDescription ?? 'Stream playback failed';
            loading = true;
            _updateBuffering(false);
            controller = null;
            notifyListeners();
            _sameSourceRetries = 0;
            unawaited(_release(candidate).then((_) {
              if (token == _generation) { return _trySources(selected, token, fallbackIndex); }
            }));
            return;
          }
          _updateBuffering(candidate.value.isBuffering);
          bufferedAhead = playableAhead(candidate.value);
          final second = candidate.value.position.inSeconds;
          final bufferSecond = bufferedAhead.inSeconds;
          if (second != _lastReportedSecond || bufferSecond != _lastReportedBufferSecond || buffering != _lastReportedBuffering) {
            _lastReportedBufferSecond = bufferSecond;
            _lastReportedSecond = second;
            _lastReportedBuffering = buffering;
            notifyListeners();
          }
        });
        notifyListeners();
        return;
      } catch (e) {
        if (identical(_candidate, candidate)) { _candidate = null; }
        await _release(candidate);
        if (token != _generation) { return; }
        error = 'Source ${i + 1} failed: $e';
        notifyListeners();
      } finally {
        if (identical(_candidate, candidate)) { _candidate = null; }
        if (identical(_candidateSettled, settled)) { _candidateSettled = null; }
        if (!settled.isCompleted) { settled.complete(); }
      }
    }
    if (token != _generation) { return; }
    loading = false;
    error = 'All listed sources failed or are unavailable for this device.';
    notifyListeners();
  }

  void stopIfCurrent(String id, {int? lease}) {
    if (channel?.id != id || (lease != null && lease != _lease)) { return; }
    ++_generation;
    _userPaused = false;
    _cancelWatchdog();
    bufferedAhead = Duration.zero;
    startupBufferReady = false;
    _updateBuffering(false);
    final old = controller;
    controller = null;
    channel = null;
    error = null;
    loading = false;
    notifyListeners();
    unawaited(_release(old));
  }
}
