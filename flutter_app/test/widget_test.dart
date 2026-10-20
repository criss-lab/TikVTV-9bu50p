import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/main.dart';

void main() {
  testWidgets('TikVTV displays its channel shell', (tester) async {
    await tester.pumpWidget(const TikVTV());
    expect(find.text('TikVTV Live'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
