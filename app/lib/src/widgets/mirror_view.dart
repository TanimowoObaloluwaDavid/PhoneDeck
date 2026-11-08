import 'dart:io';

import 'package:flutter/material.dart';
import 'package:webview_windows/webview_windows.dart';

import '../api.dart';
import '../theme.dart';

class MirrorView extends StatefulWidget {
  const MirrorView({
    super.key,
    required this.api,
    required this.serial,
    required this.busy,
    required this.onStop,
    required this.onRestart,
    required this.onToast,
  });

  final DeckApi api;
  final String serial;
  final bool busy;
  final Future<void> Function() onStop;
  final Future<void> Function() onRestart;
  final void Function(String message) onToast;

  @override
  State<MirrorView> createState() => _MirrorViewState();
}

class _MirrorViewState extends State<MirrorView> {
  final WebviewController _controller = WebviewController();
  bool _ready = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      await _controller.initialize();
      await _controller.setBackgroundColor(Deck.bg);
      await _controller.setCacheDisabled(true);
      await _controller.loadUrl(DeckApi.mirrorUrl);
      if (!mounted) return;
      setState(() => _ready = true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = 'WebView2 is not available.\n$error');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _header(),
        const SizedBox(height: 10),
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF08090B),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Deck.line),
            ),
            clipBehavior: Clip.antiAlias,
            child: _pane(),
          ),
        ),
        const SizedBox(height: 12),
        _ControlBar(
          onAction: (name) => widget.api.action(widget.serial, name),
          onScreenshot: _screenshot,
          onStop: widget.onStop,
          onRestart: widget.onRestart,
          onQuality: _applyQuality,
          onToast: widget.onToast,
        ),
      ],
    );
  }

  Widget _header() {
    return Row(
      children: [
        const Text('Mirror', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(width: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: Deck.accentDim,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Row(
            children: [
              Container(
                width: 5,
                height: 5,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: Deck.accent),
              ),
              const SizedBox(width: 6),
              Text(
                'LIVE',
                style: Deck.label.copyWith(fontSize: 9, color: Deck.accent, letterSpacing: 1.2),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Text(widget.serial, style: Deck.mono.copyWith(fontSize: 11, color: Deck.muted)),
        const Spacer(),
        if (widget.busy)
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 1.6, color: Deck.accent),
          ),
      ],
    );
  }

  Widget _pane() {
    if (_error != null) {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.warning_amber_rounded, color: Deck.warn, size: 26),
                const SizedBox(height: 12),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, color: Deck.muted, height: 1.6),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Install the Microsoft Edge WebView2 Runtime, then reopen PhoneDeck.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Deck.muted),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (!_ready) {
      return const Center(
        child: SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 1.8, color: Deck.accent),
        ),
      );
    }

    return Webview(_controller, filterQuality: FilterQuality.low);
  }

  Future<void> _screenshot() async {
    try {
      final bytes = await widget.api.screenshot(widget.serial);
      final home = Platform.environment['USERPROFILE'] ?? Directory.current.path;
      final dir = Directory('$home\\Pictures\\PhoneDeck');
      await dir.create(recursive: true);
      final stamp = DateTime.now()
          .toIso8601String()
          .split('.')
          .first
          .replaceAll(':', '-');
      final file = File('${dir.path}\\shot-$stamp.png');
      await file.writeAsBytes(bytes);
      widget.onToast('Screenshot saved to ${file.path}');
    } catch (error) {
      widget.onToast('Screenshot failed: $error');
    }
  }

  Future<void> _applyQuality(_Quality quality) async {
    try {
      await widget.api.startMirror(
        serial: widget.serial,
        maxSize: quality.maxSize,
        bitRateMbps: quality.bitRate,
        maxFps: quality.fps,
      );
      widget.onToast('Quality set to ${quality.label}');
    } catch (error) {
      widget.onToast('$error');
    }
  }
}

class _Quality {
  const _Quality(this.label, this.maxSize, this.bitRate, this.fps);
  final String label;
  final int maxSize;
  final int bitRate;
  final int fps;

  String get detail => '$maxSize px · $bitRate Mbps · $fps fps';
}

const _qualities = <_Quality>[
  _Quality('Light', 960, 4, 30),
  _Quality('Balanced', 1280, 8, 60),
  _Quality('Sharp', 1920, 16, 60),
];

class _ControlBar extends StatelessWidget {
  const _ControlBar({
    required this.onAction,
    required this.onScreenshot,
    required this.onStop,
    required this.onRestart,
    required this.onQuality,
    required this.onToast,
  });

  final Future<void> Function(String name) onAction;
  final Future<void> Function() onScreenshot;
  final Future<void> Function() onStop;
  final Future<void> Function() onRestart;
  final Future<void> Function(_Quality quality) onQuality;
  final void Function(String message) onToast;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Deck.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Deck.line),
      ),
      child: Row(
        children: [
          _btn(Icons.arrow_back, 'Back', () => _fire(onAction('back'))),
          _btn(Icons.home_outlined, 'Home', () => _fire(onAction('home'))),
          _btn(Icons.crop_16_9_outlined, 'Recents', () => _fire(onAction('recents'))),
          const _Divider(),
          _btn(Icons.notifications_none, 'Notification shade',
              () => _fire(onAction('notifications'))),
          _btn(Icons.screen_rotation_outlined, 'Rotate', () => _fire(onAction('rotate'))),
          const _Divider(),
          _btn(Icons.volume_down_outlined, 'Volume down',
              () => _fire(onAction('volume-down'))),
          _btn(Icons.volume_up_outlined, 'Volume up', () => _fire(onAction('volume-up'))),
          _btn(Icons.power_settings_new, 'Power', () => _fire(onAction('power'))),
          const _Divider(),
          _btn(Icons.photo_camera_outlined, 'Screenshot', () => _fire(onScreenshot())),
          _btn(Icons.refresh, 'Restart stream', () => _fire(onRestart())),
          const Spacer(),
          PopupMenuButton<_Quality>(
            tooltip: 'Quality',
            color: Deck.surfaceHigh,
            onSelected: (quality) => _fire(onQuality(quality)),
            itemBuilder: (context) => [
              for (final quality in _qualities)
                PopupMenuItem(
                  value: quality,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(quality.label, style: const TextStyle(fontSize: 12.5)),
                      Text(
                        quality.detail,
                        style: const TextStyle(fontSize: 10.5, color: Deck.muted),
                      ),
                    ],
                  ),
                ),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(7),
                border: Border.all(color: Deck.line),
              ),
              child: const Row(
                children: [
                  Text('Quality', style: TextStyle(fontSize: 11.5, color: Deck.muted)),
                  SizedBox(width: 4),
                  Icon(Icons.expand_more, size: 14, color: Deck.muted),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          TextButton.icon(
            onPressed: () => _fire(onStop()),
            icon: const Icon(Icons.stop_circle_outlined, size: 15, color: Deck.danger),
            label: const Text('Stop', style: TextStyle(fontSize: 12, color: Deck.danger)),
          ),
        ],
      ),
    );
  }

  void _fire(Future<void> future) {
    future.catchError((Object error) {
      onToast('$error');
    });
  }

  Widget _btn(IconData icon, String tip, VoidCallback onTap) {
    return Tooltip(
      message: tip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(7),
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(icon, size: 17, color: Deck.muted),
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 18,
      margin: const EdgeInsets.symmetric(horizontal: 6),
      color: Deck.line,
    );
  }
}
