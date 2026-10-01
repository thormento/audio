/// Papéis dentro de uma igreja. Gravados em `churches/{id}/members/{uid}`.
class Roles {
  Roles._();

  static const String member = 'member';
  static const String leader = 'leader';
  static const String pastor = 'pastor';
  static const String churchAdmin = 'churchAdmin';

  static const List<String> all = [member, leader, pastor, churchAdmin];

  /// Quem administra o painel da igreja.
  static bool isStaff(String? role) => role == pastor || role == churchAdmin;

  static String label(String? role) {
    switch (role) {
      case leader:
        return 'Líder';
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
