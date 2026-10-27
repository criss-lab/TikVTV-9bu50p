import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';
import 'package:tikvtv/src/playback.dart';

void main() {
  test('buffer ahead follows playback position continuously', () {
    VideoPlayerValue value(Duration position) => VideoPlayerValue(
      duration: const Duration(hours: 1),
      position: position,
      buffered: <DurationRange>[
        DurationRange(const Duration(minutes: 2), const Duration(minutes: 2, seconds: 45)),
      ],
    );
    expect(SharedPlayback.playableAhead(value(const Duration(minutes: 2, seconds: 30))), const Duration(seconds: 15));
    expect(SharedPlayback.playableAhead(value(const Duration(minutes: 2, seconds: 35))), const Duration(seconds: 10));
    expect(SharedPlayback.playableAhead(value(const Duration(minutes: 2, seconds: 45))), Duration.zero);
  });

  test('stale native buffering is hidden only while playback position advances', () {
    expect(SharedPlayback.shouldShowBuffering(nativeBuffering: true, isPlaying: true, positionAdvanced: true), isFalse);
    expect(SharedPlayback.shouldShowBuffering(nativeBuffering: true, isPlaying: true, positionAdvanced: false), isTrue);
    expect(SharedPlayback.shouldShowBuffering(nativeBuffering: true, isPlaying: false, positionAdvanced: true), isTrue);
    expect(SharedPlayback.shouldShowBuffering(nativeBuffering: false, isPlaying: true, positionAdvanced: false), isFalse);
  });

  test('disjoint buffered ranges cannot masquerade as playable lead', () {
    final value = VideoPlayerValue(duration: const Duration(hours: 1), position: const Duration(seconds: 10), buffered: <DurationRange>[
      DurationRange(const Duration(seconds: 12), const Duration(seconds: 40)),
    ]);
    expect(SharedPlayback.playableAhead(value), Duration.zero);
  });
}
