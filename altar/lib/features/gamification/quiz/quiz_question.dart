import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `quizzes/{quizId}` ou item de `assets/seed/quizzes.json`.
class QuizQuestion {
  const QuizQuestion({
    required this.id,
    required this.question,
    required this.options,
    required this.correctIndex,
    required this.reference,
  });

  final String id;
  final String question;
  final List<String> options;
  final int correctIndex;
  final String reference;

  factory QuizQuestion.fromJson(Map<String, dynamic> json, {String? id}) {
    return QuizQuestion(
      id: id ?? (json['id'] as String? ?? ''),
      question: json['question'] as String? ?? '',
      options: (json['options'] as List? ?? const []).cast<String>(),
      correctIndex: (json['correctIndex'] as num?)?.toInt() ?? 0,
      reference: json['reference'] as String? ?? '',
    );
  }

  factory QuizQuestion.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      QuizQuestion.fromJson(doc.data() ?? const {}, id: doc.id);
}
