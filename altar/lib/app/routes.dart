/// Nomes de rota. Usados nas telas empurradas por `Navigator` e pela
/// política de anúncios, que proíbe banner em algumas delas.
class AppRoutes {
  AppRoutes._();

  static const String login = '/login';
  static const String signUp = '/cadastro';
  static const String chooseChurch = '/igreja/escolher';
  static const String createChurch = '/igreja/criar';
  static const String joinChurch = '/igreja/entrar';
  static const String verseHome = '/inicio';
  static const String shareVerse = '/versiculo/compartilhar';
  static const String quiz = '/quiz';
  static const String profile = '/perfil';
  static const String shareStatus = '/perfil/status';
  static const String ranking = '/perfil/ranking';
  static const String settings = '/ajustes';

  // Rotas da igreja que ainda não existem, mas já entram na lista proibida.
  static const String giving = '/dizimo';
  static const String eventDetail = '/agenda/evento';
  static const String prayer = '/oracao';
  static const String billing = '/plano';
}
