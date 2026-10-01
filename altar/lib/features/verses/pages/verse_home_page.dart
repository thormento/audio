import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../app/routes.dart';
import '../../../core/models/app_user.dart';
import '../../../core/time/recife_time.dart';
import '../../ads/widgets/ad_banner.dart';
import '../../gamification/points_rules.dart';
import '../verse.dart';
import '../verse_repository.dart';
import '../widgets/verse_card.dart';
import 'share_verse_page.dart';

/// Aba Início do fiel: versículo do período e botão de compartilhar.
/// É a única tela com banner, abaixo do card.
class VerseHomePage extends StatefulWidget {
  const VerseHomePage({super.key, required this.user});

  final AppUser user;

  @override
  State<VerseHomePage> createState() => _VerseHomePageState();
}

class _VerseHomePageState extends State<VerseHomePage> {
  late Future<Verse> _verse;
  VerseSlot _slot = VerseSlot.current();

  @override
  void initState() {
    super.initState();
    _verse = VerseRepository.instance.verseFor();
  }

  void _refreshIfSlotChanged() {
    final now = VerseSlot.current();
    if (now != _slot) {
      setState(() {
        _slot = now;
        _verse = VerseRepository.instance.verseFor();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    _refreshIfSlotChanged();
    final userRef =
        FirebaseFirestore.instance.collection('users').doc(widget.user.uid);
    return Scaffold(
      appBar: AppBar(title: const Text('Altar')),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() => _verse = VerseRepository.instance.verseFor());
          await _verse;
        },
        child: FutureBuilder<Verse>(
          future: _verse,
          builder: (context, snap) {
            if (snap.hasError) {
              return ListView(
                padding: const EdgeInsets.all(24),
                children: [Text('Não foi possível carregar o versículo. ${snap.error}')],
              );
            }
            final verse = snap.data;
            if (verse == null) {
              return const Center(child: CircularProgressIndicator());
            }
            return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: userRef.snapshots(),
              builder: (context, userSnap) {
                final data = userSnap.data?.data() ?? const <String, dynamic>{};
                final points = (data['points'] as num?)?.toInt() ?? 0;
                final status = UserStatus.forPoints(points);
                return ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Text(
                      '${_slot.greeting}, ${widget.user.name.split(' ').first}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    VerseCard(
                      verse: verse,
                      statusLabel: points > 0 ? status.label : null,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          settings: const RouteSettings(name: AppRoutes.shareVerse),
                          builder: (_) => ShareVersePage(
                            verse: verse,
                            user: widget.user,
                            points: points,
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.share),
                      label: const Text('Compartilhar'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Cada compartilhamento vale ${PointsRules.shareVerse} pontos, '
                      'até ${PointsRules.maxSharesPerDay} por dia.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 24),
                    // Único lugar do app com banner. Abaixo do card, nunca
                    // sobre um botão.
                    const Center(child: AdBanner()),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}
