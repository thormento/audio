import 'package:altar/core/time/recife_time.dart';
import 'package:altar/features/gamification/points_rules.dart';
import 'package:altar/features/gamification/quiz/quiz_question.dart';
import 'package:altar/features/gamification/quiz/quiz_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('status', () {
    test('faixas exatas do roteiro', () {
      expect(UserStatus.forPoints(0), UserStatus.semente);
      expect(UserStatus.forPoints(99), UserStatus.semente);
      expect(UserStatus.forPoints(100), UserStatus.bronze);
      expect(UserStatus.forPoints(399), UserStatus.bronze);
      expect(UserStatus.forPoints(400), UserStatus.prata);
      expect(UserStatus.forPoints(1000), UserStatus.ouro);
      expect(UserStatus.forPoints(2500), UserStatus.diamante);
      expect(UserStatus.forPoints(99999), UserStatus.diamante);
    });

    test('próximo status', () {
      expect(UserStatus.semente.next, UserStatus.bronze);
      expect(UserStatus.diamante.next, isNull);
    });

    test('Semente para Bronze: 5 aberturas + 3 shares/dia + 1 indicação', () {
      // Dia 1: abrir (5) + 3 shares (30) + indicação (50) = 85.
      // Dia 2: abrir (5) + 1 share (10) = 100 -> Bronze.
      var points = 0;
      points += PointsRules.openApp + 3 * PointsRules.shareVerse + PointsRules.referral;
      expect(UserStatus.forPoints(points), UserStatus.semente);
      points += PointsRules.openApp + PointsRules.shareVerse;
      expect(points, 100);
      expect(UserStatus.forPoints(points), UserStatus.bronze);
    });
  });

  group('horário de Recife', () {
    tearDown(() => RecifeTime.clock = DateTime.now);

    test('slot pelo horário local de Recife (UTC-3)', () {
      // 08:30 UTC = 05:30 em Recife -> manhã.
      RecifeTime.clock = () => DateTime.utc(2026, 10, 1, 8, 30);
      expect(VerseSlot.current(), VerseSlot.manha);
      // 15:00 UTC = 12:00 em Recife -> tarde.
      RecifeTime.clock = () => DateTime.utc(2026, 10, 1, 15, 0);
      expect(VerseSlot.current(), VerseSlot.tarde);
      // 02:00 UTC = 23:00 do dia anterior em Recife -> noite, dia anterior.
      RecifeTime.clock = () => DateTime.utc(2026, 10, 2, 2, 0);
      expect(VerseSlot.current(), VerseSlot.noite);
      expect(RecifeTime.dayKey(), '2026-10-01');
    });

    test('semana começa na segunda', () {
      RecifeTime.clock = () => DateTime.utc(2026, 10, 1, 12); // quinta
      expect(RecifeTime.weekKey(), '2026-09-28');
    });
  });

  group('quiz do dia', () {
    final all = List.generate(
      30,
      (i) => QuizQuestion(
        id: 'q${i.toString().padLeft(2, '0')}',
        question: '?',
        options: const ['a', 'b', 'c', 'd'],
        correctIndex: 0,
        reference: 'x',
      ),
    );

    test('5 perguntas, iguais para todos no mesmo dia', () {
      final day = DateTime.utc(2026, 10, 1, 12);
      final a = QuizRepository.pickDaily(all, at: day).map((q) => q.id).toList();
      final b = QuizRepository.pickDaily(all, at: day).map((q) => q.id).toList();
      expect(a.length, PointsRules.quizQuestions);
      expect(a.toSet().length, 5);
      expect(a, b);
    });

    test('dia diferente, perguntas diferentes', () {
      final a = QuizRepository.pickDaily(all, at: DateTime.utc(2026, 10, 1, 12));
      final b = QuizRepository.pickDaily(all, at: DateTime.utc(2026, 10, 2, 12));
      expect(a.map((q) => q.id), isNot(equals(b.map((q) => q.id))));
    });
  });
}
