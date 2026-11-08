import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

/// Starts the bundled Node engine if it is not already listening.
/// Everything stays on 127.0.0.1 — no external service is involved.
class EngineLauncher {
  Process? _process;
  final List<String> _log = [];

  List<String> get log => List.unmodifiable(_log);
  bool get running => _process != null;

  Future<String?> ensureRunning() async {
    if (await _probe()) return null;

    final engineDir = _engineDir();
    if (engineDir == null) {
      return 'Engine folder not found. Expected it next to the app or at ../engine.';
    }

    final script = '$engineDir${Platform.pathSeparator}server.mjs';
    if (!File(script).existsSync()) {
      return 'server.mjs not found in $engineDir';
    }

    try {
      _process = await Process.start(
        _nodeExecutable(),
        [script],
        workingDirectory: engineDir,
        runInShell: false,
      );
    } on ProcessException catch (error) {
      return 'Could not start Node.js (${error.message}). Is Node installed?';
    }

    _process!.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(_log.add);
    _process!.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => _log.add('ERR $line'));

    for (var attempt = 0; attempt < 60; attempt++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (await _probe()) return null;
      if (_process == null) break;
    }
    return 'Engine did not become ready. ${_log.isEmpty ? '' : _log.last}';
  }

  Future<bool> _probe() async {
    final client = HttpClient()..connectionTimeout = const Duration(milliseconds: 400);
    try {
      final request = await client
          .getUrl(Uri.parse('http://127.0.0.1:8787/health'))
          .timeout(const Duration(milliseconds: 700));
      final response = await request.close().timeout(const Duration(milliseconds: 900));
      await response.drain<void>();
      return response.statusCode == 200;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }

  String? _engineDir() {
    final candidates = <String>[
      if (Platform.environment['PHONEDECK_ENGINE'] != null)
        Platform.environment['PHONEDECK_ENGINE']!,
      p.join(Directory.current.path, 'engine'),
      p.join(Directory.current.path, '..', 'engine'),
      p.join(File(Platform.resolvedExecutable).parent.path, 'engine'),
      p.join(File(Platform.resolvedExecutable).parent.path, 'data', 'engine'),
    ];
    for (final candidate in candidates) {
      final script = p.join(candidate, 'server.mjs');
      if (File(script).existsSync()) return candidate;
    }
    return null;
  }

  String _nodeExecutable() {
    final configured = Platform.environment['PHONEDECK_NODE'];
    if (configured != null && configured.isNotEmpty) return configured;
    final candidates = <String>[
      r'C:\Program Files\nodejs\node.exe',
      r'C:\Program Files (x86)\nodejs\node.exe',
    ];
    for (final candidate in candidates) {
      if (File(candidate).existsSync()) return candidate;
    }
    return 'node';
  }

  Future<void> dispose() async {
    final process = _process;
    _process = null;
    if (process != null) {
      process.kill();
      await process.exitCode.timeout(
        const Duration(seconds: 3),
        onTimeout: () => -1,
      );
    }
  }
}
