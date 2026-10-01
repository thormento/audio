import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/post.dart';
import '../feed_repository.dart';

/// Equipe pastoral vê os pedidos de oração e marca como orado.
class PrayersPage extends StatelessWidget {
  const PrayersPage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM HH:mm', 'pt_BR');
    return Scaffold(
      appBar: AppBar(title: const Text('Pedidos de oração')),
      body: StreamBuilder<List<Post>>(
        stream: FeedRepository.instance.watchAllPrayers(user.churchId!),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Não foi possível carregar. ${snap.error}'));
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final items = snap.data!;
          if (items.isEmpty) {
            return const Center(child: Text('Nenhum pedido de oração ainda.'));
          }
          final pending = items.where((p) => !p.prayed).toList();
          final done = items.where((p) => p.prayed).toList();
          return ListView(
            children: [
              if (pending.isNotEmpty) const _Header('Aguardando oração'),
              for (final p in pending) _PrayerTile(post: p, user: user, fmt: fmt),
              if (done.isNotEmpty) const _Header('Já orados'),
              for (final p in done) _PrayerTile(post: p, user: user, fmt: fmt),
            ],
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(text, style: Theme.of(context).textTheme.labelLarge),
    );
  }
}

class _PrayerTile extends StatelessWidget {
  const _PrayerTile({required this.post, required this.user, required this.fmt});

  final Post post;
  final AppUser user;
  final DateFormat fmt;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(
        post.prayed ? Icons.favorite : Icons.favorite_border,
        color: post.prayed ? Colors.redAccent : null,
      ),
      title: Text(post.body),
      subtitle: Text(
        '${post.authorName}${post.createdAt != null ? ' · ${fmt.format(post.createdAt!)}' : ''}',
      ),
      trailing: post.prayed
          ? null
          : TextButton(
              onPressed: () => FeedRepository.instance.markPrayed(
                churchId: user.churchId!,
                postId: post.id,
                byUid: user.uid,
              ),
              child: const Text('Orei'),
            ),
    );
  }
}
