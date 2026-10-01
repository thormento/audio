import 'dart:math';

import 'package:altar/features/church/church_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('normalizeCode', () {
    test('remove espaços, hífens e põe em maiúsculas', () {
      expect(ChurchRepository.normalizeCode(' ab c-12 3 '), 'ABC123');
    });
  });

  group('generateCode', () {
    test('tem 6 caracteres do alfabeto sem ambiguidade', () {
      final repo = ChurchRepository(random: Random(42));
      for (var i = 0; i < 200; i++) {
        final code = repo.generateCode();
        expect(code.length, ChurchRepository.codeLength);
        for (final ch in code.split('')) {
          expect(ChurchRepository.codeAlphabet.contains(ch), isTrue);
          expect('0O1I'.contains(ch), isFalse);
        }
      }
    });
  });
}
