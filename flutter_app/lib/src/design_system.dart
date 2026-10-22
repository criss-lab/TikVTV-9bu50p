import 'package:flutter/material.dart';

/// Shared design system for web, Android phone and Android TV.
/// One theme keeps Premium, account, discovery and pairing visually consistent.
class TikVtvDesign {
  static ThemeData theme({bool television = false}) => ThemeData.dark(useMaterial3: true).copyWith(
      scaffoldBackgroundColor: const Color(0xFF0B0D15),
      focusColor: const Color(0x4432CED0),
      splashColor: const Color(0x33FF315F),
      dividerColor: const Color(0xFF303344),
      visualDensity: television ? VisualDensity.comfortable : VisualDensity.standard,
      textSelectionTheme: const TextSelectionThemeData(cursorColor: Color(0xFF32CED0), selectionColor: Color(0x6632CED0), selectionHandleColor: Color(0xFF32CED0)),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: Color(0xFF32CED0), linearTrackColor: Color(0xFF303344)),
      navigationBarTheme: const NavigationBarThemeData(backgroundColor: Color(0xFF10121B), indicatorColor: Color(0xFF542035), height: 72, labelBehavior: NavigationDestinationLabelBehavior.alwaysShow),
      snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: const Color(0xFF242839), contentTextStyle: const TextStyle(color: Colors.white), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      colorScheme: const ColorScheme.dark(primary: Color(0xFFFF315F), secondary: Color(0xFF32CED0), surface: Color(0xFF171A26), onSurface: Color(0xFFF5F5FA)),
      appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF10121B), foregroundColor: Colors.white, centerTitle: false, elevation: 0),
      cardTheme: CardThemeData(color: const Color(0xFF171A26), elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Color(0xFF303344)))),
      inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: const Color(0xFF191C29), contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17), border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF343748))), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFF343748))), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFFF315F), width: 2))),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF315F), foregroundColor: Colors.white, minimumSize: television ? const Size(64, 56) : const Size(52, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFF5F5FA), side: const BorderSide(color: Color(0xFF414558)), minimumSize: television ? const Size(64, 56) : const Size(52, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)))),
      chipTheme: ChipThemeData(backgroundColor: const Color(0xFF191C29), selectedColor: const Color(0xFF542035), side: const BorderSide(color: Color(0xFF353849)), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)))
    );
}
