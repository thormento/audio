import 'package:flutter/material.dart';

/// Regras de pontos e status. Só constantes e funções puras.
class PointsRules {
  PointsRules._();

  static const int openApp = 5;
  static const int shareVerse = 10;
  static const int maxSharesPerDay = 3;
  static const int referral = 50;
  static const int quizCorrect = 15;
  static const int quizQuestions = 5;
  static const int rsvp = 10;

  static const String actionOpen = 'open';
  static const String actionShare = 'share';
  static const String actionReferral = 'referral';
  static const String actionQuiz = 'quiz';
  static const String actionRsvp = 'rsvp';
}

enum UserStatus {
  semente('semente', 'Semente', 0, Color(0xFF6B8E23), Icons.eco),
  bronze('bronze', 'Bronze', 100, Color(0xFFB87333), Icons.emoji_events),
  prata('prata', 'Prata', 400, Color(0xFF9EA7B3), Icons.emoji_events),
  ouro('ouro', 'Ouro', 1000, Color(0xFFD4AF37), Icons.emoji_events),
  diamante('diamante', 'Diamante', 2500, Color(0xFF5BC0EB), Icons.diamond);

  const UserStatus(this.key, this.label, this.minPoints, this.color, this.icon);

  final String key;
  final String label;
  final int minPoints;
  final Color color;
  final IconData icon;

  static UserStatus forPoints(int points) {
    var result = UserStatus.semente;
    for (final s in UserStatus.values) {
      if (points >= s.minPoints) result = s;
    }
    return result;
  }

  static UserStatus fromKey(String? key) => UserStatus.values.firstWhere(
        (s) => s.key == key,
        orElse: () => UserStatus.semente,
      );

  /// Próximo status, ou `null` se já está no topo.
  UserStatus? get next {
    final i = UserStatus.values.indexOf(this);
    return i + 1 < UserStatus.values.length ? UserStatus.values[i + 1] : null;
  }
}
