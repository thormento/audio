import 'package:flutter/material.dart';

import '../../../core/time/recife_time.dart';
import '../verse.dart';

/// Card do versículo. Serve tanto para a tela quanto para a imagem
/// compartilhada (renderizada via RepaintBoundary).
class VerseCard extends StatelessWidget {
  const VerseCard({
    super.key,
    required this.verse,
    this.statusLabel,
    this.forExport = false,
  });

  final Verse verse;

  /// Status do usuário, se já existir, por exemplo "Ouro".
  final String? statusLabel;

  /// Quando `true`, usa cores fixas (independentes do tema) e marca Altar.
  final bool forExport;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = forExport ? const Color(0xFF2E4A7D) : scheme.primaryContainer;
    final fg = forExport ? Colors.white : scheme.onPrimaryContainer;
    final slot = verse.slot;

    return Container(
      width: forExport ? 1080 / 3 : null,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(forExport ? 0 : 20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            slot.greeting,
            style: TextStyle(
              color: fg.withValues(alpha: 0.85),
              fontSize: 16,
              fontWeight: FontWeight.w500,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '“${verse.text}”',
            style: TextStyle(
              color: fg,
              fontSize: 20,
              height: 1.4,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            verse.reference,
            style: TextStyle(
              color: fg.withValues(alpha: 0.9),
              fontSize: 15,
              fontStyle: FontStyle.italic,
            ),
          ),
          if (forExport || statusLabel != null) ...[
            const SizedBox(height: 24),
            Row(
              children: [
                if (statusLabel != null) ...[
                  Icon(Icons.emoji_events, size: 16, color: fg),
                  const SizedBox(width: 4),
                  Text(
                    statusLabel!,
                    style: TextStyle(color: fg, fontSize: 13),
                  ),
                ],
                const Spacer(),
                if (forExport)
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
            ),
          ],
        ],
      ),
    );
  }
}

/// Texto puro do card, para o share com texto junto da imagem.
String verseShareText(Verse verse) {
  final slot = VerseSlot.fromKey(verse.slot.key);
  return '${slot.greeting}!\n\n“${verse.text}”\n${verse.reference}\n\nEnviado pelo Altar';
}
