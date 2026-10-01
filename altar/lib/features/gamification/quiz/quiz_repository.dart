import 'dart:convert';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../../core/time/recife_time.dart';
import '../points_rules.dart';
import 'quiz_question.dart';

/// Perguntas do quiz. Firestore `quizzes` quando houver seed; senão o
/// arquivo embutido. As 5 do dia são sorteadas de forma determinística
/// pelo dia, para todo mundo responder as mesmas.
class QuizRepository {
  QuizRepository({FirebaseFirestore? db, AssetBundle? bundle})
      : _dbOverride = db,
        _bundle = bundle ?? rootBundle;

  static final QuizRepository instance = QuizRepository();

  final FirebaseFirestore? _dbOverride;
  final AssetBundle _bundle;
  List<QuizQuestion>? _bundled;

  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  Future<List<QuizQuestion>> bundledQuestions() async {
    if (_bundled != null) return _bundled!;
    final raw = await _bundle.loadString('assets/seed/quizzes.json');
    final json = jsonDecode(raw) as Map<String, dynamic>;
    _bundled = (json['questions'] as List)
        .cast<Map<String, dynamic>>()
        .map(QuizQuestion.fromJson)
        .toList();
    return _bundled!;
  }

  Future<List<QuizQuestion>> allQuestions({bool useFirestore = true}) async {
    if (useFirestore) {
      try {
        final q = await _db.collection('quizzes').get();
        if (q.docs.length >= PointsRules.quizQuestions) {
          return q.docs.map(QuizQuestion.fromDoc).toList();
        }
      } catch (e) {
        debugPrint('quizzes no Firestore indisponível, usando seed: $e');
      }
    }
    return bundledQuestions();
  }

  /// As perguntas de hoje.
  Future<List<QuizQuestion>> dailyQuestions({
    DateTime? at,
    bool useFirestore = true,
  }) async {
    final all = await allQuestions(useFirestore: useFirestore);
    return pickDaily(all, at: at);
  }

  @visibleForTesting
  static List<QuizQuestion> pickDaily(List<QuizQuestion> all, {DateTime? at}) {
    final now = at ?? RecifeTime.now();
    final sorted = [...all]..sort((a, b) => a.id.compareTo(b.id));
    final seed = now.year * 1000 + RecifeTime.dayOfYear(now);
    sorted.shuffle(Random(seed));
    return sorted.take(PointsRules.quizQuestions).toList();
  }
}
