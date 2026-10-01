import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../core/time/recife_time.dart';
import 'points_rules.dart';

class ShareResult {
  const ShareResult({required this.pointsAwarded, required this.sharesTodayBefore});

  /// Pontos somados neste compartilhamento (0 quando passou do limite).
  final int pointsAwarded;

  /// Quantos compartilhamentos a pessoa já tinha feito hoje antes deste.
  final int sharesTodayBefore;
}

class QuizResult {
  const QuizResult({
    required this.correct,
    required this.total,
    required this.points,
    required this.doubled,
  });

  final int correct;
  final int total;
  final int points;
  final bool doubled;
}

/// Soma pontos e atualiza status em `users/{uid}`, grava `pointsLog` e
/// espelha pontos no doc de membro para o ranking opt-in.
///
/// Dívida: a validação de limites diários é feita no cliente e nas regras
/// apenas de forma parcial. Um Cloud Function pode assumir isso depois.
class PointsService {
  PointsService({FirebaseFirestore? db}) : _dbOverride = db;

  static final PointsService instance = PointsService();

  final FirebaseFirestore? _dbOverride;
  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  DocumentReference<Map<String, dynamic>> _userRef(String uid) =>
      _db.collection('users').doc(uid);

  /// +5 na primeira abertura do dia. Também atualiza a sequência de dias.
  Future<bool> recordAppOpen(String uid) async {
    final today = RecifeTime.dayKey();
    final yesterday = RecifeTime.dayKey(
      RecifeTime.now().subtract(const Duration(days: 1)),
    );
    return _db.runTransaction<bool>((tx) async {
      final snap = await tx.get(_userRef(uid));
      final data = snap.data() ?? const <String, dynamic>{};
      if (data['lastOpenOn'] == today) return false;
      final streak = data['lastOpenOn'] == yesterday
          ? ((data['streakDays'] as num?)?.toInt() ?? 0) + 1
          : 1;
      _award(
        tx,
        uid: uid,
        data: data,
        points: PointsRules.openApp,
        action: PointsRules.actionOpen,
        refId: today,
        extra: {'lastOpenOn': today, 'streakDays': streak},
      );
      return true;
    });
  }

  /// +10 por compartilhamento, até 3 por dia. Sempre registra no log,
  /// mesmo sem pontos, para o intersticial contar certo.
  Future<ShareResult> recordShare(String uid, {required String verseId}) async {
    final today = RecifeTime.dayKey();
    return _db.runTransaction<ShareResult>((tx) async {
      final snap = await tx.get(_userRef(uid));
      final data = snap.data() ?? const <String, dynamic>{};
      final sharesBefore = data['sharesOn'] == today
          ? ((data['sharesToday'] as num?)?.toInt() ?? 0)
          : 0;
      final points =
          sharesBefore < PointsRules.maxSharesPerDay ? PointsRules.shareVerse : 0;
      _award(
        tx,
        uid: uid,
        data: data,
        points: points,
        action: PointsRules.actionShare,
        refId: verseId,
        extra: {'sharesOn': today, 'sharesToday': sharesBefore + 1},
      );
      return ShareResult(pointsAwarded: points, sharesTodayBefore: sharesBefore);
    });
  }

  /// Quiz do dia: +15 por acerto, dobrado se assistiu ao rewarded.
  Future<QuizResult> recordQuiz(
    String uid, {
    required int correct,
    required int total,
    bool doubled = false,
  }) async {
    final today = RecifeTime.dayKey();
    final week = RecifeTime.weekKey();
    final base = correct * PointsRules.quizCorrect;
    final points = doubled ? base * 2 : base;
    return _db.runTransaction<QuizResult>((tx) async {
      final snap = await tx.get(_userRef(uid));
      final data = snap.data() ?? const <String, dynamic>{};
      if (data['lastQuizOn'] == today) {
        throw StateError('Você já fez o quiz de hoje.');
      }
      _award(
        tx,
        uid: uid,
        data: data,
        points: points,
        action: PointsRules.actionQuiz,
        refId: today,
        extra: {'lastQuizOn': today},
      );
      tx.set(_userRef(uid).collection('quizResults').doc(today), {
        'correct': correct,
        'total': total,
        'points': points,
        'doubled': doubled,
        'weekKey': week,
        'at': FieldValue.serverTimestamp(),
      });
      return QuizResult(
        correct: correct,
        total: total,
        points: points,
        doubled: doubled,
      );
    });
  }

  /// +10 ao confirmar presença, uma vez por evento. A agenda entra na fase
  /// da igreja; o método já segue a regra.
  Future<bool> recordRsvp(String uid, {required String eventId}) async {
    final logRef = _userRef(uid).collection('pointsLog').doc('rsvp_$eventId');
    return _db.runTransaction<bool>((tx) async {
      final existing = await tx.get(logRef);
      if (existing.exists) return false;
      final snap = await tx.get(_userRef(uid));
      final data = snap.data() ?? const <String, dynamic>{};
      _award(
        tx,
        uid: uid,
        data: data,
        points: PointsRules.rsvp,
        action: PointsRules.actionRsvp,
        refId: eventId,
        logRef: logRef,
      );
      return true;
    });
  }

  /// Credita indicações pendentes para quem indicou. Antifraude simples:
  /// mesmo aparelho (deviceId) não conta.
  Future<int> processReferrals(String uid) async {
    final QuerySnapshot<Map<String, dynamic>> pending;
    try {
      pending = await _db
          .collection('referrals')
          .where('referrerUid', isEqualTo: uid)
          .where('status', isEqualTo: 'pending')
          .get();
    } catch (e) {
      debugPrint('Indicações indisponíveis: $e');
      return 0;
    }
    if (pending.docs.isEmpty) return 0;

    var credited = 0;
    for (final doc in pending.docs) {
      await _db.runTransaction<void>((tx) async {
        final me = await tx.get(_userRef(uid));
        final data = me.data() ?? const <String, dynamic>{};
        final myDevice = data['deviceId'] as String?;
        final theirDevice = doc.data()['deviceId'] as String?;
        final sameDevice = myDevice != null &&
            myDevice != 'unknown' &&
            myDevice == theirDevice;
        if (sameDevice) {
          tx.update(doc.reference, {
            'status': 'rejected_same_device',
            'resolvedAt': FieldValue.serverTimestamp(),
          });
          return;
        }
        _award(
          tx,
          uid: uid,
          data: data,
          points: PointsRules.referral,
          action: PointsRules.actionReferral,
          refId: doc.id,
        );
        tx.update(doc.reference, {
          'status': 'credited',
          'resolvedAt': FieldValue.serverTimestamp(),
        });
        credited++;
      });
    }
    return credited;
  }

  void _award(
    Transaction tx, {
    required String uid,
    required Map<String, dynamic> data,
    required int points,
    required String action,
    required String refId,
    Map<String, dynamic> extra = const {},
    DocumentReference<Map<String, dynamic>>? logRef,
  }) {
    final current = (data['points'] as num?)?.toInt() ?? 0;
    final total = current + points;
    final status = UserStatus.forPoints(total).key;
    tx.update(_userRef(uid), {
      'points': total,
      'status': status,
      ...extra,
    });
    tx.set(logRef ?? _userRef(uid).collection('pointsLog').doc(), {
      'action': action,
      'points': points,
      'refId': refId,
      'at': FieldValue.serverTimestamp(),
    });
    final churchId = data['churchId'] as String?;
    if (churchId != null && churchId.isNotEmpty) {
      tx.update(
        _db.collection('churches').doc(churchId).collection('members').doc(uid),
        {'points': total, 'status': status, 'name': data['name']},
      );
    }
  }
}
