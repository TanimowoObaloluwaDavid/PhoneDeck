import 'package:flutter_test/flutter_test.dart';
import 'package:phonedeck/src/theme.dart';

void main() {
  test('theme exposes the deck palette', () {
    final theme = Deck.theme();
    expect(theme.useMaterial3, isTrue);
    expect(theme.colorScheme.primary, Deck.accent);
  });
}
