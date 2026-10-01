import 'package:altar/core/models/church.dart';
import 'package:altar/core/models/church_event.dart';
import 'package:altar/features/billing/plans.dart';
import 'package:altar/features/events/events_repository.dart';
import 'package:altar/features/giving/pix_payload.dart';
import 'package:altar/features/settings/pages/privacy_page.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Pix BR Code', () {
    test('CRC16/CCITT-FALSE bate com o vetor conhecido', () {
      expect(PixPayload.crc16('123456789'), 0x29B1);
    });

    test('payload tem os campos obrigatórios e CRC válido', () {
      final code = PixPayload.build(
        key: 'igreja@exemplo.com',
        merchantName: 'Igreja Batista da Graça',
        merchantCity: 'Recife',
        amountCents: 5000,
        txid: 'abc123',
      );
      expect(code, startsWith('000201'));
      expect(code, contains('br.gov.bcb.pix'));
      expect(code, contains('igreja@exemplo.com'));
      expect(code, contains('540550.00'));
      expect(code, contains('5802BR'));
      expect(code, contains('5923Igreja Batista da Graca'));
      expect(code, contains('6006Recife'));
      final body = code.substring(0, code.length - 4);
      final crc = PixPayload.crc16(body).toRadixString(16).toUpperCase().padLeft(4, '0');
      expect(code.endsWith(crc), isTrue);
    });
  });

  group('acesso por plano', () {
    final now = DateTime(2026, 10, 1);
    Church church({
      String plan = 'trial',
      String status = 'active',
      DateTime? trialEndsAt,
      DateTime? graceUntil,
      Map<String, int> usage = const {},
      int memberCount = 0,
    }) =>
        Church(
          id: 'c',
          name: 'Igreja',
          city: 'Recife',
          inviteCode: 'ABC234',
          createdBy: 'p',
          plan: plan,
          planStatus: status,
          trialEndsAt: trialEndsAt,
          graceUntil: graceUntil,
          usage: usage,
          memberCount: memberCount,
          memberLimit: Plans.byId(plan)?.memberLimit ?? 30,
        );

    test('trial ativo escreve; trial vencido só lê', () {
      expect(ChurchAccess.canWrite(church(trialEndsAt: now.add(const Duration(days: 3))), now: now), isTrue);
      expect(ChurchAccess.canWrite(church(trialEndsAt: now.subtract(const Duration(days: 1))), now: now), isFalse);
      expect(ChurchAccess.canWrite(church(status: 'expired', trialEndsAt: now.add(const Duration(days: 3))), now: now), isFalse);
    });

    test('atraso tem 7 dias de tolerância', () {
      final c = church(plan: 'essencial', status: 'past_due', graceUntil: now.add(const Duration(days: 2)));
      expect(ChurchAccess.canWrite(c, now: now), isTrue);
      final late = church(plan: 'essencial', status: 'past_due', graceUntil: now.subtract(const Duration(days: 1)));
      expect(ChurchAccess.canWrite(late, now: now), isFalse);
    });

    test('encontro online só em trial, Comunhão e Missão', () {
      expect(ChurchAccess.allowsOnline(church(trialEndsAt: now.add(const Duration(days: 1))), now: now), isTrue);
      expect(ChurchAccess.allowsOnline(church(plan: 'essencial'), now: now), isFalse);
      expect(ChurchAccess.allowsOnline(church(plan: 'comunhao'), now: now), isTrue);
      expect(ChurchAccess.allowsOnline(church(plan: 'missao'), now: now), isTrue);
    });

    test('limite de comunicados por mês', () {
      expect(ChurchAccess.canPostMore(church(plan: 'essencial', usage: const {'2026-10': 39}), now: now), isTrue);
      expect(ChurchAccess.canPostMore(church(plan: 'essencial', usage: const {'2026-10': 40}), now: now), isFalse);
      expect(ChurchAccess.canPostMore(church(plan: 'missao', usage: const {'2026-10': 999}), now: now), isTrue);
    });

    test('limites dos planos seguem o roteiro', () {
      expect(Plans.trial.memberLimit, 30);
      expect(Plans.essencial.memberLimit, 150);
      expect(Plans.comunhao.memberLimit, 500);
      expect(Plans.missao.memberLimit, 2000);
      expect(Plans.essencial.priceCents, 4900);
      expect(Plans.comunhao.priceCents, 9900);
      expect(Plans.missao.priceCents, 19900);
      expect(ChurchAccess.canAcceptMember(church(memberCount: 30)), isFalse);
    });
  });

  group('agenda', () {
    test('próximos primeiro, passados no fim', () {
      final now = DateTime(2026, 10, 1, 12);
      ChurchEvent ev(String id, int hours) => ChurchEvent(
            id: id,
            churchId: 'c',
            title: id,
            startsAt: now.add(Duration(hours: hours)),
            type: ChurchEvent.typeCulto,
          );
      final sorted = EventsRepository.sortForAgenda(
        [ev('p1', -2), ev('f2', 48), ev('p2', -48), ev('f1', 2)],
        now: now,
      );
      expect(sorted.map((e) => e.id).toList(), ['f1', 'f2', 'p1', 'p2']);
    });
  });

  group('idade', () {
    test('cálculo de idade e corte de 16 anos', () {
      final at = DateTime(2026, 10, 1);
      expect(ageAt(DateTime(2010, 10, 1), at), 16);
      expect(ageAt(DateTime(2010, 10, 2), at), 15);
    });
  });
}
