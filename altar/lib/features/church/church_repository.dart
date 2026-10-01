import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/models/church.dart';
import '../../core/models/roles.dart';

class ChurchFailure implements Exception {
  const ChurchFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Cria igreja, gera código de convite e faz o fiel entrar pelo código.
///
/// O código fica em `inviteCodes/{code}` apontando para a igreja. Isso
/// permite que um usuário logado valide o código sem ler a coleção
/// `churches`, que é restrita a membros.
class ChurchRepository {
  ChurchRepository({FirebaseFirestore? db, Random? random})
      : _dbOverride = db,
        _random = random ?? Random.secure();

  static final ChurchRepository instance = ChurchRepository();

  final FirebaseFirestore? _dbOverride;
  final Random _random;

  /// Resolvido só no uso, para permitir testes puros sem Firebase.
  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  /// Sem 0, O, 1 e I para evitar confusão ao ditar o código.
  static const String codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static const int codeLength = 6;
  static const int trialDays = 14;

  CollectionReference<Map<String, dynamic>> get _churches =>
      _db.collection('churches');

  CollectionReference<Map<String, dynamic>> get _inviteCodes =>
      _db.collection('inviteCodes');

  DocumentReference<Map<String, dynamic>> _memberRef(
    String churchId,
    String uid,
  ) =>
      _churches.doc(churchId).collection('members').doc(uid);

  Stream<Church?> watchChurch(String churchId) {
    return _churches.doc(churchId).snapshots().map(
          (doc) => doc.exists ? Church.fromDoc(doc) : null,
        );
  }

  Stream<int> watchMemberCount(String churchId) {
    return _churches
        .doc(churchId)
        .collection('members')
        .snapshots()
        .map((q) => q.size);
  }

  String generateCode() {
    return List.generate(
      codeLength,
      (_) => codeAlphabet[_random.nextInt(codeAlphabet.length)],
    ).join();
  }

  static String normalizeCode(String raw) =>
      raw.trim().toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

  /// Pastor cria a igreja e vira `churchAdmin`.
  Future<Church> createChurch({
    required String uid,
    required String name,
    required String city,
  }) async {
    final cleanName = name.trim();
    final cleanCity = city.trim();
    if (cleanName.isEmpty) throw const ChurchFailure('Informe o nome da igreja.');
    if (cleanCity.isEmpty) throw const ChurchFailure('Informe a cidade.');

    final churchRef = _churches.doc();
    final trialEndsAt = DateTime.now().add(const Duration(days: trialDays));

    for (var attempt = 0; attempt < 5; attempt++) {
      final code = generateCode();
      final codeRef = _inviteCodes.doc(code);
      try {
        final created = await _db.runTransaction<bool>((tx) async {
          final existing = await tx.get(codeRef);
          if (existing.exists) return false;

          tx.set(churchRef, {
            'name': cleanName,
            'city': cleanCity,
            'logoUrl': null,
            'pixKey': null,
            'pixKeyType': null,
            'plan': 'trial',
            'planStatus': 'active',
            'trialEndsAt': Timestamp.fromDate(trialEndsAt),
            'memberLimit': 30,
            'memberCount': 1,
            'inviteCode': code,
            'createdBy': uid,
            'createdAt': FieldValue.serverTimestamp(),
          });
          tx.set(codeRef, {
            'churchId': churchRef.id,
            'name': cleanName,
            'city': cleanCity,
            'createdAt': FieldValue.serverTimestamp(),
          });
          tx.set(_memberRef(churchRef.id, uid), {
            'role': Roles.churchAdmin,
            'joinedAt': FieldValue.serverTimestamp(),
            'statusOptIn': false,
          });
          tx.update(_db.collection('users').doc(uid), {
            'churchId': churchRef.id,
            'role': Roles.churchAdmin,
          });
          return true;
        });
        if (created) {
          return Church(
            id: churchRef.id,
            name: cleanName,
            city: cleanCity,
            inviteCode: code,
            createdBy: uid,
            trialEndsAt: trialEndsAt,
          );
        }
      } on FirebaseException catch (e) {
        throw ChurchFailure(_message(e, 'Não foi possível criar a igreja'));
      }
    }
    throw const ChurchFailure('Não foi possível gerar um código. Tente de novo.');
  }

  /// Fiel entra pelo código e vira `member`.
  Future<Church> joinByCode({
    required String uid,
    required String rawCode,
  }) async {
    final code = normalizeCode(rawCode);
    if (code.length != codeLength) {
      throw const ChurchFailure('O código tem 6 letras ou números.');
    }

    final DocumentSnapshot<Map<String, dynamic>> invite;
    try {
      invite = await _inviteCodes.doc(code).get();
    } on FirebaseException catch (e) {
      throw ChurchFailure(_message(e, 'Não foi possível verificar o código'));
    }
    if (!invite.exists) {
      throw const ChurchFailure('Código inválido. Confira com a sua igreja.');
    }
    final data = invite.data()!;
    final churchId = data['churchId'] as String;

    final batch = _db.batch();
    batch.set(_memberRef(churchId, uid), {
      'role': Roles.member,
      'joinedAt': FieldValue.serverTimestamp(),
      'statusOptIn': false,
      'inviteCode': code,
    });
    batch.update(_db.collection('users').doc(uid), {
      'churchId': churchId,
      'role': Roles.member,
    });
    batch.update(_churches.doc(churchId), {
      'memberCount': FieldValue.increment(1),
    });

    try {
      await batch.commit();
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') {
        // As regras bloqueiam quando a igreja não existe mais ou o código
        // não bate com o da igreja.
        throw const ChurchFailure(
          'Igreja não encontrada, código desatualizado ou limite de membros do plano atingido.',
        );
      }
      throw ChurchFailure(_message(e, 'Não foi possível entrar na igreja'));
    }

    return Church(
      id: churchId,
      name: (data['name'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      inviteCode: code,
      createdBy: '',
    );
  }

  String _message(FirebaseException e, String prefix) {
    if (e.code == 'permission-denied') return '$prefix: sem permissão.';
    if (e.code == 'unavailable') return '$prefix: sem conexão.';
    return '$prefix (${e.code}).';
  }
}
