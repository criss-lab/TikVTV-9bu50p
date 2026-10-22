import 'dart:async';
import 'package:flutter/foundation.dart';
import 'native_backend.dart';

/// Render/Neon owns all seven distinct fifteen-minute preview allocations.
/// The device only caches verified deadlines; it never grants a local trial.
class PlaybackGate extends ChangeNotifier {
  PlaybackGate._();
  static final instance = PlaybackGate._();
  static const _refreshInterval = Duration(seconds: 3);
  final NativeBackend _backend = NativeBackend.instance;
  Timer? _timer;
  Timer? _poll;
  DateTime? _paidUntil;
  DateTime? _previewUntil;
  String? _channelId;
  String? _accountId;
  int _revision = 0;
  Future<void>? _inflight;
  bool active = false;
  bool locked = true;
  bool ready = false;
  bool checking = false;
  bool verificationUnavailable = false;
  Duration remaining = Duration.zero;
  int previewsUsed = 0;
  static const previewsLimit = 7;
  Future<void> Function()? onLock;

  bool get _paid => _paidUntil?.isAfter(DateTime.now().toUtc()) ?? false;
  bool get _preview => _previewUntil?.isAfter(DateTime.now().toUtc()) ?? false;
  DateTime? _parse(dynamic value) => DateTime.tryParse(value?.toString() ?? '')?.toUtc();

  void _apply() {
    final wasLocked = locked;
    active = _paid;
    final until = _paid ? _paidUntil : _previewUntil;
    final duration = until?.difference(DateTime.now().toUtc()) ?? Duration.zero;
    remaining = duration.isNegative ? Duration.zero : duration;
    locked = !_paid && !_preview;
    if (locked && !wasLocked) unawaited(onLock?.call() ?? Future<void>.value());
    notifyListeners();
  }

  void _ensureTimers() {
    _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => _apply());
    _poll ??= Timer.periodic(_refreshInterval, (_) {
      if (!checking && _backend.signedIn && _channelId != null) unawaited(refresh());
    });
  }

  /// Called on focus, including swipes. Allocations are keyed by account/channel on Render.
  Future<void> focus(String channelId) async {
    final account = _backend.user?['id']?.toString();
    if (_channelId != channelId || _accountId != account) {
      ++_revision;
      _channelId = channelId;
      _accountId = account;
      _previewUntil = null;
      if (!_backend.signedIn || account == null) _paidUntil = null;
      ready = false;
      verificationUnavailable = false;
      _apply();
    }
    _ensureTimers();
    await refresh();
  }

  Future<void> start() async {
    _ensureTimers();
    if (_channelId != null) await refresh();
  }

  Future<void> refresh() async {
    if (_inflight != null) await _inflight;
    final channel = _channelId;
    if (channel == null) return;
    final revision = _revision;
    final account = _accountId;
    final work = _verify(channel, account, revision);
    _inflight = work;
    try { await work; } finally { if (identical(_inflight, work)) _inflight = null; }
  }

  Future<void> _verify(String channel, String? account, int revision) async {
    checking = true;
    notifyListeners();
    try {
      if (!_backend.signedIn || account == null) {
        if (revision != _revision) return;
        _paidUntil = null;
        _previewUntil = null;
        verificationUnavailable = false;
      } else {
        final status = await _backend.viewingAccess(channel);
        if (revision != _revision || account != _backend.user?['id']?.toString()) return;
        _paidUntil = status['active'] == true ? _parse(status['ends_at']) : null;
        _previewUntil = status['allowed'] == true && status['active'] != true ? _parse(status['preview_ends_at']) : null;
        previewsUsed = (status['previews_used'] as num?)?.toInt() ?? previewsUsed;
        verificationUnavailable = false;
      }
    } catch (error) {
      if (revision != _revision) return;
      verificationUnavailable = true;
      debugPrint('Viewing access check unavailable: $error');
      // A transient network failure cannot revoke an unexpired verified deadline.
    } finally {
      if (revision == _revision) {
        checking = false;
        ready = true;
        _apply();
      }
    }
  }

  /// The Premium screen can immediately publish a server-verified paid result.
  void acceptVerifiedStatus(Map<String, dynamic> status) {
    ++_revision;
    _paidUntil = status['active'] == true && _backend.signedIn ? _parse(status['ends_at']) : null;
    verificationUnavailable = false;
    ready = true;
    _ensureTimers();
    _apply();
  }

  void disposeTimer() {
    _timer?.cancel();
    _timer = null;
    _poll?.cancel();
    _poll = null;
  }
}
