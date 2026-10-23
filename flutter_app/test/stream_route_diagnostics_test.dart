import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/stream_route_diagnostics.dart';

void main() {
  test('403 is possible, not confirmed, geo restriction', () {
    final result = diagnoseStreamFailure(httpStatus: 403);
    expect(result.kind, StreamFailureKind.possibleGeoRestriction);
    expect(result.confirmedGeoRestriction, isFalse);
  });
  test('trusted provider code confirms restriction', () {
    expect(diagnoseStreamFailure(providerFailureCode: 'GEO_BLOCKED')
        .confirmedGeoRestriction, isTrue);
  });
  test('expired auth and missing URL are not geo failures', () {
    expect(diagnoseStreamFailure(httpStatus: 401).kind, StreamFailureKind.unauthorized);
    expect(diagnoseStreamFailure(httpStatus: 410).kind, StreamFailureKind.unavailable);
  });
  test('only provider-authorized and healthy regions can be chosen', () {
    final selected = const AuthorizedRegionSelector().choose(
      providerAllowedRegions: {'eu-central-1', 'us-east-1'},
      healthyGatewayRegions: {'eu-central-1', 'ap-south-1'},
      latencyMs: {'eu-central-1': 70, 'ap-south-1': 1, 'us-east-1': 5},
    );
    expect(selected, 'eu-central-1');
  });
  test('returns null when no authorized gateway exists', () {
    expect(const AuthorizedRegionSelector().choose(
      providerAllowedRegions: {'us-east-1'},
      healthyGatewayRegions: {'eu-central-1'},
      latencyMs: {'eu-central-1': 20},
    ), isNull);
  });
  test('keeps a healthy current route within 20ms of best route', () {
    expect(const AuthorizedRegionSelector().choose(
      providerAllowedRegions: {'a', 'b'},
      healthyGatewayRegions: {'a', 'b'},
      latencyMs: {'a': 30, 'b': 45},
      currentRegion: 'b',
    ), 'b');
  });
}
