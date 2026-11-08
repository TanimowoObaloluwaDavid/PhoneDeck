import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

/// First-run flow: enable wireless debugging, pair, connect.
class ConnectView extends StatefulWidget {
  const ConnectView({
    super.key,
    required this.api,
    required this.devices,
    required this.enabled,
    required this.onConnect,
    required this.onPair,
    required this.onRefresh,
    required this.onError,
  });

  final DeckApi api;
  final List<DeviceInfo> devices;
  final bool enabled;
  final Future<void> Function(String address) onConnect;
  final Future<void> Function(String address, String code) onPair;
  final Future<void> Function() onRefresh;
  final void Function(String message) onError;

  @override
  State<ConnectView> createState() => _ConnectViewState();
}

class _ConnectViewState extends State<ConnectView> {
  final TextEditingController _address = TextEditingController();
  final TextEditingController _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _address.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (error) {
      widget.onError('$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            const Text(
              'Connect your phone',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.6),
            ),
            const SizedBox(height: 8),
            const Text(
              'One-time setup on the phone. After this, it reconnects on its own.',
              style: TextStyle(fontSize: 13, color: Deck.muted),
            ),
            const SizedBox(height: 24),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _steps()),
                const SizedBox(width: 16),
                SizedBox(width: 320, child: _pairCard()),
              ],
            ),
            const SizedBox(height: 16),
            _deviceList(),
          ],
        ),
      ),
    );
  }

  Widget _steps() {
    const steps = [
      ('Enable developer options', 'Settings → About phone → tap "Build number" 7 times.'),
      ('Turn on Wireless debugging', 'Settings → System → Developer options → Wireless debugging.'),
      ('Pair with this PC', 'On the phone tap "Pair device with pairing code". It shows an IP:port and a 6-digit code.'),
      ('Enter both fields', 'Type the pairing IP:port and the code on the right. Then Connect.'),
    ];

    return DeckCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Setup'),
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 20,
                    height: 20,
                    margin: const EdgeInsets.only(top: 1),
                    decoration: BoxDecoration(
                      color: Deck.accentDim,
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Center(
                      child: Text(
                        '${i + 1}',
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: Deck.accent,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          steps[i].$1,
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          steps[i].$2,
                          style: const TextStyle(fontSize: 12, color: Deck.muted, height: 1.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const Divider(height: 1, color: Deck.line),
          const SizedBox(height: 12),
          const Text(
            'USB alternative: plug the phone in, run "adb tcpip 5555", unplug, then connect to the phone IP.',
            style: TextStyle(fontSize: 11.5, color: Deck.muted, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _pairCard() {
    return DeckCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('Pairing'),
          TextField(
            controller: _address,
            enabled: widget.enabled,
            decoration: const InputDecoration(
              hintText: '192.168.1.42:37123',
              labelText: 'Pairing address',
              labelStyle: TextStyle(fontSize: 12, color: Deck.muted),
            ),
            style: Deck.mono,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _code,
            enabled: widget.enabled,
            decoration: const InputDecoration(
              hintText: '123456',
              labelText: 'Pairing code',
              labelStyle: TextStyle(fontSize: 12, color: Deck.muted),
            ),
            style: Deck.mono,
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: !widget.enabled || _busy
                  ? null
                  : () => _run(() => widget.onPair(_address.text.trim(), _code.text.trim())),
              child: Text(_busy ? 'Pairing…' : 'Pair device'),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Pairing uses the port shown on the phone. The connect port is usually different (5555 or the one above the code).',
            style: TextStyle(fontSize: 11, color: Deck.muted, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _deviceList() {
    return DeckCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const SectionLabel('Detected devices'),
              const Spacer(),
              TextButton.icon(
                onPressed: _busy ? null : () => _run(widget.onRefresh),
                icon: const Icon(Icons.refresh, size: 14),
                label: const Text('Rescan', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
          if (widget.devices.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Nothing yet. Pair the phone above, or connect it with a USB cable.',
                style: TextStyle(fontSize: 12.5, color: Deck.muted),
              ),
            )
          else
            for (final device in widget.devices)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Deck.surfaceHigh,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Deck.line),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        device.ready ? Icons.smartphone : Icons.error_outline,
                        size: 15,
                        color: device.ready ? Deck.accent : Deck.warn,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(device.title, style: const TextStyle(fontSize: 12.5)),
                            Text(
                              '${device.serial} · ${device.state}',
                              style: Deck.mono.copyWith(fontSize: 11, color: Deck.muted),
                            ),
                          ],
                        ),
                      ),
                      if (device.ready)
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => _run(() => widget.onConnect(device.serial)),
                          child: const Text('Use', style: TextStyle(fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
