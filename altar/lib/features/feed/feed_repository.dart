import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/models/post.dart';

class FeedFailure implements Exception {
  const FeedFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Comunicados e pedidos de oração de uma igreja.
class FeedRepository {
  FeedRepository({FirebaseFirestore? db}) : _dbOverride = db;

  static final FeedRepository instance = FeedRepository();

  final FirebaseFirestore? _dbOverride;
  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _posts(String churchId) =>
      _db.collection('churches').doc(churchId).collection('posts');

  /// Feed da igreja, do mais novo para o mais antigo.
  Stream<List<Post>> watchFeed(String churchId) {
    return _posts(churchId)
        .where('type', isEqualTo: Post.typeAviso)
        .orderBy('createdAt', descending: true)
        .limit(100)
        .snapshots()
        .map((q) => q.docs.map(Post.fromDoc).toList());
  }

  /// Pedidos de oração do próprio fiel.
  Stream<List<Post>> watchMyPrayers(String churchId, String uid) {
    return _posts(churchId)
        .where('type', isEqualTo: Post.typeOracao)
        .where('authorId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((q) => q.docs.map(Post.fromDoc).toList());
  }

  /// Todos os pedidos de oração. Só a equipe passa nas regras.
  Stream<List<Post>> watchAllPrayers(String churchId) {
    return _posts(churchId)
        .where('type', isEqualTo: Post.typeOracao)
        .orderBy('createdAt', descending: true)
        .limit(200)
        .snapshots()
        .map((q) => q.docs.map(Post.fromDoc).toList());
  }

  Future<void> publishPost({
    required String churchId,
    required String authorId,
    required String authorName,
    required String title,
    required String body,
  }) async {
    final t = title.trim();
    final b = body.trim();
    if (t.isEmpty) throw const FeedFailure('Informe um título.');
    if (b.isEmpty) throw const FeedFailure('Escreva o comunicado.');
    try {
      await _posts(churchId).add({
        'churchId': churchId,
        'authorId': authorId,
        'authorName': authorName,
        'type': Post.typeAviso,
        'title': t,
        'body': b,
        'audience': 'all',
        'createdAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw FeedFailure(_message(e, 'Não foi possível publicar'));
    }
  }

  Future<void> requestPrayer({
    required String churchId,
    required String authorId,
    required String authorName,
    required String body,
  }) async {
    final b = body.trim();
    if (b.isEmpty) throw const FeedFailure('Escreva o seu pedido.');
    try {
      await _posts(churchId).add({
        'churchId': churchId,
        'authorId': authorId,
        'authorName': authorName,
        'type': Post.typeOracao,
        'title': '',
        'body': b,
        'audience': 'staff',
        'createdAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException catch (e) {
      throw FeedFailure(_message(e, 'Não foi possível enviar o pedido'));
    }
  }

  Future<void> markPrayed({
    required String churchId,
    required String postId,
    required String byUid,
  }) async {
    try {
      await _posts(churchId).doc(postId).update({
        'prayedAt': FieldValue.serverTimestamp(),
        'prayedBy': byUid,
      });
    } on FirebaseException catch (e) {
      throw FeedFailure(_message(e, 'Não foi possível marcar'));
    }
  }

  Future<void> deletePost(String churchId, String postId) async {
    try {
      await _posts(churchId).doc(postId).delete();
    } on FirebaseException catch (e) {
      throw FeedFailure(_message(e, 'Não foi possível apagar'));
    }
  }

  String _message(FirebaseException e, String prefix) {
    if (e.code == 'permission-denied') {
      return '$prefix: sem permissão ou plano somente leitura.';
    }
    if (e.code == 'unavailable') return '$prefix: sem conexão.';
    return '$prefix (${e.code}).';
  }
}
