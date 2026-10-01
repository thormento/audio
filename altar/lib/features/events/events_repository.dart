import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/models/church_event.dart';

class EventsFailure implements Exception {
  const EventsFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Agenda da igreja: cultos, encontros presenciais e encontros online.
class EventsRepository {
  EventsRepository({FirebaseFirestore? db}) : _dbOverride = db;

  static final EventsRepository instance = EventsRepository();

  final FirebaseFirestore? _dbOverride;
  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _events(String churchId) =>
      _db.collection('churches').doc(churchId).collection('events');

  /// Próximos primeiro, em ordem; passados no fim, do mais recente ao mais
  /// antigo.
  static List<ChurchEvent> sortForAgenda(List<ChurchEvent> all, {DateTime? now}) {
    final t = now ?? DateTime.now();
    final upcoming = all.where((e) => !e.isPast(t)).toList()
      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
    final past = all.where((e) => e.isPast(t)).toList()
      ..sort((a, b) => b.startsAt.compareTo(a.startsAt));
    return [...upcoming, ...past];
  }

  Stream<List<ChurchEvent>> watchAgenda(String churchId) {
    final since = DateTime.now().subtract(const Duration(days: 90));
    return _events(churchId)
        .where('startsAt', isGreaterThan: Timestamp.fromDate(since))
        .orderBy('startsAt')
        .limit(200)
        .snapshots()
        .map((q) => sortForAgenda(q.docs.map(ChurchEvent.fromDoc).toList()));
  }

  Stream<ChurchEvent?> watchEvent(String churchId, String eventId) {
    return _events(churchId).doc(eventId).snapshots().map(
          (d) => d.exists ? ChurchEvent.fromDoc(d) : null,
        );
  }

  Future<String> createEvent({
    required String churchId,
    required String createdBy,
    required String title,
    required DateTime startsAt,
    required String type,
    String? place,
    String? onlineUrl,
    int reminderMinutes = 60,
  }) async {
    final t = title.trim();
    if (t.isEmpty) throw const EventsFailure('Informe o título.');
    final url = onlineUrl?.trim() ?? '';
    if (type == ChurchEvent.typeOnline) {
      final uri = Uri.tryParse(url);
      if (url.isEmpty || uri == null || !uri.hasScheme || !uri.host.contains('.')) {
        throw const EventsFailure('Encontro online precisa de um link válido (Meet, Zoom, live).');
      }
    }
    try {
      final ref = await _events(churchId).add({
        'churchId': churchId,
        'title': t,
        'startsAt': Timestamp.fromDate(startsAt),
        'type': type,
        'place': (place?.trim().isEmpty ?? true) ? null : place!.trim(),
        'onlineUrl': url.isEmpty ? null : url,
        'reminderMinutes': reminderMinutes,
        'createdBy': createdBy,
        'createdAt': FieldValue.serverTimestamp(),
      });
      return ref.id;
    } on FirebaseException catch (e) {
      throw EventsFailure(_message(e, 'Não foi possível criar o evento'));
    }
  }

  Future<void> deleteEvent(String churchId, String eventId) async {
    try {
      await _events(churchId).doc(eventId).delete();
    } on FirebaseException catch (e) {
      throw EventsFailure(_message(e, 'Não foi possível apagar'));
    }
  }

  DocumentReference<Map<String, dynamic>> rsvpRef(
    String churchId,
    String eventId,
    String uid,
  ) =>
      _events(churchId).doc(eventId).collection('rsvp').doc(uid);

  Stream<bool?> watchMyRsvp(String churchId, String eventId, String uid) {
    return rsvpRef(churchId, eventId, uid)
        .snapshots()
        .map((d) => d.exists ? d.data()!['going'] as bool? : null);
  }

  Stream<int> watchGoingCount(String churchId, String eventId) {
    return _events(churchId)
        .doc(eventId)
        .collection('rsvp')
        .where('going', isEqualTo: true)
        .snapshots()
        .map((q) => q.size);
  }

  Future<void> setRsvp({
    required String churchId,
    required String eventId,
    required String uid,
    required bool going,
  }) async {
    try {
      await rsvpRef(churchId, eventId, uid).set({
        'going': going,
        'at': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw EventsFailure(_message(e, 'Não foi possível confirmar'));
    }
  }

  String _message(FirebaseException e, String prefix) {
    if (e.code == 'permission-denied') {
      return '$prefix: sem permissão, plano somente leitura ou encontro online fora do plano.';
    }
    if (e.code == 'unavailable') return '$prefix: sem conexão.';
    return '$prefix (${e.code}).';
  }
}
