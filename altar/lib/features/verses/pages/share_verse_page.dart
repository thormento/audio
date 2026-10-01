import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/app_user.dart';
import '../../../core/share/widget_to_image.dart';
import '../../ads/ads_service.dart';
import '../../gamification/points_rules.dart';
import '../../gamification/points_service.dart';
import '../verse.dart';
import '../widgets/verse_card.dart';

/// Pré-visualização do card e share nativo.
class ShareVersePage extends StatefulWidget {
  const ShareVersePage({
    super.key,
    required this.verse,
    required this.user,
    required this.points,
  });

  final Verse verse;
  final AppUser user;
  final int points;

  @override
  State<ShareVersePage> createState() => _ShareVersePageState();
}

class _ShareVersePageState extends State<ShareVersePage> {
  final _boundary = GlobalKey();
  bool _busy = false;

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final file = await captureBoundaryToPng(
        _boundary,
        fileName: 'altar-versiculo.png',
      );
      final result = await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          text: verseShareText(widget.verse),
        ),
      );
      if (result.status == ShareResultStatus.dismissed) return;

      final share = await PointsService.instance.recordShare(
        widget.user.uid,
        verseId: widget.verse.id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            share.pointsAwarded > 0
                ? 'Compartilhado! +${share.pointsAwarded} pontos'
                : 'Compartilhado! Os pontos de hoje já foram contados.',
          ),
        ),
      );
      Navigator.of(context).pop();
      // O intersticial é decidido aqui, na tela do versículo, nunca em
      // rota proibida.
      await AdsService.instance.afterShare(
        sharesTodayBefore: share.sharesTodayBefore,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível compartilhar. $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = UserStatus.forPoints(widget.points);
    return Scaffold(
      appBar: AppBar(title: const Text('Compartilhar versículo')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                RepaintBoundary(
                  key: _boundary,
                  child: VerseCard(
                    verse: widget.verse,
                    statusLabel: widget.points > 0 ? status.label : null,
                    forExport: true,
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: 1080 / 3,
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _share,
                    icon: const Icon(Icons.share),
                    label: const Text('Compartilhar'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
