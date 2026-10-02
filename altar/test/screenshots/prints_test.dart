// Gera prints das telas em docs/prints/ sem emulador, pelo renderizador de
// testes do Flutter. Rode:
//   flutter test --update-goldens test/screenshots/
// Fica fora do `flutter test` normal por causa da tag.
@Tags(['prints'])
library;

import 'dart:io';

import 'package:altar/app/theme/app_theme.dart';
import 'package:altar/core/models/app_user.dart';
import 'package:altar/core/models/church.dart';
import 'package:altar/core/time/recife_time.dart';
import 'package:altar/features/auth/pages/sign_in_page.dart';
import 'package:altar/features/auth/pages/sign_up_page.dart';
import 'package:altar/features/church/pages/choose_church_page.dart';
import 'package:altar/features/church/pages/join_church_page.dart';
import 'package:altar/features/events/pages/new_event_page.dart';
import 'package:altar/features/gamification/points_rules.dart';
import 'package:altar/features/gamification/widgets/status_card.dart';
import 'package:altar/features/giving/pages/giving_page.dart';
import 'package:altar/features/verses/verse.dart';
import 'package:altar/features/verses/widgets/verse_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

const _fontsDir = '/opt/flutter/bin/cache/artifacts/material_fonts';

Future<void> _loadFonts() async {
  Future<ByteData> read(String f) async =>
      ByteData.view((await File('$_fontsDir/$f').readAsBytes()).buffer);
  final roboto = FontLoader('Roboto')
    ..addFont(read('Roboto-Regular.ttf'))
    ..addFont(read('Roboto-Medium.ttf'))
    ..addFont(read('Roboto-Bold.ttf'));
  await roboto.load();
  final icons = FontLoader('MaterialIcons')..addFont(read('MaterialIcons-Regular.otf'));
  await icons.load();
}

const _user = AppUser(
  uid: 'u1',
  name: 'Mariana Souza',
  email: 'mariana@exemplo.com',
  churchId: 'c1',
  role: 'member',
  consentAccount: true,
  points: 230,
);

final _church = Church(
  id: 'c1',
  name: 'Igreja Batista da Graça',
  city: 'Recife',
  inviteCode: 'GRC7K2',
  createdBy: 'p',
  pixKey: '12.345.678/0001-99',
  pixKeyType: 'cnpj',
  memberCount: 42,
  memberLimit: 150,
  plan: 'comunhao',
  trialEndsAt: DateTime.now().add(const Duration(days: 9)),
);

const _verse = Verse(
  id: 'manha-01',
  slot: VerseSlot.manha,
  text: 'As misericórdias do Senhor são a causa de não sermos consumidos, '
      'porque as suas misericórdias não têm fim; novas são cada manhã; '
      'grande é a tua fidelidade.',
  reference: 'Lamentações 3:22-23',
);

Widget _app(Widget home, {bool dark = false}) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: home,
    );

Widget _shell(Widget body, int tab) => Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Início'),
          NavigationDestination(icon: Icon(Icons.church_outlined), selectedIcon: Icon(Icons.church), label: 'Igreja'),
          NavigationDestination(icon: Icon(Icons.quiz_outlined), selectedIcon: Icon(Icons.quiz), label: 'Quiz'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );

/// Início do fiel, como VerseHomePage mas sem Firestore.
Widget _verseHome() => _shell(
      Scaffold(
        appBar: AppBar(title: const Text('Altar')),
        body: Builder(
          builder: (context) => ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text('Bom dia, Mariana', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              const VerseCard(verse: _verse, statusLabel: 'Bronze'),
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.share), label: const Text('Compartilhar')),
              const SizedBox(height: 8),
              Text(
                'Cada compartilhamento vale 10 pontos, até 3 por dia.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 24),
              Center(
                child: Container(
                  width: 320,
                  height: 50,
                  alignment: Alignment.center,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  child: Text('Anúncio (banner de teste)', style: Theme.of(context).textTheme.bodySmall),
                ),
              ),
            ],
          ),
        ),
      ),
      0,
    );

Widget _feed() => _shell(
      DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: Text(_church.name),
            actions: [IconButton(icon: const Icon(Icons.admin_panel_settings_outlined), onPressed: () {})],
            bottom: const TabBar(tabs: [Tab(text: 'Avisos'), Tab(text: 'Agenda')]),
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () {},
            icon: const Icon(Icons.volunteer_activism_outlined),
            label: const Text('Pedir oração'),
          ),
          body: Builder(
            builder: (context) => ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                Card(
                  color: Theme.of(context).colorScheme.secondaryContainer,
                  child: const ListTile(
                    leading: Icon(Icons.favorite_outline),
                    title: Text('Dízimo e oferta'),
                    subtitle: Text('Pix direto para a Igreja Batista da Graça'),
                    trailing: Icon(Icons.chevron_right),
                  ),
                ),
                const SizedBox(height: 16),
                for (final p in const [
                  ('Culto de domingo às 18h', 'Teremos ceia e apresentação do coral infantil. Chegue 15 minutos antes.', 'Pr. Daniel · 30 de setembro, 20:14'),
                  ('Campanha do agasalho', 'Até dia 15 recebemos cobertores e casacos na secretaria.', 'Pr. Daniel · 28 de setembro, 09:02'),
                  ('Encontro de jovens online', 'Sexta às 20h pelo Meet. O link está na agenda.', 'Ana Paula · 26 de setembro, 18:40'),
                ])
                  Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.$1, style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 6),
                          Text(p.$2),
                          const SizedBox(height: 10),
                          Text(p.$3, style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      1,
    );

Widget _profile() => _shell(
      Scaffold(
        appBar: AppBar(title: const Text('Perfil'), actions: [IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () {})]),
        body: Builder(
          builder: (context) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(_user.name, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              const StatusCard(name: 'Mariana Souza', status: UserStatus.bronze, points: 230),
              const SizedBox(height: 16),
              const Text('Faltam 170 pontos para Prata'),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: 130 / 300, color: UserStatus.prata.color),
              const ListTile(leading: Icon(Icons.local_fire_department_outlined), title: Text('6 dias seguidos'), subtitle: Text('Abrir o app todo dia vale 5 pontos')),
              const ListTile(leading: Icon(Icons.quiz_outlined), title: Text('3 quizzes esta semana'), subtitle: Text('12 acertos')),
              const Divider(height: 32),
              FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.share), label: const Text('Compartilhar meu status')),
              const SizedBox(height: 8),
              OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.leaderboard_outlined), label: const Text('Ranking da igreja')),
            ],
          ),
        ),
      ),
      3,
    );

Widget _quiz() => _shell(
      Scaffold(
        appBar: AppBar(title: const Text('Quiz bíblico')),
        body: Builder(
          builder: (context) {
            final scheme = Theme.of(context).colorScheme;
            Widget opt(String t, {bool correct = false, bool wrong = false}) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: correct ? Colors.green.withValues(alpha: 0.18) : wrong ? scheme.errorContainer : scheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      child: Row(children: [Expanded(child: Text(t)), if (correct) const Icon(Icons.check_circle, size: 20), if (wrong) const Icon(Icons.cancel, size: 20)]),
                    ),
                  ),
                );
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text('Pergunta 2 de 5', style: Theme.of(context).textTheme.labelLarge),
                const SizedBox(height: 8),
                const LinearProgressIndicator(value: 0.4),
                const SizedBox(height: 24),
                Text('Quem venceu o gigante Golias com uma funda?', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                opt('Saul'),
                opt('Jônatas', wrong: true),
                opt('Davi', correct: true),
                opt('Samuel'),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Não foi dessa vez. Nenhum ponto perdido.', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        const Text('Leia em 1 Samuel 17:49-50'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () {}, child: const Text('Próxima')),
              ],
            );
          },
        ),
      ),
      2,
    );

Widget _shareCard() => Scaffold(
      appBar: AppBar(title: const Text('Compartilhar versículo')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const VerseCard(verse: _verse, statusLabel: 'Bronze', forExport: true),
              const SizedBox(height: 24),
              SizedBox(width: 360, child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.share), label: const Text('Compartilhar'))),
            ],
          ),
        ),
      ),
    );

void main() {
  setUpAll(_loadFonts);

  final screens = <String, Widget Function()>{
    '01-entrar': () => const SignInPage(),
    '02-criar-conta': () => const SignUpPage(),
    '03-minha-igreja': () => _shell(const ChooseChurchPage(user: _user), 1),
    '04-entrar-com-codigo': () => const JoinChurchPage(user: _user),
    '05-inicio-versiculo': _verseHome,
    '06-card-compartilhar': _shareCard,
    '07-feed-igreja': _feed,
    '08-quiz': _quiz,
    '09-perfil-status': _profile,
    '10-dizimo': () => GivingPage(user: _user, church: _church),
    '11-novo-evento': () => NewEventPage(user: _user, church: _church),
  };

  for (final e in screens.entries) {
    for (final dark in [false, true]) {
      final name = dark ? '${e.key}-escuro' : e.key;
      if (dark && !{'05-inicio-versiculo', '07-feed-igreja', '09-perfil-status'}.contains(e.key)) continue;
      testWidgets(name, (tester) async {
        tester.view.physicalSize = const Size(1080, 2280);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(_app(e.value(), dark: dark));
        await tester.pumpAndSettle();
        await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../docs/prints/$name.png'));
      });
    }
  }
}
