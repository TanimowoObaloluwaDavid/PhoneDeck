import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';
import 'engine_launcher.dart';
import 'theme.dart';
import 'widgets/connect_view.dart';
import 'widgets/mirror_view.dart';
import 'widgets/panels.dart';
import 'widgets/rail.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final DeckApi _api = DeckApi();
  final EngineLauncher _launcher = EngineLauncher();

  Timer? _deviceTimer;
  List<DeviceInfo> _devices = const [];
  String? _selected;
  DeckSection _section = DeckSection.mirror;

  bool _engineReady = false;
  String _engineMessage = 'Starting engine…';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _deviceTimer?.cancel();
    _launcher.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    final error = await _launcher.ensureRunning();
    if (!mounted) return;

    if (error != null) {
      setState(() {
        _engineReady = false;
        _engineMessage = error;
      });
      return;
    }

    setState(() {
      _engineReady = true;
      _engineMessage = 'Ready';
    });

    await _refreshDevices();
    _deviceTimer = Timer.periodic(const Duration(seconds: 3), (_) => _refreshDevices());
  }

  Future<void> _refreshDevices() async {
    if (!_engineReady) return;
    try {
      final devices = await _api.devices();
      if (!mounted) return;
      var selected = _selected;
      if (selected == null || !devices.any((d) => d.serial == selected)) {
        final ready = devices.where((d) => d.ready).map((d) => d.serial).toList();
        selected = ready.isEmpty ? null : ready.first;
      }
      setState(() {
        _devices = devices;
        _selected = selected;
      });
      if (selected != null) {
        await _startMirror(selected, silent: true);
      }
    } catch (_) {
      /* engine may be mid-restart; next tick retries */
    }
  }

  Future<void> _startMirror(String serial, {bool silent = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _api.startMirror(serial: serial);
    } catch (error) {
      if (!silent) _toast('Mirror failed: $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stopMirror() async {
    try {
      await _api.stopMirror();
      _toast('Mirror stopped');
    } catch (error) {
      _toast('$error');
    }
  }

  Future<void> _disconnect() async {
    final serial = _selected;
    if (serial == null) return;
    try {
      await _api.stopMirror();
      await _api.disconnect(serial);
      setState(() => _selected = null);
      await _refreshDevices();
    } catch (error) {
      _toast('$error');
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: const TextStyle(fontSize: 12.5)),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Deck.surfaceHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: const BorderSide(color: Deck.line),
          ),
        ),
      );
  }

  DeviceInfo? get _current {
    for (final device in _devices) {
      if (device.serial == _selected) return device;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final current = _current;
    final showPanel = _section != DeckSection.mirror;

    return Scaffold(
      body: Row(
        children: [
          DeckRail(
            section: _section,
            deviceReady: _selected != null,
            engineReady: _engineReady,
            onSelect: (section) => setState(() => _section = section),
          ),
          Expanded(
            child: Column(
              children: [
                _TopBar(
                  device: current,
                  engineReady: _engineReady,
                  message: _engineMessage,
                  onDisconnect: _selected == null ? null : _disconnect,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: _selected == null
                              ? ConnectView(
                                  api: _api,
                                  devices: _devices,
                                  enabled: _engineReady,
                                  onConnect: (address) async {
                                    await _api.connect(address);
                                    await _refreshDevices();
                                  },
                                  onPair: (address, code) async {
                                    await _api.pair(address, code);
                                    await _refreshDevices();
                                  },
                                  onRefresh: _refreshDevices,
                                  onError: _toast,
                                )
                              : MirrorView(
                                  api: _api,
                                  serial: _selected!,
                                  busy: _busy,
                                  onStop: _stopMirror,
                                  onRestart: () => _startMirror(_selected!),
                                  onToast: _toast,
                                ),
                        ),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          curve: Curves.easeOutCubic,
                          width: showPanel ? 392 : 0,
                          child: showPanel
                              ? Padding(
                                  padding: const EdgeInsets.only(left: 16),
                                  child: _buildPanel(current),
                                )
                              : null,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPanel(DeviceInfo? current) {
    final serial = _selected;
    if (serial == null) {
      return const _EmptyPanel(
        title: 'No device',
        body: 'Connect a phone first — the panel fills in once it is paired.',
      );
    }
    switch (_section) {
      case DeckSection.notifications:
        return NotificationsPanel(api: _api, serial: serial);
      case DeckSection.apps:
        return AppsPanel(api: _api, serial: serial, onToast: _toast);
      case DeckSection.files:
        return FilesPanel(api: _api, serial: serial);
      case DeckSection.device:
        return DevicePanel(
          api: _api,
          serial: serial,
          device: current,
          onDisconnect: _disconnect,
          onRestart: () => _startMirror(serial),
          onStop: _stopMirror,
        );
      case DeckSection.mirror:
        return const SizedBox.shrink();
    }
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.device,
    required this.engineReady,
    required this.message,
    required this.onDisconnect,
  });

  final DeviceInfo? device;
  final bool engineReady;
  final String message;
  final VoidCallback? onDisconnect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Row(
          children: [
            const Text(
              'PhoneDeck',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: Deck.surface,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Deck.line),
              ),
              child: Text(
                'LOCAL',
                style: Deck.label.copyWith(fontSize: 9, letterSpacing: 1.2),
              ),
            ),
            const SizedBox(width: 18),
            _StatusDot(active: engineReady, label: engineReady ? 'engine live' : message),
            const Spacer(),
            if (device != null) ...[
              Icon(
                device!.ready ? Icons.smartphone : Icons.smartphone_outlined,
                size: 15,
                color: device!.ready ? Deck.accent : Deck.muted,
              ),
              const SizedBox(width: 7),
              Text(
                device!.title,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
              ),
              const SizedBox(width: 10),
              Text(device!.serial, style: Deck.mono.copyWith(color: Deck.muted, fontSize: 11)),
              const SizedBox(width: 14),
              TextButton(
                onPressed: onDisconnect,
                child: const Text('Disconnect', style: TextStyle(fontSize: 12)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.active, required this.label});

  final bool active;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? Deck.accent : Deck.warn,
          ),
        ),
        const SizedBox(width: 7),
        Text(
          label,
          style: const TextStyle(fontSize: 11.5, color: Deck.muted),
        ),
      ],
    );
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return DeckCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(body, style: const TextStyle(fontSize: 12.5, color: Deck.muted, height: 1.5)),
        ],
      ),
    );
  }
}
