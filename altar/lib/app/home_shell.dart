import 'package:flutter/material.dart';

import '../core/messaging/messaging_service.dart';
import '../core/models/app_user.dart';
import '../features/ads/ads_service.dart';
import '../features/church/pages/choose_church_page.dart';
import '../features/church/pages/church_home_page.dart';
import '../features/gamification/pages/profile_page.dart';
import '../features/gamification/points_service.dart';
import '../features/gamification/quiz/quiz_page.dart';
import '../features/verses/pages/verse_home_page.dart';

/// Abas do fiel: Início (versículo), Igreja, Quiz e Perfil.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.user});

  final AppUser user;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _onOpen();
  }

  @override
  void didUpdateWidget(covariant HomeShell old) {
    super.didUpdateWidget(old);
    if (old.user.consentAds != widget.user.consentAds) {
      AdsService.instance.setConsent(widget.user.consentAds);
    }
    if (old.user.consentPush != widget.user.consentPush ||
        old.user.churchId != widget.user.churchId) {
      MessagingService.instance.sync(widget.user);
    }
  }

  Future<void> _onOpen() async {
    AdsService.instance.setConsent(widget.user.consentAds);
    MessagingService.instance.sync(widget.user);
    try {
      final awarded = await PointsService.instance.recordAppOpen(widget.user.uid);
      final credited =
          await PointsService.instance.processReferrals(widget.user.uid);
      if (!mounted) return;
      if (awarded) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bem-vindo de volta! +5 pontos')),
        );
      }
      if (credited > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '$credited ${credited == 1 ? 'indicação confirmada' : 'indicações confirmadas'}: +${credited * 50} pontos',
            ),
          ),
        );
      }
    } catch (e) {
      debugPrint('Pontos de abertura falharam: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;
    final pages = [
      VerseHomePage(user: user),
      user.hasChurch ? ChurchHomePage(user: user) : ChooseChurchPage(user: user),
      QuizPage(user: user),
      ProfilePage(user: user),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'Início',
          ),
          NavigationDestination(
            icon: Icon(Icons.church_outlined),
            selectedIcon: Icon(Icons.church),
            label: 'Igreja',
          ),
          NavigationDestination(
            icon: Icon(Icons.quiz_outlined),
            selectedIcon: Icon(Icons.quiz),
            label: 'Quiz',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}
