import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `churches/{churchId}/posts/{postId}`.
///
/// `aviso` é o comunicado da igreja, visível a todos os membros.
/// `oracao` é o pedido de oração: só o autor e a equipe pastoral veem.
class Post {
  const Post({
    required this.id,
    required this.churchId,
    required this.authorId,
    required this.authorName,
    required this.type,
    required this.title,
    required this.body,
    this.createdAt,
    this.prayedAt,
    this.prayedBy,
  });

  static const String typeAviso = 'aviso';
  static const String typeOracao = 'oracao';

  final String id;
  final String churchId;
  final String authorId;
  final String authorName;
  final String type;
  final String title;
  final String body;
  final DateTime? createdAt;
  final DateTime? prayedAt;
  final String? prayedBy;

  bool get isPrayer => type == typeOracao;
  bool get prayed => prayedAt != null;

  factory Post.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const <String, dynamic>{};
    return Post(
      id: doc.id,
      churchId: d['churchId'] as String? ?? '',
      authorId: d['authorId'] as String? ?? '',
      authorName: d['authorName'] as String? ?? '',
      type: d['type'] as String? ?? typeAviso,
      title: d['title'] as String? ?? '',
      body: d['body'] as String? ?? '',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      prayedAt: (d['prayedAt'] as Timestamp?)?.toDate(),
      prayedBy: d['prayedBy'] as String?,
    );
  }
}
