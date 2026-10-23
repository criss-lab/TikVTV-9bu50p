import 'dart:math' as math;

/// Pure route-selection logic. Measurements come from authenticated gateway
/// health reports, not guesses based on channel playback failures.
class VpnGatewaySample {
  const VpnGatewaySample({
    required this.id,
    required this.region,
    required this.rttMs,
    required this.packetLossPercent,
    required this.lastSeen,
    this.loadPercent = 0,
  });

  final String id;
  final String region;
  final int rttMs;
  final double packetLossPercent;
  final double loadPercent;
  final DateTime lastSeen;

  bool healthyAt(DateTime now) =>
      rttMs >= 0 && rttMs <= 2000 &&
      packetLossPercent >= 0 && packetLossPercent <= 5 &&
      loadPercent >= 0 && loadPercent <= 90 &&
      !lastSeen.isAfter(now.add(const Duration(seconds: 30))) &&
      now.difference(lastSeen) <= const Duration(minutes: 2);

  double get score => rttMs + packetLossPercent * 30 + loadPercent * 0.8;
}

class VpnRouteOptimizer {
  const VpnRouteOptimizer({
    this.switchImprovement = 0.20,
    this.switchCooldown = const Duration(minutes: 3),
  });

  final double switchImprovement;
  final Duration switchCooldown;

  /// Only explicitly provider-authorized regions may be considered.
  /// A missing permission set means no automatic route selection.
  VpnGatewaySample? select({
    required List<VpnGatewaySample> samples,
    required Set<String> authorizedRegions,
    required DateTime now,
    String? currentGatewayId,
    DateTime? lastSwitchAt,
  }) {
    final candidates = samples.where((sample) =>
        authorizedRegions.contains(sample.region) && sample.healthyAt(now)).toList()
      ..sort((a, b) {
        final byScore = a.score.compareTo(b.score);
        return byScore != 0 ? byScore : a.id.compareTo(b.id);
      });
    if (candidates.isEmpty) return null;
    final best = candidates.first;
    VpnGatewaySample? current;
    for (final sample in candidates) {
      if (sample.id == currentGatewayId) { current = sample; break; }
    }
    if (current == null) return best;
    if (lastSwitchAt != null && now.difference(lastSwitchAt) < switchCooldown) {
      return current;
    }
    final improvement = (current.score - best.score) / math.max(current.score, 1);
    return improvement >= switchImprovement ? best : current;
  }
}

/// Delay repeated reconnects after failures to avoid battery drain and
/// hammering a down gateway. This computes delays; it does not auto-connect
/// without prior user consent and an active authorized VPN session.
Duration reconnectBackoff(int consecutiveFailures) {
  final exponent = consecutiveFailures.clamp(0, 6);
  return Duration(seconds: math.min(120, 2 * (1 << exponent)));
}
