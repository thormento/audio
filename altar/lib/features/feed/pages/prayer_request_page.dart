import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/post.dart';
import '../feed_repository.dart';

/// Fiel pede oração e vê os próprios pedidos. Sem anúncio nesta tela.
class PrayerRequestPage extends StatefulWidget {
  const PrayerRequestPage({super.key, required this.user});

  final AppUser user;

  @override
  State<PrayerRequestPage> createState() => _PrayerRequestPageState();
}

class _PrayerRequestPageState extends State<PrayerRequestPage> {
  final _body = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await FeedRepository.instance.requestPrayer(
        churchId: widget.user.churchId!,
        authorId: widget.user.uid,
        authorName: widget.user.name,
        body: _body.text,
      );
      _body.clear();
      if (!mounted) return;
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pedido enviado. A equipe vai orar por você.')),
      );
    } on FeedFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final fmt = DateFormat('dd/MM/yyyy HH:mm', 'pt_BR');
    return Scaffold(
      appBar: AppBar(title: const Text('Pedido de oração')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Só o pastor e a equipe veem o seu pedido. Ele não aparece no feed.',
                    style: textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _body,
                    minLines: 3,
                    maxLines: 8,
                    maxLength: 1000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Pelo que você quer que oremos?',
                      alignLabelWithHint: true,
                    ),
                  ),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: const Text('Enviar pedido'),
                  ),
                ],
              ),
            ),
            const Divider(height: 32),
            Expanded(
              child: StreamBuilder<List<Post>>(
                stream: FeedRepository.instance.watchMyPrayers(
                  widget.user.churchId!,
                  widget.user.uid,
                ),
                builder: (context, snap) {
                  final items = snap.data ?? const [];
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (items.isEmpty) {
                    return const Center(child: Text('Você ainda não pediu oração.'));
                  }
                  return ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, i) {
                      final p = items[i];
                      return ListTile(
                        leading: Icon(
                          p.prayed ? Icons.favorite : Icons.favorite_border,
                          color: p.prayed ? Colors.redAccent : null,
                        ),
                        title: Text(p.body),
                        subtitle: Text(
                          p.prayed
                              ? 'A equipe orou por você'
                              : p.createdAt == null
                                  ? 'Enviando...'
                                  : 'Enviado em ${fmt.format(p.createdAt!)}',
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
