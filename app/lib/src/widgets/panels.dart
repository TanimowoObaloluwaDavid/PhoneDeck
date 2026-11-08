import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';

/* ------------------------------------------------------------------ */
/* shared shell                                                       */
/* ------------------------------------------------------------------ */

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child, this.actions = const []});

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Deck.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Deck.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 10, 10),
            child: Row(
              children: [
                Text(
                  title.toUpperCase(),
                  style: Deck.label.copyWith(color: Deck.text),
                ),
                const Spacer(),
                ...actions,
              ],
            ),
          ),
          const Divider(height: 1, color: Deck.line),
          Expanded(child: child),
        ],
      ),
    );
  }
}

Widget _empty(String message) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 12.5, color: Deck.muted, height: 1.6),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* notifications                                                      */
/* ------------------------------------------------------------------ */

class NotificationsPanel extends StatefulWidget {
  const NotificationsPanel({super.key, required this.api, required this.serial});

  final DeckApi api;
  final String serial;

  @override
  State<NotificationsPanel> createState() => _NotificationsPanelState();
}

class _NotificationsPanelState extends State<NotificationsPanel> {
  List<PhoneNotification> _items = const [];
  Timer? _timer;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await widget.api.notifications(widget.serial);
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: 'Notifications',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh, size: 16, color: Deck.muted),
        ),
      ],
      child: _loading
          ? const Center(
              child: SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 1.6, color: Deck.accent),
              ),
            )
          : _error != null
              ? _empty(_error!)
              : _items.isEmpty
                  ? _empty('No active notifications right now.')
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      itemCount: _items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, color: Deck.line),
                      itemBuilder: (context, index) {
                        final item = _items[index];
                        return Padding(
                          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.title.isEmpty ? item.package : item.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    item.package.split('.').last,
                                    style: Deck.mono.copyWith(
                                      fontSize: 10,
                                      color: Deck.muted,
                                    ),
                                  ),
                                ],
                              ),
                              if (item.text.isNotEmpty) ...[
                                const SizedBox(height: 3),
                                Text(
                                  item.text,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: Deck.muted,
                                    height: 1.45,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* apps                                                               */
/* ------------------------------------------------------------------ */

class AppsPanel extends StatefulWidget {
  const AppsPanel({
    super.key,
    required this.api,
    required this.serial,
    required this.onToast,
  });

  final DeckApi api;
  final String serial;
  final void Function(String message) onToast;

  @override
  State<AppsPanel> createState() => _AppsPanelState();
}

class _AppsPanelState extends State<AppsPanel> {
  final TextEditingController _search = TextEditingController();
  List<AppEntry> _apps = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _search.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final apps = await widget.api.apps(widget.serial);
      if (!mounted) return;
      setState(() {
        _apps = apps;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible = query.isEmpty
        ? _apps
        : _apps
            .where((a) => a.label.toLowerCase().contains(query) || a.package.contains(query))
            .toList();

    return _Panel(
      title: 'Apps',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh, size: 16, color: Deck.muted),
        ),
      ],
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: TextField(
              controller: _search,
              decoration: const InputDecoration(hintText: 'Search installed apps'),
              style: const TextStyle(fontSize: 12.5),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 1.6, color: Deck.accent),
                    ),
                  )
                : _error != null
                    ? _empty(_error!)
                    : visible.isEmpty
                        ? _empty('No matching apps.')
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 8),
                            itemCount: visible.length,
                            itemBuilder: (context, index) {
                              final app = visible[index];
                              return InkWell(
                                onTap: () async {
                                  try {
                                    await widget.api.launchApp(widget.serial, app.package);
                                    widget.onToast('Opening ${app.label}…');
                                  } catch (error) {
                                    widget.onToast('$error');
                                  }
                                },
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 26,
                                        height: 26,
                                        decoration: BoxDecoration(
                                          color: Deck.surfaceHigh,
                                          borderRadius: BorderRadius.circular(6),
                                          border: Border.all(color: Deck.line),
                                        ),
                                        child: Center(
                                          child: Text(
                                            app.label.isEmpty
                                                ? '?'
                                                : app.label.substring(0, 1).toUpperCase(),
                                            style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              app.label,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontSize: 12.5),
                                            ),
                                            Text(
                                              app.package,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: Deck.mono.copyWith(
                                                fontSize: 10,
                                                color: Deck.muted,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Icon(
                                        Icons.play_arrow_rounded,
                                        size: 15,
                                        color: Deck.muted,
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* files                                                              */
/* ------------------------------------------------------------------ */

class FilesPanel extends StatefulWidget {
  const FilesPanel({super.key, required this.api, required this.serial});

  final DeckApi api;
  final String serial;

  @override
  State<FilesPanel> createState() => _FilesPanelState();
}

class _FilesPanelState extends State<FilesPanel> {
  String _path = '/sdcard';
  List<FileEntry> _entries = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load(_path);
  }

  Future<void> _load(String path) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final entries = await widget.api.files(widget.serial, path);
      if (!mounted) return;
      setState(() {
        _path = path;
        _entries = entries;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  void _up() {
    if (_path == '/' || _path.isEmpty) return;
    final index = _path.lastIndexOf('/');
    final parent = index <= 0 ? '/' : _path.substring(0, index);
    _load(parent);
  }

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: 'Files',
      actions: [
        IconButton(
          tooltip: 'Up one level',
          onPressed: _up,
          icon: const Icon(Icons.arrow_upward, size: 16, color: Deck.muted),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: () => _load(_path),
          icon: const Icon(Icons.refresh, size: 16, color: Deck.muted),
        ),
      ],
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Deck.line)),
            ),
            child: Text(
              _path,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Deck.mono.copyWith(fontSize: 11, color: Deck.muted),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 1.6, color: Deck.accent),
                    ),
                  )
                : _error != null
                    ? _empty(_error!)
                    : ListView.builder(
                        itemCount: _entries.length,
                        itemBuilder: (context, index) {
                          final entry = _entries[index];
                          return InkWell(
                            onTap: entry.isDir
                                ? () => _load(
                                      _path.endsWith('/') ? '$_path${entry.name}' : '$_path/${entry.name}',
                                    )
                                : null,
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              child: Row(
                                children: [
                                  Icon(
                                    entry.isDir
                                        ? Icons.folder_outlined
                                        : Icons.insert_drive_file_outlined,
                                    size: 15,
                                    color: entry.isDir ? Deck.accent : Deck.muted,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      entry.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12.5),
                                    ),
                                  ),
                                  if (entry.isDir)
                                    const Icon(
                                      Icons.chevron_right,
                                      size: 15,
                                      color: Deck.muted,
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* device                                                             */
/* ------------------------------------------------------------------ */

class DevicePanel extends StatefulWidget {
  const DevicePanel({
    super.key,
    required this.api,
    required this.serial,
    required this.device,
    required this.onDisconnect,
    required this.onRestart,
    required this.onStop,
  });

  final DeckApi api;
  final String serial;
  final DeviceInfo? device;
  final Future<void> Function() onDisconnect;
  final Future<void> Function() onRestart;
  final Future<void> Function() onStop;

  @override
  State<DevicePanel> createState() => _DevicePanelState();
}

class _DevicePanelState extends State<DevicePanel> {
  DeviceStats? _stats;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final stats = await widget.api.info(widget.serial);
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final stats = _stats;
    return _Panel(
      title: 'Device',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh, size: 16, color: Deck.muted),
        ),
      ],
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (stats == null)
              Text(
                _error ?? 'Reading device…',
                style: const TextStyle(fontSize: 12.5, color: Deck.muted),
              )
            else ...[
              Text(
                stats.model.isEmpty ? widget.serial : stats.model,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 2),
              Text(widget.serial, style: Deck.mono.copyWith(fontSize: 11, color: Deck.muted)),
              const SizedBox(height: 16),
              _row('Android', stats.android.isEmpty ? '—' : stats.android),
              _row(
                'Resolution',
                stats.width > 0 ? '${stats.width} × ${stats.height}' : '—',
              ),
              _row('Battery', stats.battery == null ? '—' : '${stats.battery}%'),
            ],
            const SizedBox(height: 20),
            const SectionLabel('Stream quality'),
            for (final preset in const [
              ('Light', 960, 4, 30),
              ('Balanced', 1280, 8, 60),
              ('Sharp', 1920, 16, 60),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OutlinedButton(
                  onPressed: () async {
                    try {
                      await widget.api.startMirror(
                        serial: widget.serial,
                        maxSize: preset.$2,
                        bitRateMbps: preset.$3,
                        maxFps: preset.$4,
                      );
                    } catch (error) {
                      setState(() => _error = '$error');
                    }
                  },
                  child: Row(
                    children: [
                      Text(preset.$1),
                      const Spacer(),
                      Text(
                        '${preset.$2}px · ${preset.$3} Mbps',
                        style: const TextStyle(fontSize: 11, color: Deck.muted),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => widget.onRestart(),
                    child: const Text('Restart stream'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => widget.onStop(),
                    child: const Text('Stop'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => widget.onDisconnect(),
                child: const Text(
                  'Disconnect device',
                  style: TextStyle(color: Deck.danger, fontSize: 12.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: const TextStyle(fontSize: 11.5, color: Deck.muted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Deck.mono.copyWith(fontSize: 12),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
