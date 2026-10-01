import '../../core/models/church.dart';

/// Planos da igreja. Valores editáveis; os limites seguem o roteiro.
class Plan {
  const Plan({
    required this.id,
    required this.label,
    required this.memberLimit,
    required this.postsPerMonth,
    required this.online,
    required this.priceCents,
    required this.highlight,
  });

  final String id;
  final String label;
  final int memberLimit;

  /// `null` = ilimitado.
  final int? postsPerMonth;
  final bool online;
  final int priceCents;
  final String highlight;

  String get priceLabel => priceCents == 0
      ? 'Grátis'
      : 'R\$ ${(priceCents / 100).toStringAsFixed(0)}/mês';
}

class Plans {
  Plans._();

  static const int trialDays = 14;
  static const int graceDays = 7;

  static const trial = Plan(
    id: 'trial',
    label: 'Teste',
    memberLimit: 30,
    postsPerMonth: 20,
    online: true,
    priceCents: 0,
    highlight: '14 dias com tudo liberado',
  );
  static const essencial = Plan(
    id: 'essencial',
    label: 'Essencial',
    memberLimit: 150,
    postsPerMonth: 40,
    online: false,
    priceCents: 4900,
    highlight: 'Comunicados, agenda e dízimo',
  );
  static const comunhao = Plan(
    id: 'comunhao',
    label: 'Comunhão',
    memberLimit: 500,
    postsPerMonth: 120,
    online: true,
    priceCents: 9900,
    highlight: 'Inclui encontros online',
  );
  static const missao = Plan(
    id: 'missao',
    label: 'Missão',
    memberLimit: 2000,
    postsPerMonth: null,
    online: true,
    priceCents: 19900,
    highlight: 'Comunicados ilimitados e relatório',
  );

  static const List<Plan> paid = [essencial, comunhao, missao];
  static const List<Plan> all = [trial, essencial, comunhao, missao];

  static Plan? byId(String? id) {
    for (final p in all) {
      if (p.id == id) return p;
    }
    return null;
  }
}

/// O que a igreja pode fazer agora, dado plano e status. Mesma lógica das
/// regras do Firestore (`churchWritable`).
class ChurchAccess {
  ChurchAccess._();

  static bool canWrite(Church church, {DateTime? now}) {
    final t = now ?? DateTime.now();
    if (church.plan == 'trial') {
      return church.planStatus == 'active' &&
          church.trialEndsAt != null &&
          church.trialEndsAt!.isAfter(t);
    }
    if (Plans.byId(church.plan) == null) return false;
    if (church.planStatus == 'active') return true;
    if (church.planStatus == 'past_due') {
      return church.graceUntil != null && church.graceUntil!.isAfter(t);
    }
    return false;
  }

  static bool allowsOnline(Church church, {DateTime? now}) {
    if (!canWrite(church, now: now)) return false;
    return Plans.byId(church.plan)?.online ?? false;
  }

  /// Comunicados publicados no mês atual (`usage.{yyyy-MM}`), mantido pela
  /// Cloud Function `notifyNewPost`.
  static int postsThisMonth(Church church, {DateTime? now}) {
    final t = now ?? DateTime.now();
    final key = '${t.year}-${t.month.toString().padLeft(2, '0')}';
    return church.usage[key] ?? 0;
  }

  static bool canPostMore(Church church, {DateTime? now}) {
    final limit = Plans.byId(church.plan)?.postsPerMonth;
    if (limit == null) return true;
    return postsThisMonth(church, now: now) < limit;
  }

  static bool canAcceptMember(Church church) =>
      church.memberCount < church.memberLimit;

  /// Texto curto do estado do plano para o painel.
  static String statusLabel(Church church, {DateTime? now}) {
    final t = now ?? DateTime.now();
    final plan = Plans.byId(church.plan);
    if (church.plan == 'trial') {
      if (!canWrite(church, now: t)) return 'Teste encerrado: painel somente leitura';
      final days = church.trialEndsAt!.difference(t).inDays;
      return 'Teste: ${days == 0 ? 'último dia' : '$days dias restantes'}';
    }
    if (plan == null) return 'Sem plano: painel somente leitura';
    switch (church.planStatus) {
      case 'active':
        return 'Plano ${plan.label} ativo';
      case 'past_due':
        return canWrite(church, now: t)
            ? 'Pagamento atrasado: ${Plans.graceDays} dias de tolerância'
            : 'Pagamento atrasado: painel somente leitura';
      default:
        return 'Plano ${plan.label} encerrado: painel somente leitura';
    }
  }
}
