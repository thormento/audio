import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../app/routes.dart';
import '../../../core/models/app_user.dart';
import '../../../core/time/recife_time.dart';
import '../../settings/pages/settings_page.dart';
import '../points_rules.dart';
import '../widgets/status_card.dart';
import 'ranking_page.dart';
import 'share_status_page.dart';

/// Perfil: troféu, pontos, próximo status, quizzes da semana.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final userRef = FirebaseFirestore.instance.collection('users').doc(user.uid);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Perfil'),
        actions: [
          IconButton(
            tooltip: 'Ajustes',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                settings: const RouteSettings(name: AppRoutes.settings),
                builder: (_) => SettingsPage(user: user),
              ),
            ),
          ),
        ],
      ),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: userRef.snapshots(),
        builder: (context, snap) {
          final data = snap.data?.data() ?? const <String, dynamic>{};
          final points = (data['points'] as num?)?.toInt() ?? 0;
          final streak = (data['streakDays'] as num?)?.toInt() ?? 0;
          final status = UserStatus.forPoints(points);
          final next = status.next;
          final optIn = data['statusOptIn'] == true;
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(user.name, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              StatusCard(name: user.name, status: status, points: points),
              const SizedBox(height: 16),
              if (next != null)
                _ProgressTile(points: points, status: status, next: next)
              else
                const ListTile(
                  leading: Icon(Icons.diamond),
                  title: Text('Você chegou ao topo: Diamante'),
                ),
              ListTile(
                leading: const Icon(Icons.local_fire_department_outlined),
                title: Text('$streak ${streak == 1 ? 'dia seguido' : 'dias seguidos'}'),
                subtitle: const Text('Abrir o app todo dia vale 5 pontos'),
              ),
              _QuizzesThisWeek(uid: user.uid),
              const Divider(height: 32),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    settings: const RouteSettings(name: AppRoutes.shareStatus),
                    builder: (_) => ShareStatusPage(user: user, points: points),
                  ),
                ),
                icon: const Icon(Icons.share),
                label: const Text('Compartilhar meu status'),
              ),
              if (user.hasChurch) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: optIn
                      ? () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              settings:
                                  const RouteSettings(name: AppRoutes.ranking),
                              builder: (_) => RankingPage(
                                churchId: user.churchId!,
                                myUid: user.uid,
                              ),
                            ),
                          )
                      : null,
                  icon: const Icon(Icons.leaderboard_outlined),
                  label: Text(
                    optIn
                        ? 'Ranking da igreja'
                        : 'Ranking da igreja (ligue nos ajustes)',
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _ProgressTile extends StatelessWidget {
  const _ProgressTile({
    required this.points,
    required this.status,
    required this.next,
  });

  final int points;
  final UserStatus status;
  final UserStatus next;

  @override
  Widget build(BuildContext context) {
    final span = next.minPoints - status.minPoints;
    final done = points - status.minPoints;
    final missing = next.minPoints - points;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Faltam $missing pontos para ${next.label}'),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: span == 0 ? 1 : (done / span).clamp(0, 1),
          color: next.color,
        ),
      ],
    );
  }
}

class _QuizzesThisWeek extends StatelessWidget {
  const _QuizzesThisWeek({required this.uid});

  final String uid;

  @override
  Widget build(BuildContext context) {
    final q = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('quizResults')
        .where('weekKey', isEqualTo: RecifeTime.weekKey());
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: q.snapshots(),
      builder: (context, snap) {
        final docs = snap.data?.docs ?? const [];
        final correct = docs.fold<int>(
          0,
          (acc, d) => acc + ((d.data()['correct'] as num?)?.toInt() ?? 0),
        );
        return ListTile(
          leading: const Icon(Icons.quiz_outlined),
          title: Text(
            '${docs.length} ${docs.length == 1 ? 'quiz' : 'quizzes'} esta semana',
          ),
          subtitle: Text('$correct acertos'),
        );
      },
    );
  }
}
