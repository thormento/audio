/// Horário de referência do app: America/Recife (UTC-3, sem horário de verão).
///
/// Todo "dia" de pontos, versículo e quiz é contado neste fuso, para que o
/// limite diário seja o mesmo em qualquer aparelho.
class RecifeTime {
  RecifeTime._();

  static const Duration offset = Duration(hours: -3);

  /// Permite travar o relógio em testes.
  static DateTime Function() clock = DateTime.now;

  static DateTime now() => clock().toUtc().add(offset);

  /// Chave do dia no formato `yyyy-MM-dd`.
  static String dayKey([DateTime? at]) {
    final d = at ?? now();
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '${d.year}-$m-$day';
  }

  /// Dia do ano (1 a 366), usado para variar o versículo e o quiz.
  static int dayOfYear([DateTime? at]) {
    final d = at ?? now();
    return d.difference(DateTime.utc(d.year, 1, 1)).inDays + 1;
  }

  /// Segunda-feira da semana atual, como chave `yyyy-MM-dd`.
  static String weekKey([DateTime? at]) {
    final d = at ?? now();
    final monday = d.subtract(Duration(days: d.weekday - 1));
    return dayKey(DateTime.utc(monday.year, monday.month, monday.day));
  }
}

enum VerseSlot {
  manha('manha', 'Bom dia'),
  tarde('tarde', 'Boa tarde'),
  noite('noite', 'Boa noite');

  const VerseSlot(this.key, this.greeting);

  final String key;
  final String greeting;

  /// Manhã das 5h às 11h59, tarde até 17h59, noite o restante.
  static VerseSlot forTime(DateTime at) {
    final h = at.hour;
    if (h >= 5 && h < 12) return VerseSlot.manha;
    if (h >= 12 && h < 18) return VerseSlot.tarde;
    return VerseSlot.noite;
  }

  static VerseSlot current() => forTime(RecifeTime.now());

  static VerseSlot fromKey(String key) =>
      VerseSlot.values.firstWhere((s) => s.key == key, orElse: () => manha);
}
