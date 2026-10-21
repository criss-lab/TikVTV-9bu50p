import 'package:audio_service/audio_service.dart';
import 'playback.dart';

/// Media notification controls share the existing single Flutter player.
class TikVtvMediaHandler extends BaseAudioHandler with SeekHandler {
  TikVtvMediaHandler(this.player) {
    player.addListener(_sync);
    _sync();
  }
  final SharedPlayback player;
  void _sync() {
    final channel = player.channel;
    mediaItem.add(channel == null ? null : MediaItem(
      id: channel.id, title: channel.name, album: 'TikVTV Live',
      playable: true, isLive: true,
    ));
    playbackState.add(PlaybackState(
      controls: channel == null ? [] : [
        MediaControl.pause, MediaControl.stop,
      ],
      systemActions: const {},
      androidCompactActionIndices: channel == null ? const [] : const [0, 1],
      playing: player.controller?.value.isPlaying ?? false,
      processingState: channel == null ? AudioProcessingState.idle
          : player.loading ? AudioProcessingState.loading : AudioProcessingState.ready,
    ));
  }
  @override
  Future<void> play() async {
    await player.controller?.play();
    _sync();
  }
  @override
  Future<void> pause() async {
    await player.controller?.pause();
    _sync();
  }
  @override
  Future<void> stop() async {
    final channel = player.channel;
    if (channel != null) player.stopIfCurrent(channel.id);
    _sync();
    await super.stop();
  }
}
