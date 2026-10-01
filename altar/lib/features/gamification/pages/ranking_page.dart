import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../points_rules.dart';

/// Ranking da igreja. Só lista quem ligou `statusOptIn`. Sem ranking global.
class RankingPage extends StatelessWidget {
  const RankingPage({super.key, required this.churchId, required this.myUid});

  final String churchId;
  final String myUid;

  @override
  Widget build(BuildContext context) {
    final query = FirebaseFirestore.instance
        .collection('churches')
        .doc(churchId)
        .collection('members')
        .where('statusOptIn', isEqualTo: true)
        .limit(200);

    return Scaffold(
      appBar: AppBar(title: const Text('Ranking da igreja')),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: query.snapshots(),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Não foi possível carregar. ${snap.error}'));
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final docs = [...snap.data!.docs]..sort((a, b) {
              final pa = (a.data()['points'] as num?)?.toInt() ?? 0;
              final pb = (b.data()['points'] as num?)?.toInt() ?? 0;
              return pb.compareTo(pa);
            });
          if (docs.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Ninguém entrou no ranking ainda. Ligue "Aparecer no ranking" nos ajustes.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.builder(
            itemCount: docs.length,
            itemBuilder: (context, i) {
              final d = docs[i].data();
              final points = (d['points'] as num?)?.toInt() ?? 0;
              final status = UserStatus.forPoints(points);
              final isMe = docs[i].id == myUid;
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: status.color.withValues(alpha: 0.2),
                  child: Text('${i + 1}'),
                ),
                title: Text(
                  (d['name'] as String?)?.isNotEmpty == true
                      ? d['name'] as String
                      : 'Membro',
                  style: isMe ? const TextStyle(fontWeight: FontWeight.w700) : null,
                ),
                subtitle: Text(status.label),
                trailing: Text('$points pts'),
              );
            },
          );
        },
      ),
    );
  }
}
