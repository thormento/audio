import '../../app/routes.dart';

/// Regras de onde e quando um anúncio pode aparecer. Só lógica pura.
class AdPolicy {
  AdPolicy._();

  /// Telas onde nunca entra banner, intersticial ou pré-carregamento.
  static const Set<String> forbiddenRoutes = {
    AppRoutes.login,
    AppRoutes.signUp,
    AppRoutes.giving,
    AppRoutes.eventDetail,
    AppRoutes.prayer,
    AppRoutes.billing,
  };

  static bool isForbidden(String? routeName) {
    if (routeName == null) return false;
    for (final r in forbiddenRoutes) {
      if (routeName == r || routeName.startsWith('$r/')) return true;
    }
    return false;
  }

  /// Intersticial no máximo 1 a cada 3 compartilhamentos e nunca no
  /// primeiro compartilhamento do dia.
  ///
  /// [sharesTodayBefore] é quantas vezes a pessoa já compartilhou hoje,
  /// antes deste compartilhamento.
  static bool shouldShowInterstitial({required int sharesTodayBefore}) {
    final thisShare = sharesTodayBefore + 1;
    if (thisShare == 1) return false;
    return thisShare % 3 == 0;
  }
}
