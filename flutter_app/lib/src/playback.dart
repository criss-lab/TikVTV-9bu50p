import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';
import 'catalogue.dart';

/// One owner for the media decoder and network connection across channel pages.
class SharedPlayback extends ChangeNotifier {
  static final SharedPlayback _instance = SharedPlayback._();
  factory SharedPlayback() => _instance;
  SharedPlayback._();

  VideoPlayerController? controller;
  Channel? channel;
  String? error;
  int sourceIndex = 0;
  int _generation = 0;
  bool loading = false;
  bool _backgrounded = false;
  Future<void> _disposeQueue = Future.value();

  Future<void> _release(VideoPlayerController? previous) {
    if (previous == null) return _disposeQueue;
    _disposeQueue = _disposeQueue.catchError((Object _) {}).then((_) async {
      try { await previous.dispose(); } catch (e) { debugPrint('Player disposal: $e'); }
    });
    return _disposeQueue;
  }

  void setBackgrounded(bool value) {
    _backgrounded = value;
    final active = controller;
    if (active == null) return;
    if (value) { unawaited(active.pause()); }
    else if (channel != null && !active.value.hasError) { unawaited(active.play()); }
  }

  Future<void> open(Channel next) async {
    final token = ++_generation;
    final old = controller;
    controller = null;
    channel = next;
    sourceIndex = 0;
    error = null;
    loading = true;
    notifyListeners();
    await _release(old);
    if (token != _generation) return;
    for (var index = 0; index < next.urls.length; index++) {
      if (token != _generation) return;
      sourceIndex = index;
      error = null;
      notifyListeners();
      final candidate = VideoPlayerController.networkUrl(Uri.parse(next.urls[index]));
      try {
        await candidate.initialize().timeout(const Duration(seconds: 15));
        if (token != _generation) { await _release(candidate); return; }
        await candidate.setLooping(false);
        if (!_backgrounded) await candidate.play().timeout(const Duration(seconds: 8));
        if (token != _generation) { await candidate.dispose(); return; }
        controller = candidate;
        loading = false;
        candidate.addListener(() {
          if (token != _generation) return;
          if (candidate.value.hasError && !loading) {
            error = candidate.value.errorDescription ?? 'Stream playback failed';
            loading = true;
            unawaited(_recover(next, token, index + 1));
          }
          notifyListeners();
        });
        notifyListeners();
        return;
      } catch (e) {
        await _release(candidate);
        if (token != _generation) return;
        error = 'Source ${index + 1} failed: $e';
        notifyListeners();
      }
    }
    loading = false;
    error = 'No playable source found for this channel. Sources may be offline or restricted.';
    notifyListeners();
  }

  Future<void> _recover(Channel next, int token, int nextIndex) async {
    if (token != _generation) return;
    final old = controller;
    controller = null;
    notifyListeners();
    await _release(old);
    if (token != _generation) return;
    if (nextIndex >= next.urls.length) {
      loading = false;
      error = 'Playback failed and no alternative sources remain.';
      notifyListeners();
      return;
    }
    // Resume with the remaining sources without restarting the failed one.
    for (var i = nextIndex; i < next.urls.length; i++) {
      if (token != _generation) return;
      sourceIndex = i;
      final candidate = VideoPlayerController.networkUrl(Uri.parse(next.urls[i]));
      try {
        await candidate.initialize().timeout(const Duration(seconds: 15));
        if (token != _generation) { await _release(candidate); return; }
        if (!_backgrounded) await candidate.play().timeout(const Duration(seconds: 8));
        if (token != _generation) { await _release(candidate); return; }
        controller = candidate;
        loading = false;
        error = null;
        candidate.addListener(() {
          if (token != _generation || controller != candidate) return;
          if (candidate.value.hasError && !loading) {
            loading = true;
            error = candidate.value.errorDescription ?? 'Stream playback failed';
            unawaited(_recover(next, token, i + 1));
          }
          notifyListeners();
        });
        notifyListeners();
        return;
      } catch (e) {
        await _release(candidate);
        if (token != _generation) return;
        error = 'Source ${i + 1} failed: $e';
        notifyListeners();
      }
    }
    loading = false;
    error = 'All available stream sources failed.';
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
