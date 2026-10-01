import 'dart:convert';

import 'package:altar/core/time/recife_time.dart';
import 'package:altar/features/verses/verse_repository.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('seed tem 7 versículos por slot, em português, com referência', () async {
    final raw = await rootBundle.loadString('assets/seed/verses.json');
    final verses = (jsonDecode(raw) as Map<String, dynamic>)['verses'] as List;
    expect(verses.length, 21);
    for (final slot in ['manha', 'tarde', 'noite']) {
      expect(verses.where((v) => v['slot'] == slot).length, 7, reason: slot);
    }
    for (final v in verses) {
      expect((v['text'] as String).trim(), isNotEmpty);
      expect(v['reference'], matches(RegExp(r'^[A-Za-zÀ-ú0-9 ]+ \d+:\d+')));
    }
  });

  test('seed do quiz tem 30 perguntas com 4 opções e referência', () async {
    final raw = await rootBundle.loadString('assets/seed/quizzes.json');
    final qs = (jsonDecode(raw) as Map<String, dynamic>)['questions'] as List;
    expect(qs.length, 30);
    for (final q in qs) {
      expect((q['options'] as List).length, 4);
      expect(q['correctIndex'], inInclusiveRange(0, 3));
      expect((q['reference'] as String).trim(), isNotEmpty);
    }
  });

  test('versículo do seed é determinístico por dia e slot', () async {
    final repo = VerseRepository(bundle: rootBundle);
    final day = DateTime.utc(2026, 10, 1, 12);
    final a = await repo.bundledVerseFor(VerseSlot.noite, at: day);
    final b = await repo.bundledVerseFor(VerseSlot.noite, at: day);
    expect(a.id, b.id);
    expect(a.slot, VerseSlot.noite);
    final c = await repo.bundledVerseFor(VerseSlot.noite, at: day.add(const Duration(days: 1)));
    expect(c.id, isNot(a.id));
  });
}
