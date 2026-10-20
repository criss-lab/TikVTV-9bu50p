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

  Future<void> open(Channel next) async {
    final token = ++_generation;
    final old = controller;
    controller = null;
    channel = next;
    sourceIndex = 0;
    error = null;
    notifyListeners();
    if (old != null) await old.dispose();
    if (token != _generation) return;
    for (var index = 0; index < next.urls.length; index++) {
      if (token != _generation) return;
      sourceIndex = index;
      error = null;
      notifyListeners();
      final candidate = VideoPlayerController.networkUrl(Uri.parse(next.urls[index]));
      try {
        await candidate.initialize().timeout(const Duration(seconds: 15));
        if (token != _generation) { await candidate.dispose(); return; }
        await candidate.setLooping(false);
        await candidate.play().timeout(const Duration(seconds: 8));
        if (token != _generation) { await candidate.dispose(); return; }
        controller = candidate;
        candidate.addListener(() {
          if (token != _generation) return;
          if (candidate.value.hasError) {
            error = candidate.value.errorDescription ?? 'Stream playback failed';
          }
          notifyListeners();
        });
        notifyListeners();
        return;
      } catch (e) {
        await candidate.dispose();
        if (token != _generation) return;
        error = 'Source ${index + 1} failed: $e';
        notifyListeners();
      }
    }
    error = 'No playable source found for this channel. Sources may be offline or restricted.';
    notifyListeners();
  }

  void stopIfCurrent(String id) {
    if (channel?.id != id) return;
    ++_generation;
    final old = controller;
    controller = null;
    channel = null;
    error = null;
    notifyListeners();
    if (old != null) unawaited(old.dispose());
  }
}
