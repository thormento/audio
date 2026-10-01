import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/roles.dart';
import '../../auth/auth_repository.dart';
import '../church_repository.dart';

/// Início vazio da Fase 1: nome da igreja, papel e, para a equipe, o código.
class ChurchHomePage extends StatelessWidget {
  const ChurchHomePage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final churchId = user.churchId!;
    return StreamBuilder<Church?>(
      stream: ChurchRepository.instance.watchChurch(churchId),
      builder: (context, snap) {
        final church = snap.data;
        return Scaffold(
          appBar: AppBar(
            title: Text(church?.name ?? 'Altar'),
            actions: [
              IconButton(
                tooltip: 'Sair',
                onPressed: AuthRepository.instance.signOut,
                icon: const Icon(Icons.logout),
              ),
            ],
          ),
          body: SafeArea(
            child: snap.connectionState == ConnectionState.waiting
                ? const Center(child: CircularProgressIndicator())
                : church == null
                    ? const _ChurchMissing()
                    : _HomeBody(user: user, church: church),
          ),
        );
      },
    );
  }
}

class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final isStaff = Roles.isStaff(user.role);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(church.name, style: textTheme.headlineMedium),
        const SizedBox(height: 4),
        Text(church.city, style: textTheme.bodyLarge),
        const SizedBox(height: 8),
        Chip(label: Text(Roles.label(user.role))),
        const SizedBox(height: 32),
        if (isStaff) _InviteCard(church: church),
        const SizedBox(height: 32),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.campaign_outlined, color: scheme.primary),
                const SizedBox(height: 8),
                Text('Nenhum comunicado ainda', style: textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  isStaff
                      ? 'Os comunicados da igreja entram na próxima fase.'
                      : 'Quando a igreja publicar algo, aparece aqui.',
                  style: textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.church});

  final Church church;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Código de convite',
              style: textTheme.titleMedium?.copyWith(
                color: scheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: SelectableText(
                    church.inviteCode,
                    style: textTheme.displaySmall?.copyWith(
                      letterSpacing: 6,
                      fontWeight: FontWeight.w700,
                      color: scheme.onPrimaryContainer,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Copiar',
                  onPressed: () async {
                    await Clipboard.setData(
                      ClipboardData(text: church.inviteCode),
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Código copiado')),
                      );
                    }
                  },
                  icon: const Icon(Icons.copy),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Passe este código aos fiéis para entrarem na igreja.',
              style: textTheme.bodyMedium?.copyWith(
                color: scheme.onPrimaryContainer,
              ),
            ),
            StreamBuilder<int>(
              stream: ChurchRepository.instance.watchMemberCount(church.id),
              builder: (context, snap) {
                final count = snap.data;
                if (count == null) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '$count de ${church.memberLimit} membros no plano atual.',
                    style: textTheme.bodySmall?.copyWith(
                      color: scheme.onPrimaryContainer,
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ChurchMissing extends StatelessWidget {
  const _ChurchMissing();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40),
            const SizedBox(height: 12),
            const Text(
              'Não encontramos sua igreja. Ela pode ter sido removida ou '
              'você ainda não tem acesso.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: AuthRepository.instance.signOut,
              child: const Text('Sair e entrar de novo'),
            ),
          ],
        ),
      ),
    );
  }
}
