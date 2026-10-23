import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Optional Infinity VPN bridge for the TikVTV Android build.
///
/// The Android host must implement these method-channel methods with a
/// foreground WireGuard VpnService. Never place WireGuard private keys,
/// Supabase service-role keys, or gateway credentials in this Dart layer.
/// A VPN can improve routing but cannot restore a dead/unauthorized stream.
enum InfinityVpnState { unsupported, disconnected, permissionRequired, connecting, connected, failed }

class InfinityVpnBridge extends ChangeNotifier {
  InfinityVpnBridge({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('com.infinity.vpn/tunnel');

  final MethodChannel _channel;
  InfinityVpnState state = InfinityVpnState.disconnected;
  String? lastError;
  bool get connected => state == InfinityVpnState.connected;

  Future<void> refresh() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      state = InfinityVpnState.unsupported;
      notifyListeners();
      return;
    }
    try {
      final value = await _channel.invokeMethod<String>('status');
      state = switch (value) {
        'connected' => InfinityVpnState.connected,
        'connecting' => InfinityVpnState.connecting,
        'permission_required' => InfinityVpnState.permissionRequired,
        _ => InfinityVpnState.disconnected,
      };
      lastError = null;
    } on MissingPluginException {
      state = InfinityVpnState.unsupported;
      lastError = 'Infinity VPN Android integration is not installed in this build.';
    } on PlatformException catch (e) {
      state = InfinityVpnState.failed;
      lastError = e.message ?? 'Unable to read VPN status';
    }
    notifyListeners();
  }

  /// Call only from an explicit user action. The native Android implementation
  /// must use VpnService.prepare and obtain system consent before connecting.
  Future<void> connect() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      state = InfinityVpnState.unsupported;
      notifyListeners();
      return;
    }
    state = InfinityVpnState.connecting;
    lastError = null;
    notifyListeners();
    try {
      final result = await _channel.invokeMethod<String>('connect');
      state = result == 'connected'
          ? InfinityVpnState.connected
          : InfinityVpnState.permissionRequired;
    } on MissingPluginException {
      state = InfinityVpnState.unsupported;
      lastError = 'This APK does not include the Infinity VPN native module.';
    } on PlatformException catch (e) {
      state = InfinityVpnState.failed;
      lastError = e.message ?? 'VPN connection failed';
    }
    notifyListeners();
  }

  Future<void> disconnect() async {
    try {
      await _channel.invokeMethod<void>('disconnect');
      state = InfinityVpnState.disconnected;
      lastError = null;
    } on MissingPluginException {
      state = InfinityVpnState.unsupported;
    } on PlatformException catch (e) {
      state = InfinityVpnState.failed;
      lastError = e.message ?? 'VPN disconnection failed';
    }
    notifyListeners();
  }
}
