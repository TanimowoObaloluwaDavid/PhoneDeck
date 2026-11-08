import 'package:flutter/material.dart';

abstract final class Deck {
  static const Color bg = Color(0xFF0A0C0F);
  static const Color surface = Color(0xFF12151A);
  static const Color surfaceHigh = Color(0xFF171B21);
  static const Color line = Color(0xFF242A32);
  static const Color text = Color(0xFFE6E9EC);
  static const Color muted = Color(0xFF818A96);
  static const Color accent = Color(0xFFA3E635);
  static const Color accentDim = Color(0xFF2C3A16);
  static const Color warn = Color(0xFFF5A524);
  static const Color danger = Color(0xFFEF4444);

  static ThemeData theme() {
    const scheme = ColorScheme.dark(
      primary: accent,
      onPrimary: Color(0xFF0A0C0F),
      secondary: accent,
      surface: surface,
      onSurface: text,
      error: danger,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      fontFamily: 'Segoe UI',
      visualDensity: VisualDensity.compact,
    );

    return base.copyWith(
      dividerColor: line,
      textTheme: base.textTheme.apply(
        bodyColor: text,
        displayColor: text,
      ),
      splashFactory: InkSparkle.splashFactory,
      tooltipTheme: const TooltipThemeData(
        waitDuration: Duration(milliseconds: 400),
        decoration: BoxDecoration(
          color: surfaceHigh,
          borderRadius: BorderRadius.all(Radius.circular(6)),
          border: Border.fromBorderSide(BorderSide(color: line)),
        ),
        textStyle: TextStyle(color: text, fontSize: 12),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: Color(0xFF0E1116),
        isDense: true,
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          borderSide: BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          borderSide: BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          borderSide: BorderSide(color: accent),
        ),
        hintStyle: TextStyle(color: muted, fontSize: 12.5),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: const Color(0xFF0A0C0F),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: text,
          side: const BorderSide(color: line),
          textStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        ),
      ),
    );
  }

  static const TextStyle label = TextStyle(
    fontSize: 11,
    letterSpacing: 0.9,
    fontWeight: FontWeight.w600,
    color: muted,
  );

  static const TextStyle mono = TextStyle(
    fontFamily: 'Consolas',
    fontSize: 12,
    fontFeatures: [FontFeature.tabularFigures()],
    color: text,
  );
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(text.toUpperCase(), style: Deck.label),
    );
  }
}

class DeckCard extends StatelessWidget {
  const DeckCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Deck.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Deck.line),
      ),
      child: child,
    );
  }
}
