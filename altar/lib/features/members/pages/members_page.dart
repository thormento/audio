import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/roles.dart';

/// Lista de membros e papéis. Só a equipe (pastor, administrador) muda papel.
class MembersPage extends StatelessWidget {
  const MembersPage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final members = FirebaseFirestore.instance
        .collection('churches')
        .doc(user.churchId)
        .collection('members');
    final canEdit = Roles.isStaff(user.role);

    return Scaffold(
      appBar: AppBar(title: const Text('Membros e equipe')),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: members.snapshots(),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Não foi possível carregar. ${snap.error}'));
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final docs = [...snap.data!.docs]..sort((a, b) {
              final ra = Roles.all.indexOf(a.data()['role'] as String? ?? '');
              final rb = Roles.all.indexOf(b.data()['role'] as String? ?? '');
              if (ra != rb) return rb.compareTo(ra);
              return ((a.data()['name'] as String?) ?? '')
                  .compareTo((b.data()['name'] as String?) ?? '');
            });
          return ListView.builder(
            itemCount: docs.length,
            itemBuilder: (context, i) {
              final d = docs[i].data();
              final role = d['role'] as String? ?? Roles.member;
              final isMe = docs[i].id == user.uid;
              final name = (d['name'] as String?)?.isNotEmpty == true
                  ? d['name'] as String
                  : 'Membro ${docs[i].id.substring(0, 4)}';
              return ListTile(
                leading: CircleAvatar(child: Text(name.characters.first.toUpperCase())),
                title: Text(isMe ? '$name (você)' : name),
                subtitle: Text(Roles.label(role)),
                trailing: canEdit && !isMe
                    ? PopupMenuButton<String>(
                        tooltip: 'Mudar papel',
                        onSelected: (r) => docs[i].reference.update({'role': r}),
                        itemBuilder: (_) => [
                          for (final r in Roles.all)
                            PopupMenuItem(value: r, child: Text(Roles.label(r))),
                        ],
                      )
                    : null,
              );
            },
          );
        },
      ),
    );
  }
}
