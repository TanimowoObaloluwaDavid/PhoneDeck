import 'package:flutter/material.dart';

import 'src/home_page.dart';
import 'src/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PhoneDeckApp());
}

class PhoneDeckApp extends StatelessWidget {
  const PhoneDeckApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PhoneDeck',
      debugShowCheckedModeBanner: false,
      theme: Deck.theme(),
      home: const HomePage(),
    );
  }
}
