import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `churches/{churchId}/events/{eventId}`.
class ChurchEvent {
  const ChurchEvent({
    required this.id,
    required this.churchId,
    required this.title,
    required this.startsAt,
    required this.type,
    this.place,
    this.onlineUrl,
    this.reminderMinutes = 60,
    this.createdBy,
  });

  static const String typeCulto = 'culto';
  static const String typeEncontro = 'encontro';
  static const String typeOnline = 'online';
  static const List<String> types = [typeCulto, typeEncontro, typeOnline];

  static String typeLabel(String t) {
    switch (t) {
      case typeEncontro:
        return 'Encontro';
      case typeOnline:
        return 'Online';
      default:
        return 'Culto';
    }
  }

  final String id;
  final String churchId;
  final String title;
  final DateTime startsAt;
  final String type;
  final String? place;
  final String? onlineUrl;
  final int reminderMinutes;
  final String? createdBy;

  bool get isOnline => type == typeOnline;
  bool get hasLink => onlineUrl != null && onlineUrl!.isNotEmpty;
  bool isPast([DateTime? now]) => startsAt.isBefore(now ?? DateTime.now());

  factory ChurchEvent.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const <String, dynamic>{};
    return ChurchEvent(
      id: doc.id,
      churchId: d['churchId'] as String? ?? '',
      title: d['title'] as String? ?? '',
      startsAt: (d['startsAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      type: d['type'] as String? ?? typeCulto,
      place: d['place'] as String?,
      onlineUrl: d['onlineUrl'] as String?,
      reminderMinutes: (d['reminderMinutes'] as num?)?.toInt() ?? 60,
      createdBy: d['createdBy'] as String?,
    );
  }
}
