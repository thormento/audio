/// Papéis dentro de uma igreja. Gravados em `churches/{id}/members/{uid}`.
class Roles {
  Roles._();

  static const String member = 'member';
  static const String leader = 'leader';
  static const String treasurer = 'treasurer';
  static const String pastor = 'pastor';
  static const String churchAdmin = 'churchAdmin';

  static const List<String> all = [member, leader, treasurer, pastor, churchAdmin];

  /// Quem administra o painel da igreja.
  static bool isStaff(String? role) => role == pastor || role == churchAdmin;

  /// Quem vê o relatório de dízimos e exporta.
  static bool isFinance(String? role) => isStaff(role) || role == treasurer;

  static String label(String? role) {
    switch (role) {
      case leader:
        return 'Líder';
      case treasurer:
        return 'Tesoureiro';
      case pastor:
        return 'Pastor';
      case churchAdmin:
        return 'Administrador';
      case member:
      default:
        return 'Membro';
    }
  }
}
