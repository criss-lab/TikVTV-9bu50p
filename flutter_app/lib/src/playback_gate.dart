import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'native_backend.dart';

/// Native playback allowance. Entitlements are always read from the existing
/// server-verified PesaPal subscription; the device cannot grant premium.
class PlaybackGate extends ChangeNotifier {
  PlaybackGate._();
  static final instance = PlaybackGate._();
  static const allowance = Duration(minutes: 15);
  static const _startedKey = 'tikvtv_native_trial_started_at_v1';
  DateTime? _started;
  Timer? _timer;
  bool active = false;
  bool locked = true;
  bool checking = false;
  Duration remaining = allowance;
  Future<void> Function()? onLock;
  Future<void>? _inflight;

  Future<void> start() => _inflight ??= _check().whenComplete(() => _inflight = null);

  Future<void> _check() async {
    checking = true;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_startedKey);
      _started = stored == null ? null : DateTime.tryParse(stored)?.toUtc();
      final backend = NativeBackend.instance;
      // Anonymous viewing uses the same persistent allowance on this device.
      active = backend.signedIn && await backend.hasPlaybackEntitlement();
      if (!active && _started == null) {
        _started = DateTime.now().toUtc();
        await prefs.setString(_startedKey, _started!.toIso8601String());
      }
      _tick();
      _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    } catch (e) {
      debugPrint('Playback entitlement unavailable: $e');
      // Never grant paid access on a failed entitlement request.
      active = false;
      _tick();
      _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    } finally {
      checking = false;
      notifyListeners();
    }
  }

  void _tick() {
    final previous = locked;
    final elapsed = _started == null ? allowance : DateTime.now().toUtc().difference(_started!);
    remaining = allowance - (elapsed.isNegative ? Duration.zero : elapsed);
    if (remaining.isNegative) remaining = Duration.zero;
    locked = !active && remaining == Duration.zero;
    if (locked && !previous) unawaited(onLock?.call() ?? Future<void>.value());
    notifyListeners();
  }

  Future<void> refresh() => start();
  void disposeTimer() { _timer?.cancel(); _timer = null; }
}
