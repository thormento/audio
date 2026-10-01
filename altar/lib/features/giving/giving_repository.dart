import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../core/models/church.dart';
import '../../core/models/gift.dart';
import 'pix_payload.dart';

class GivingFailure implements Exception {
  const GivingFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Dízimo e oferta. Nunca toca em cartão.
///
/// Dois caminhos:
/// 1. `pix_mp`: Cloud Function `createGiftPix` gera o Pix no Mercado Pago
///    (sandbox). O MP credita a conta da plataforma; o lançamento fica
///    marcado como repasse manual e o status vem por webhook.
/// 2. `pix_direto`: BR Code estático com a chave da igreja, gerado no app.
///    Cai direto na igreja. O fiel informa que pagou e a tesouraria confere.
class GivingRepository {
  GivingRepository({FirebaseFirestore? db, FirebaseFunctions? functions})
      : _dbOverride = db,
        _functionsOverride = functions;

  static final GivingRepository instance = GivingRepository();

  final FirebaseFirestore? _dbOverride;
  final FirebaseFunctions? _functionsOverride;
  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get _functions =>
      _functionsOverride ?? FirebaseFunctions.instanceFor(region: 'southamerica-east1');

  CollectionReference<Map<String, dynamic>> _gifts(String churchId) =>
      _db.collection('churches').doc(churchId).collection('gifts');

  Stream<List<Gift>> watchMyGifts(String churchId, String uid) {
    return _gifts(churchId)
        .where('uid', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(100)
        .snapshots()
        .map((q) => q.docs.map(Gift.fromDoc).toList());
  }

  /// Período para a tesouraria. Grava trilha de acesso (LGPD).
  Stream<List<Gift>> watchPeriod(
    String churchId, {
    required DateTime from,
    required DateTime to,
  }) {
    return _gifts(churchId)
        .where('createdAt', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
        .where('createdAt', isLessThan: Timestamp.fromDate(to))
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((q) => q.docs.map(Gift.fromDoc).toList());
  }

  Future<void> logReportAccess({
    required String churchId,
    required String uid,
    required String period,
    String action = 'view',
  }) {
    return _db.collection('churches').doc(churchId).collection('giftsAudit').add({
      'uid': uid,
      'period': period,
      'action': action,
      'at': FieldValue.serverTimestamp(),
    });
  }

  Future<void> savePixKey({
    required String churchId,
    required String pixKey,
    required String pixKeyType,
  }) async {
    final key = pixKey.trim();
    if (key.isEmpty) throw const GivingFailure('Informe a chave Pix.');
    try {
      await _db.collection('churches').doc(churchId).update({
        'pixKey': key,
        'pixKeyType': pixKeyType,
      });
    } on FirebaseException catch (e) {
      throw GivingFailure(_message(e, 'Não foi possível salvar a chave'));
    }
  }

  /// Cria o lançamento. Tenta o Mercado Pago; se a função não estiver
  /// disponível (emulador sem functions, sem token), gera o BR Code direto.
  Future<Gift> createGift({
    required Church church,
    required String uid,
    required String kind,
    required int amountCents,
  }) async {
    if (amountCents < 100) throw const GivingFailure('Valor mínimo de R\$ 1,00.');
    if (!church.hasPix) {
      throw const GivingFailure('A igreja ainda não cadastrou a chave Pix.');
    }

    try {
      final res = await _functions.httpsCallable('createGiftPix').call<Map<String, dynamic>>({
        'churchId': church.id,
        'amountCents': amountCents,
        'kind': kind,
      });
      final data = Map<String, dynamic>.from(res.data);
      final snap = await _gifts(church.id).doc(data['giftId'] as String).get();
      return Gift.fromDoc(snap);
    } on FirebaseFunctionsException catch (e) {
      debugPrint('createGiftPix indisponível (${e.code}), usando Pix direto');
      if (e.code == 'permission-denied' || e.code == 'invalid-argument') {
        throw GivingFailure(e.message ?? 'Não foi possível gerar o Pix.');
      }
    } catch (e) {
      debugPrint('createGiftPix falhou, usando Pix direto: $e');
    }

    final ref = _gifts(church.id).doc();
    final payload = PixPayload.build(
      key: church.pixKey!,
      merchantName: church.name,
      merchantCity: church.city,
      amountCents: amountCents,
      txid: ref.id,
      description: kind == Gift.kindOferta ? 'Oferta' : 'Dizimo',
    );
    try {
      await ref.set({
        'churchId': church.id,
        'uid': uid,
        'kind': kind,
        'amountCents': amountCents,
        'method': Gift.methodPixDireto,
        'status': Gift.statusPendente,
        'settlement': 'direto',
        'externalId': null,
        'pixCopiaECola': payload,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw GivingFailure(_message(e, 'Não foi possível registrar'));
    }
    return Gift(
      id: ref.id,
      churchId: church.id,
      uid: uid,
      kind: kind,
      amountCents: amountCents,
      method: Gift.methodPixDireto,
      status: Gift.statusPendente,
      settlement: 'direto',
      pixCopiaECola: payload,
      createdAt: DateTime.now(),
    );
  }

  /// Fiel informa que pagou. A tesouraria confirma depois.
  Future<void> markInformed(String churchId, String giftId) async {
    try {
      await _gifts(churchId).doc(giftId).update({
        'status': Gift.statusInformado,
        'informedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw GivingFailure(_message(e, 'Não foi possível informar'));
    }
  }

  /// Tesouraria confirma ou expira um lançamento.
  Future<void> setStatus({
    required String churchId,
    required String giftId,
    required String status,
    required String byUid,
  }) async {
    try {
      await _gifts(churchId).doc(giftId).update({
        'status': status,
        'reviewedBy': byUid,
        'reviewedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw GivingFailure(_message(e, 'Não foi possível atualizar'));
    }
  }

  static String toCsv(List<Gift> gifts) {
    final buf = StringBuffer('data;tipo;valor;metodo;status;id\n');
    for (final g in gifts) {
      final date = g.createdAt?.toIso8601String() ?? '';
      buf.writeln('$date;${g.kind};${(g.amountCents / 100).toStringAsFixed(2)};${g.method};${g.status};${g.id}');
    }
    return buf.toString();
  }

  String _message(FirebaseException e, String prefix) {
    if (e.code == 'permission-denied') return '$prefix: sem permissão ou plano somente leitura.';
    if (e.code == 'unavailable') return '$prefix: sem conexão.';
    return '$prefix (${e.code}).';
  }
}
