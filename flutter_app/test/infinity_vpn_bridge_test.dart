import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/infinity_vpn_bridge.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('infinity-vpn-test');
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test('reports native status without claiming a tunnel exists', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'status') return 'disconnected';
      return null;
    });
    final bridge = InfinityVpnBridge(channel: channel);
    await bridge.refresh();
    expect(bridge.state, InfinityVpnState.disconnected);
    bridge.dispose();
  });

  test('connect requires native confirmation', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'connect') return 'permission_required';
      return null;
    });
    final bridge = InfinityVpnBridge(channel: channel);
    await bridge.connect();
    expect(bridge.connected, isFalse);
    expect(bridge.state, InfinityVpnState.permissionRequired);
    bridge.dispose();
  });

  test('native failures are visible and never reported as connected', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    messenger.setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'gateway_down', message: 'Gateway unavailable');
    });
    final bridge = InfinityVpnBridge(channel: channel);
    await bridge.connect();
    expect(bridge.connected, isFalse);
    expect(bridge.lastError, 'Gateway unavailable');
    bridge.dispose();
  });
}
