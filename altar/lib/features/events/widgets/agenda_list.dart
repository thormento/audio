import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../app/routes.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/church_event.dart';
import '../events_repository.dart';
import '../pages/event_detail_page.dart';

/// Agenda: próximos primeiro, passados no fim.
class AgendaList extends StatelessWidget {
  const AgendaList({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat("EEE, d 'de' MMM · HH:mm", 'pt_BR');
    return StreamBuilder<List<ChurchEvent>>(
      stream: EventsRepository.instance.watchAgenda(church.id),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Text('Não foi possível carregar a agenda. ${snap.error}'));
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final events = snap.data!;
        if (events.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('Nenhum evento marcado ainda.'),
            ),
          );
        }
        final now = DateTime.now();
        var pastHeaderShown = false;
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 96),
          itemCount: events.length,
          itemBuilder: (context, i) {
            final e = events[i];
            final past = e.isPast(now);
            final showHeader = past && !pastHeaderShown;
            if (showHeader) pastHeaderShown = true;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showHeader)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text('Já aconteceram', style: Theme.of(context).textTheme.labelLarge),
                  ),
                ListTile(
                  enabled: !past,
                  leading: Icon(_icon(e.type)),
                  title: Text(e.title),
                  subtitle: Text(
                    '${fmt.format(e.startsAt)}'
                    '${e.isOnline ? ' · online' : e.place != null ? ' · ${e.place}' : ''}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      settings: RouteSettings(name: '${AppRoutes.eventDetail}/${e.id}'),
                      builder: (_) => EventDetailPage(user: user, church: church, eventId: e.id),
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  static IconData _icon(String type) {
    switch (type) {
      case ChurchEvent.typeOnline:
        return Icons.videocam_outlined;
      case ChurchEvent.typeEncontro:
        return Icons.groups_outlined;
      default:
        return Icons.church_outlined;
    }
  }
}
