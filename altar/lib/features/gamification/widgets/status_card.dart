import 'package:flutter/material.dart';

import '../points_rules.dart';

/// Troféu do status. Usado no perfil e no card compartilhável.
class StatusCard extends StatelessWidget {
  const StatusCard({
    super.key,
    required this.name,
    required this.status,
    required this.points,
    this.forExport = false,
  });

  final String name;
  final UserStatus status;
  final int points;
  final bool forExport;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = forExport ? const Color(0xFF1F2F4F) : scheme.surfaceContainerHigh;
    final fg = forExport ? Colors.white : scheme.onSurface;

    return Container(
      width: forExport ? 1080 / 3 : null,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(forExport ? 0 : 20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: status.color.withValues(alpha: 0.18),
              border: Border.all(color: status.color, width: 3),
            ),
            child: Icon(status.icon, size: 48, color: status.color),
          ),
          const SizedBox(height: 16),
          Text(
            status.label,
            style: TextStyle(
              color: status.color,
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            forExport ? 'Meu status no Altar' : '$points pontos',
            style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 14),
          ),
          if (forExport) ...[
            const SizedBox(height: 16),
            Text(
              name,
              style: TextStyle(color: fg, fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 20),
            Text(
              'Altar',
              style: TextStyle(
                color: fg,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 2,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
