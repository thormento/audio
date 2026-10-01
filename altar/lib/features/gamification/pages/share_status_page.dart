import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/app_user.dart';
import '../../../core/share/widget_to_image.dart';
import '../points_rules.dart';
import '../widgets/status_card.dart';

/// Card compartilhável: "Meu status no Altar é Ouro".
class ShareStatusPage extends StatefulWidget {
  const ShareStatusPage({super.key, required this.user, required this.points});

  final AppUser user;
  final int points;

  @override
  State<ShareStatusPage> createState() => _ShareStatusPageState();
}

class _ShareStatusPageState extends State<ShareStatusPage> {
  final _boundary = GlobalKey();
  bool _busy = false;

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final status = UserStatus.forPoints(widget.points);
      final file = await captureBoundaryToPng(
        _boundary,
        fileName: 'altar-status.png',
      );
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          text: 'Meu status no Altar é ${status.label}.',
        ),
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
      appBar: AppBar(title: const Text('Compartilhar status')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                RepaintBoundary(
                  key: _boundary,
                  child: StatusCard(
                    name: widget.user.name,
                    status: status,
                    points: widget.points,
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
