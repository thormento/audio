import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../app/routes.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/post.dart';
import '../../../core/models/roles.dart';
import '../../auth/auth_repository.dart';
import '../../billing/plans.dart';
import '../../events/pages/new_event_page.dart';
import '../../events/widgets/agenda_list.dart';
import '../../feed/feed_repository.dart';
import '../../feed/pages/new_post_page.dart';
import '../../feed/pages/prayer_request_page.dart';
import '../../giving/pages/giving_page.dart';
import '../church_repository.dart';
import 'church_admin_page.dart';

/// Aba Igreja: avisos e agenda, com atalhos de oração e dízimo.
class ChurchHomePage extends StatefulWidget {
  const ChurchHomePage({super.key, required this.user});

  final AppUser user;

  @override
  State<ChurchHomePage> createState() => _ChurchHomePageState();
}

class _ChurchHomePageState extends State<ChurchHomePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;
    final churchId = user.churchId!;
    return StreamBuilder<Church?>(
      stream: ChurchRepository.instance.watchChurch(churchId),
      builder: (context, snap) {
        final church = snap.data;
        final isStaff = Roles.isStaff(user.role);
        final canWrite = church != null && ChurchAccess.canWrite(church);
        return Scaffold(
          appBar: AppBar(
            title: Text(church?.name ?? 'Igreja'),
            actions: [
              if (church != null && Roles.isFinance(user.role))
                IconButton(
                  tooltip: 'Painel da igreja',
                  icon: const Icon(Icons.admin_panel_settings_outlined),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ChurchAdminPage(user: user),
                    ),
                  ),
                ),
            ],
            bottom: church == null
                ? null
                : TabBar(
                    controller: _tabs,
                    tabs: const [Tab(text: 'Avisos'), Tab(text: 'Agenda')],
                  ),
          ),
          body: SafeArea(
            child: snap.connectionState == ConnectionState.waiting
                ? const Center(child: CircularProgressIndicator())
                : church == null
                    ? const _ChurchMissing()
                    : Column(
                        children: [
                          if (isStaff && !canWrite)
                            MaterialBanner(
                              content: Text(ChurchAccess.statusLabel(church)),
                              leading: const Icon(Icons.lock_outline),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => ChurchAdminPage(user: user),
                                    ),
                                  ),
                                  child: const Text('Ver plano'),
                                ),
                              ],
                            ),
                          Expanded(
                            child: TabBarView(
                              controller: _tabs,
                              children: [
                                _Feed(user: user, church: church),
                                AgendaList(user: user, church: church),
                              ],
                            ),
                          ),
                        ],
                      ),
          ),
          floatingActionButton: church == null
              ? null
              : AnimatedBuilder(
                  animation: _tabs,
                  builder: (context, _) {
                    if (_tabs.index == 0) {
                      if (isStaff) {
                        return FloatingActionButton.extended(
                          onPressed: canWrite && ChurchAccess.canPostMore(church)
                              ? () => Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => NewPostPage(user: user),
                                    ),
                                  )
                              : () => _explainBlocked(context, church),
                          icon: const Icon(Icons.campaign_outlined),
                          label: const Text('Novo comunicado'),
                        );
                      }
                      return FloatingActionButton.extended(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            settings: const RouteSettings(name: AppRoutes.prayer),
                            builder: (_) => PrayerRequestPage(user: user),
                          ),
                        ),
                        icon: const Icon(Icons.volunteer_activism_outlined),
                        label: const Text('Pedir oração'),
                      );
                    }
                    if (isStaff) {
                      return FloatingActionButton.extended(
                        onPressed: canWrite
                            ? () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) =>
                                        NewEventPage(user: user, church: church),
                                  ),
                                )
                            : () => _explainBlocked(context, church),
                        icon: const Icon(Icons.event_outlined),
                        label: const Text('Novo evento'),
                      );
                    }
                    return const SizedBox.shrink();
                  },
                ),
        );
      },
    );
  }

  void _explainBlocked(BuildContext context, Church church) {
    final text = !ChurchAccess.canWrite(church)
        ? ChurchAccess.statusLabel(church)
        : 'Limite de comunicados do mês atingido no plano ${Plans.byId(church.plan)?.label ?? ''}.';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _Feed extends StatelessWidget {
  const _Feed({required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat("d 'de' MMMM, HH:mm", 'pt_BR');
    final isStaff = Roles.isStaff(user.role);
    return StreamBuilder<List<Post>>(
      stream: FeedRepository.instance.watchFeed(church.id),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Não foi possível carregar o feed. ${snap.error}'),
            ),
          );
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final posts = snap.data!;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            _GivingShortcut(user: user, church: church),
            const SizedBox(height: 16),
            if (posts.isEmpty)
              const _EmptyFeed()
            else
              for (final p in posts)
                Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                p.title,
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ),
                            if (isStaff)
                              IconButton(
                                tooltip: 'Apagar',
                                icon: const Icon(Icons.delete_outline, size: 20),
                                onPressed: () => _confirmDelete(context, p),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(p.body),
                        const SizedBox(height: 10),
                        Text(
                          '${p.authorName}${p.createdAt != null ? ' · ${fmt.format(p.createdAt!)}' : ''}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }

  Future<void> _confirmDelete(BuildContext context, Post p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Apagar comunicado?'),
        content: Text(p.title),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apagar')),
        ],
      ),
    );
    if (ok == true) {
      await FeedRepository.instance.deletePost(church.id, p.id);
    }
  }
}

class _GivingShortcut extends StatelessWidget {
  const _GivingShortcut({required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.secondaryContainer,
      child: ListTile(
        leading: Icon(Icons.favorite_outline, color: scheme.onSecondaryContainer),
        title: const Text('Dízimo e oferta'),
        subtitle: Text(
          church.hasPix
              ? 'Pix direto para a ${church.name}'
              : 'A igreja ainda não cadastrou a chave Pix',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            settings: const RouteSettings(name: AppRoutes.giving),
            builder: (_) => GivingPage(user: user, church: church),
          ),
        ),
      ),
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Icon(Icons.campaign_outlined, size: 40, color: scheme.primary),
            const SizedBox(height: 12),
            Text('Nenhum comunicado ainda', style: textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Quando a igreja publicar algo, aparece aqui.',
              style: textTheme.bodyMedium,
              textAlign: TextAlign.center,
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
