import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/church_event.dart';
import '../../../core/models/roles.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../gamification/points_service.dart';
import '../events_repository.dart';

/// Detalhe do evento com confirmação de presença e link do encontro online.
/// Rota proibida para anúncio.
class EventDetailPage extends StatelessWidget {
  const EventDetailPage({
    super.key,
    required this.user,
    required this.church,
    required this.eventId,
  });

  final AppUser user;
  final Church church;
  final String eventId;

  Future<void> _rsvp(BuildContext context, ChurchEvent e, bool going) async {
    final repo = EventsRepository.instance;
    try {
      await repo.setRsvp(churchId: church.id, eventId: e.id, uid: user.uid, going: going);
      if (going) {
        await LocalNotifications.instance.scheduleEventReminder(
          eventId: e.id,
          title: e.title,
          startsAt: e.startsAt,
          minutesBefore: e.reminderMinutes,
        );
        final awarded = await PointsService.instance.recordRsvp(user.uid, eventId: e.id);
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(awarded ? 'Presença confirmada! +10 pontos' : 'Presença confirmada'),
          ),
        );
      } else {
        await LocalNotifications.instance.cancelEventReminder(e.id);
      }
    } on EventsFailure catch (err) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
      }
    }
  }

  Future<void> _openLink(BuildContext context, String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir o link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat("EEEE, d 'de' MMMM 'às' HH:mm", 'pt_BR');
    final repo = EventsRepository.instance;
    return StreamBuilder<ChurchEvent?>(
      stream: repo.watchEvent(church.id, eventId),
      builder: (context, snap) {
        final e = snap.data;
        return Scaffold(
          appBar: AppBar(
            title: Text(e?.title ?? 'Evento'),
            actions: [
              if (e != null && Roles.isStaff(user.role))
                IconButton(
                  tooltip: 'Apagar',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    await repo.deleteEvent(church.id, e.id);
                    if (context.mounted) Navigator.of(context).pop();
                  },
                ),
            ],
          ),
          body: e == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(24),
                  children: [
                    Chip(label: Text(ChurchEvent.typeLabel(e.type))),
                    const SizedBox(height: 12),
                    Text(e.title, style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.schedule),
                      title: Text(fmt.format(e.startsAt)),
                    ),
                    if (e.place != null)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.place_outlined),
                        title: Text(e.place!),
                      ),
                    if (e.hasLink)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: FilledButton.icon(
                          onPressed: () => _openLink(context, e.onlineUrl!),
                          icon: const Icon(Icons.videocam_outlined),
                          label: const Text('Abrir encontro online'),
                        ),
                      ),
                    const Divider(height: 32),
                    StreamBuilder<bool?>(
                      stream: repo.watchMyRsvp(church.id, e.id, user.uid),
                      builder: (context, rs) {
                        final going = rs.data;
                        if (e.isPast()) {
                          return Text(
                            going == true ? 'Você confirmou presença.' : 'Este evento já aconteceu.',
                          );
                        }
                        return Row(
                          children: [
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: going == true ? null : () => _rsvp(context, e, true),
                                icon: const Icon(Icons.check),
                                label: Text(going == true ? 'Presença confirmada' : 'Vou participar'),
                              ),
                            ),
                            if (going == true) ...[
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: () => _rsvp(context, e, false),
                                child: const Text('Desmarcar'),
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: 12),
                    StreamBuilder<int>(
                      stream: repo.watchGoingCount(church.id, e.id),
                      builder: (context, c) => Text(
                        '${c.data ?? 0} ${(c.data ?? 0) == 1 ? 'pessoa confirmou' : 'pessoas confirmaram'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
        );
      },
    );
  }
}
