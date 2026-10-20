import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';
import 'catalogue.dart';

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
  bool _backgrounded = false;
  int _generation = 0;
  Future<void> _disposals = Future<void>.value();
  VideoPlayerController? _candidate;

  Future<void> _release(VideoPlayerController? player) {
    if (player == null) return _disposals;
    _disposals = _disposals.then((_) async {
      try { await player.dispose(); }
      catch (e) { debugPrint('Player dispose failed: $e'); }
    });
    return _disposals;
  }

  void setBackgrounded(bool value) {
    _backgrounded = value;
    final current = controller;
    if (current == null) return;
    if (value) {
      unawaited(current.pause().catchError((Object e) => debugPrint('$e')));
    } else if (channel != null && !current.value.hasError) {
      unawaited(current.play().catchError((Object e) => debugPrint('$e')));
    }
  }

  Future<void> open(Channel next) async {
    final token = ++_generation;
    final previous = controller;
    final pending = _candidate;
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
      while (identical(_candidate, pending) && token == _generation) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    }
    await _disposals;
    if (token == _generation) await _trySources(next, token, 0);
  }

  Future<void> _trySources(Channel selected, int token, int start) async {
    for (var i = start; i < selected.urls.length; i++) {
      if (token != _generation) return;
      sourceIndex = i;
      error = null;
      loading = true;
      notifyListeners();
      final candidate = VideoPlayerController.networkUrl(Uri.parse(selected.urls[i]));
      _candidate = candidate;
      try {
        // A timeout does not cancel initialize(). Wait for its completion
        // before disposing the native controller on a timed-out attempt.
        final initialization = candidate.initialize();
        try {
          await initialization.timeout(const Duration(seconds: 15));
        } on TimeoutException {
          error = 'Source ${i + 1} timed out. Waiting for native player cleanup before retry.';
          notifyListeners();
          // Keep ownership until initialization settles; a timeout is not cancellation.
          try { await initialization; } catch (_) { /* release below */ }
          await _release(candidate);
          if (identical(_candidate, candidate)) _candidate = null;
          if (token != _generation) return;
          continue;
        }
        if (token != _generation) {
          await _release(candidate);
          return;
        }
        await candidate.setLooping(false);
        if (!_backgrounded) await candidate.play().timeout(const Duration(seconds: 8));
        if (token != _generation) {
          await _release(candidate);
          return;
        }
        _candidate = null;
        controller = candidate;
        loading = false;
        error = null;
        final fallbackIndex = i + 1;
        candidate.addListener(() {
          if (token != _generation || !identical(controller, candidate)) return;
          if (candidate.value.hasError && !loading) {
            error = candidate.value.errorDescription ?? 'Stream playback failed';
            loading = true;
            controller = null;
            notifyListeners();
            unawaited(_release(candidate).then((_) {
              if (token == _generation) return _trySources(selected, token, fallbackIndex);
            }));
            return;
          }
          notifyListeners();
        });
        notifyListeners();
        return;
      } catch (e) {
        if (identical(_candidate, candidate)) _candidate = null;
        await _release(candidate);
        if (token != _generation) return;
        error = 'Source ${i + 1} failed: $e';
        notifyListeners();
      } finally {
        if (identical(_candidate, candidate)) _candidate = null;
      }
    }
    if (token != _generation) return;
    loading = false;
    error = 'All listed sources failed or are unavailable for this device.';
    notifyListeners();
  }

  void stopIfCurrent(String id) {
    if (channel?.id != id) return;
    ++_generation;
    final old = controller;
    controller = null;
    channel = null;
    error = null;
    loading = false;
    notifyListeners();
    unawaited(_release(old));
  }
}
