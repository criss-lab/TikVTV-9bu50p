/// Conservative playback-failure triage. A failed stream is not proof of a
/// geographic block: 403 can also mean expired credentials or entitlement.
enum StreamFailureKind {
  possibleGeoRestriction,
  unauthorized,
  unavailable,
  rateLimited,
  network,
  timeout,
  decoder,
  unknown,
}

class StreamFailureDiagnosis {
  final StreamFailureKind kind;
  final bool confirmedGeoRestriction;
  final String explanation;
  const StreamFailureDiagnosis(this.kind, this.explanation,
      {this.confirmedGeoRestriction = false});

  bool get shouldOfferRegionChoice =>
      kind == StreamFailureKind.possibleGeoRestriction;
}

/// Only explicit, trusted provider metadata may confirm a geo restriction.
/// Never derive authorization from a response body or route around DRM.
StreamFailureDiagnosis diagnoseStreamFailure({
  int? httpStatus,
  String? playerError,
  String? providerFailureCode,
}) {
  final code = providerFailureCode?.trim().toUpperCase();
  if (code == 'GEO_BLOCKED' || code == 'REGION_UNAVAILABLE') {
    return const StreamFailureDiagnosis(
      StreamFailureKind.possibleGeoRestriction,
      'The source provider reports that this stream is unavailable in this region.',
      confirmedGeoRestriction: true,
    );
  }
  if (httpStatus == 401 || code == 'AUTH_EXPIRED' || code == 'ENTITLEMENT_REQUIRED') {
    return const StreamFailureDiagnosis(StreamFailureKind.unauthorized,
        'Authentication, source credentials or playback entitlement require verification.');
  }
  if (httpStatus == 403 || httpStatus == 451) {
    return const StreamFailureDiagnosis(StreamFailureKind.possibleGeoRestriction,
        'The source denied access. Region restrictions are one possibility, not a confirmed cause.');
  }
  if (httpStatus == 404 || httpStatus == 410) {
    return const StreamFailureDiagnosis(StreamFailureKind.unavailable,
        'The source URL may have expired or been removed.');
  }
  if (httpStatus == 429) {
    return const StreamFailureDiagnosis(StreamFailureKind.rateLimited,
        'The source is rate-limiting requests; retry after its specified interval.');
  }
  if (httpStatus != null && httpStatus >= 500) {
    return const StreamFailureDiagnosis(StreamFailureKind.network,
        'The upstream source is experiencing a server error.');
  }
  final error = (playerError ?? '').toLowerCase();
  if (error.contains('timeout') || error.contains('timed out')) {
    return const StreamFailureDiagnosis(StreamFailureKind.timeout,
        'The source did not respond in time.');
  }
  if (error.contains('decoder') || error.contains('codec') || error.contains('format')) {
    return const StreamFailureDiagnosis(StreamFailureKind.decoder,
        'The stream format may not be supported on this device.');
  }
  if (error.contains('dns') || error.contains('socket') || error.contains('network')) {
    return const StreamFailureDiagnosis(StreamFailureKind.network,
        'Network connectivity failed; a region restriction has not been established.');
  }
  return const StreamFailureDiagnosis(StreamFailureKind.unknown,
      'The cause is not yet known; retain the source error for diagnostics.');
}

/// Region routing is restricted to a trusted list of regions where the
/// operator/provider explicitly authorizes delivery of this source.
/// No arbitrary global scanning, entitlement bypass or DRM circumvention.
class AuthorizedRegionSelector {
  const AuthorizedRegionSelector();

  String? choose({
    required Set<String> providerAllowedRegions,
    required Set<String> healthyGatewayRegions,
    required Map<String, int> latencyMs,
    String? currentRegion,
  }) {
    final eligible = providerAllowedRegions.intersection(healthyGatewayRegions)
        .where((region) => latencyMs.containsKey(region)).toList()
      ..sort((a, b) {
        final latency = latencyMs[a]!.compareTo(latencyMs[b]!);
        return latency != 0 ? latency : a.compareTo(b);
      });
    if (currentRegion != null && eligible.contains(currentRegion) &&
        latencyMs[currentRegion]! <= latencyMs[eligible.first]! + 20) {
      return currentRegion; // avoid unnecessary tunnel churn
    }
    return eligible.isEmpty ? null : eligible.first;
  }
}
