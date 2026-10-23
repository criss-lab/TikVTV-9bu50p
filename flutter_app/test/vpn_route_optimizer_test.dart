import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/vpn_route_optimizer.dart';

void main() {
  final now = DateTime.utc(2026, 10, 23, 12);
  VpnGatewaySample sample(String id, String region, int rtt,
      {double loss = 0, double load = 0, DateTime? seen}) =>
    VpnGatewaySample(id: id, region: region, rttMs: rtt,
      packetLossPercent: loss, loadPercent: load, lastSeen: seen ?? now);

  test('no provider-authorized region means no route', () {
    expect(const VpnRouteOptimizer().select(
      samples: [sample('a', 'eu', 20)], authorizedRegions: {},
      now: now), isNull);
  });
  test('rejects stale, lossy and unauthorized gateways', () {
    final result = const VpnRouteOptimizer().select(samples: [
      sample('unauthorized', 'us', 1),
      sample('stale', 'eu', 1, seen: now.subtract(const Duration(minutes: 4))),
      sample('lossy', 'eu', 2, loss: 7),
      sample('valid', 'eu', 60),
    ], authorizedRegions: {'eu'}, now: now);
    expect(result?.id, 'valid');
  });
  test('hysteresis prevents unnecessary switches', () {
    final result = const VpnRouteOptimizer().select(samples: [
      sample('current', 'eu', 60), sample('alternative', 'eu', 55),
    ], authorizedRegions: {'eu'}, now: now, currentGatewayId: 'current');
    expect(result?.id, 'current');
  });
  test('switches when improvement is significant and cooldown elapsed', () {
    final result = const VpnRouteOptimizer().select(samples: [
      sample('current', 'eu', 100), sample('alternative', 'eu', 40),
    ], authorizedRegions: {'eu'}, now: now, currentGatewayId: 'current',
      lastSwitchAt: now.subtract(const Duration(minutes: 4)));
    expect(result?.id, 'alternative');
  });
  test('cooldown prevents flapping', () {
    final result = const VpnRouteOptimizer().select(samples: [
      sample('current', 'eu', 100), sample('alternative', 'eu', 40),
    ], authorizedRegions: {'eu'}, now: now, currentGatewayId: 'current',
      lastSwitchAt: now.subtract(const Duration(seconds: 30)));
    expect(result?.id, 'current');
  });
  test('reconnect delays are bounded', () {
    expect(reconnectBackoff(0), const Duration(seconds: 2));
    expect(reconnectBackoff(20), const Duration(seconds: 120));
  });
}
