import 'package:flutter/material.dart';

// warna sama dengan tema web (frontend/tailwind.config.js)
class Brand {
  static const c50 = Color(0xFFFFF1F2);
  static const c100 = Color(0xFFFFE4E6);
  static const c200 = Color(0xFFFECDD3);
  static const c500 = Color(0xFFF43F5E);
  static const c600 = Color(0xFFE11D48);
  static const c700 = Color(0xFFBE123C);
}

class Slate {
  static const c50 = Color(0xFFF8FAFC);
  static const c100 = Color(0xFFF1F5F9);
  static const c200 = Color(0xFFE2E8F0);
  static const c400 = Color(0xFF94A3B8);
  static const c500 = Color(0xFF64748B);
  static const c600 = Color(0xFF475569);
  static const c800 = Color(0xFF1E293B);
  static const c900 = Color(0xFF0F172A);
}

ThemeData buildTheme() {
  final radius = BorderRadius.circular(14);
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: Brand.c600, primary: Brand.c600, surface: Colors.white),
    scaffoldBackgroundColor: Slate.c50,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Slate.c200)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Slate.c200)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: radius),
        side: const BorderSide(color: Slate.c200),
        foregroundColor: Slate.c800,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Slate.c200)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
