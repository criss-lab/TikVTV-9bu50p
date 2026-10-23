import 'dart:async';
import 'package:flutter/foundation.dart';
import 'native_backend.dart';

/// Render/Neon owns all seven distinct fifteen-minute preview allocations.
/// The device only caches verified deadlines; it never grants a local trial.
class PlaybackGate extends ChangeNotifier {
  PlaybackGate._() { _backend.addListener(_identityChanged); }
  static final instance = PlaybackGate._();
  static const _refreshInterval = Duration(seconds: 3);
  static const _stableRefreshInterval = Duration(seconds: 30);
  DateTime? _lastVerifiedAt;
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
  int get previewsLimit => _backend.signedIn || _backend.tvPaired ? 7 : 3;
  Future<void> Function()? onLock;

  void _identityChanged() {
    final account = _backend.signedIn ? (_backend.user?['id']?.toString()) : (_backend.tvPaired ? 'paired-tv' : null);
    if (account == _accountId) return;
    ++_revision;
    _accountId = account;
    _paidUntil = null;
    _previewUntil = null;
    _lastVerifiedAt = null;
    ready = false;
    _apply();
    if (_channelId != null) unawaited(refresh());
  }

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
    if (locked != wasLocked || remaining.inSeconds != _lastNotifiedSecond || active != _lastNotifiedActive) {
      _lastNotifiedSecond = remaining.inSeconds;
      _lastNotifiedActive = active;
      notifyListeners();
    }
  }

  int _lastNotifiedSecond = -1;
  bool _lastNotifiedActive = false;

  void _ensureTimers() {
    _timer ??= Timer.periodic(const Duration(seconds: 1), (_) => _apply());
    _poll ??= Timer.periodic(_refreshInterval, (_) {
      if (checking || _channelId == null) return;
      final interval = !locked && !verificationUnavailable ? _stableRefreshInterval : _refreshInterval;
      if (_lastVerifiedAt != null && DateTime.now().difference(_lastVerifiedAt!) < interval) return;
      unawaited(refresh());
    });
  }

  /// Called on focus, including swipes. Allocations are keyed by account/channel on Render.
  Future<void> focus(String channelId) async {
    final account = _backend.signedIn ? (_backend.user?['id']?.toString()) : (_backend.tvPaired ? 'paired-tv' : null);
    if (_channelId != channelId || _accountId != account) {
      ++_revision;
      final accountChanged = _accountId != account;
      _channelId = channelId;
      _accountId = account;
      if (accountChanged) { _paidUntil = null; _lastVerifiedAt = null; }
      _previewUntil = null;
      if ((!_backend.signedIn && !_backend.tvPaired) || account == null) _paidUntil = null;
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
      {
        final status = _backend.signedIn ? await _backend.viewingAccess(channel) : _backend.tvPaired ? await _backend.tvViewingAccess(channel) : await _backend.guestViewingAccess(channel);
        if (revision != _revision || account != (_backend.signedIn ? (_backend.user?['id']?.toString()) : (_backend.tvPaired ? 'paired-tv' : null))) return;
        _paidUntil = status['active'] == true ? _parse(status['ends_at']) : null;
        _previewUntil = status['allowed'] == true && status['active'] != true ? _parse(status['preview_ends_at']) : null;
        previewsUsed = (status['previews_used'] as num?)?.toInt() ?? previewsUsed;
        verificationUnavailable = false;
        _lastVerifiedAt = DateTime.now();
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
    _paidUntil = status['active'] == true && (_backend.signedIn || _backend.tvPaired) ? _parse(status['ends_at']) : null;
    if (_paidUntil != null) _previewUntil = null;
    verificationUnavailable = false;
    _lastVerifiedAt = DateTime.now();
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
