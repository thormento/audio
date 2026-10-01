import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// Lembrete local de evento, 60 minutos antes, sem depender de push.
class LocalNotifications {
  LocalNotifications._();

  static final LocalNotifications instance = LocalNotifications._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  Future<void> init() async {
    if (_ready || kIsWeb) return;
    try {
      tzdata.initializeTimeZones();
      tz.setLocalLocation(tz.getLocation('America/Recife'));
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
      );
      _ready = true;
    } catch (e) {
      debugPrint('Notificações locais indisponíveis: $e');
    }
  }

  static int idFor(String eventId) => eventId.hashCode & 0x7fffffff;

  Future<void> scheduleEventReminder({
    required String eventId,
    required String title,
    required DateTime startsAt,
    int minutesBefore = 60,
  }) async {
    await init();
    if (!_ready) return;
    final when = tz.TZDateTime.from(
      startsAt.subtract(Duration(minutes: minutesBefore)),
      tz.local,
    );
    if (when.isBefore(tz.TZDateTime.now(tz.local))) return;
    try {
      await _plugin.zonedSchedule(
        id: idFor(eventId),
        title: 'Começa em $minutesBefore minutos',
        body: title,
        scheduledDate: when,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'eventos',
            'Lembretes de eventos',
            channelDescription: 'Avisa um pouco antes de cultos e encontros',
            importance: Importance.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    } catch (e) {
      debugPrint('Não agendou lembrete: $e');
    }
  }

  Future<void> cancelEventReminder(String eventId) async {
    if (!_ready) return;
    await _plugin.cancel(id: idFor(eventId));
  }
}
