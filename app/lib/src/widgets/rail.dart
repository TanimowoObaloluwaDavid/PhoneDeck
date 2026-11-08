import 'package:flutter/material.dart';

import '../theme.dart';

enum DeckSection { mirror, notifications, apps, files, device }

class DeckRail extends StatelessWidget {
  const DeckRail({
    super.key,
    required this.section,
    required this.deviceReady,
    required this.engineReady,
    required this.onSelect,
  });

  final DeckSection section;
  final bool deviceReady;
  final bool engineReady;
  final ValueChanged<DeckSection> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 66,
      decoration: const BoxDecoration(
        color: Deck.surface,
        border: Border(right: BorderSide(color: Deck.line)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 18),
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: Deck.accent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.phone_android, size: 18, color: Deck.bg),
          ),
          const SizedBox(height: 22),
          _RailItem(
            icon: Icons.smartphone,
            label: 'Mirror',
            selected: section == DeckSection.mirror,
            onTap: () => onSelect(DeckSection.mirror),
          ),
          _RailItem(
            icon: Icons.notifications_none,
            label: 'Notifications',
            selected: section == DeckSection.notifications,
            enabled: deviceReady,
            onTap: () => onSelect(DeckSection.notifications),
          ),
          _RailItem(
            icon: Icons.grid_view_rounded,
            label: 'Apps',
            selected: section == DeckSection.apps,
            enabled: deviceReady,
            onTap: () => onSelect(DeckSection.apps),
          ),
          _RailItem(
            icon: Icons.folder_open,
            label: 'Files',
            selected: section == DeckSection.files,
            enabled: deviceReady,
            onTap: () => onSelect(DeckSection.files),
          ),
          _RailItem(
            icon: Icons.tune,
            label: 'Device',
            selected: section == DeckSection.device,
            enabled: deviceReady,
            onTap: () => onSelect(DeckSection.device),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.only(bottom: 18),
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: engineReady ? Deck.accent : Deck.warn,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = !enabled
        ? Deck.muted.withValues(alpha: 0.35)
        : selected
            ? Deck.accent
            : Deck.muted;

    return Tooltip(
      message: label,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
          height: 42,
          decoration: BoxDecoration(
            color: selected ? Deck.accentDim : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Stack(
            children: [
              Center(child: Icon(icon, size: 19, color: color)),
              if (selected)
                Positioned(
                  left: 0,
                  top: 11,
                  bottom: 11,
                  child: Container(
                    width: 2.5,
                    decoration: BoxDecoration(
                      color: Deck.accent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
