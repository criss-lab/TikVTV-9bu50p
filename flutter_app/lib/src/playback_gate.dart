import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'native_backend.dart';

/// Native playback allowance. Paid access is always revalidated by the server.
class PlaybackGate extends ChangeNotifier {
  PlaybackGate._();
  static final instance = PlaybackGate._();
  static const allowance = Duration(minutes: 15);
  static const _startedKey = 'tikvtv_native_trial_started_at_v1';
  static const _entitlementRefreshInterval = Duration(seconds: 3);
  DateTime? _started;
  Timer? _timer;
  Timer? _entitlementTimer;
  DateTime? _verifiedPaidExpiry;
  bool active = false;
  bool locked = true;
  bool checking = false;
  Duration remaining = allowance;
  Future<void> Function()? onLock;
  Future<void>? _inflight;
  int _statusVersion = 0;

  Future<void> start() => _inflight ??= _check().whenComplete(() => _inflight = null);

  Future<void> _check() async {
    final version = _statusVersion;
    checking = true;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_startedKey);
      final parsed = stored == null ? null : DateTime.tryParse(stored)?.toUtc();

      // Start the one-time preview clock on first gate use even when Premium is
      // currently active. Otherwise a paid subscription expiring later would
      // accidentally create a fresh 15-minute preview.
      _started = parsed ?? DateTime.now().toUtc();
      if (parsed == null) {
        await prefs.setString(_startedKey, _started!.toIso8601String());
      }

      final backend = NativeBackend.instance;
      if (!backend.signedIn) {
        active = false;
        _verifiedPaidExpiry = null;
      } else {
        final status = await backend.premiumStatus();
        final expiry = DateTime.tryParse(status['ends_at']?.toString() ?? '')?.toUtc();
        if (version != _statusVersion) return;
        _verifiedPaidExpiry = status['active'] == true ? expiry : null;
        active = _verifiedPaidExpiry != null && _verifiedPaidExpiry!.isAfter(DateTime.now().toUtc());
      }
      _tick();
    } catch (e) {
      debugPrint('Playback entitlement unavailable: $e');
      // Fail closed for paid access; only the already-started preview can apply.
      active = NativeBackend.instance.signedIn && _verifiedPaidExpiry != null && _verifiedPaidExpiry!.isAfter(DateTime.now().toUtc());
      _tick();
    } finally {
      checking = false;
      _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => _tick());
      // Re-check server entitlement while a channel remains focused. Without
      // this, an expired subscription could keep playing indefinitely until
      // the user swiped to another channel or reopened Premium.
      _entitlementTimer ??= Timer.periodic(_entitlementRefreshInterval, (_) {
        if (!checking) unawaited(start());
      });
      notifyListeners();
    }
  }

  void _tick() {
    final previous = locked;
    final elapsed = _started == null
        ? allowance
        : DateTime.now().toUtc().difference(_started!);
    remaining = allowance - (elapsed.isNegative ? Duration.zero : elapsed);
    if (remaining.isNegative) remaining = Duration.zero;
    if (active && (_verifiedPaidExpiry == null || !_verifiedPaidExpiry!.isAfter(DateTime.now().toUtc()))) active = false;
    locked = !active && remaining == Duration.zero;
    if (locked && !previous) unawaited(onLock?.call() ?? Future<void>.value());
    notifyListeners();
  }

  void acceptVerifiedStatus(Map<String, dynamic> status) {
    ++_statusVersion;
    final expiry = DateTime.tryParse(status['ends_at']?.toString() ?? '')?.toUtc();
    _verifiedPaidExpiry = status['active'] == true ? expiry : null;
    active = NativeBackend.instance.signedIn && _verifiedPaidExpiry != null && _verifiedPaidExpiry!.isAfter(DateTime.now().toUtc());
    _tick();
  }

  Future<void> refresh() async {
    if (_inflight != null) await _inflight;
    await start();
  }

  void disposeTimer() {
    _timer?.cancel();
    _timer = null;
    _entitlementTimer?.cancel();
    _entitlementTimer = null;
  }
}
