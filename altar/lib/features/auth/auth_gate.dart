import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_user.dart';
import '../church/pages/choose_church_page.dart';
import '../church/pages/church_home_page.dart';
import 'auth_repository.dart';
import 'pages/sign_in_page.dart';

/// Decide a tela raiz: entrar, escolher igreja ou início da igreja.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = AuthRepository.instance;
    return StreamBuilder<User?>(
      stream: repo.authStateChanges,
      builder: (context, authSnap) {
        if (authSnap.connectionState == ConnectionState.waiting) {
          return const _Loading();
        }
        final user = authSnap.data;
        if (user == null) return const SignInPage();

        return StreamBuilder<AppUser?>(
          stream: repo.watchUser(user.uid),
          builder: (context, userSnap) {
            if (userSnap.connectionState == ConnectionState.waiting) {
              return const _Loading();
            }
            final appUser = userSnap.data;
            if (appUser == null) {
              // Documento ainda sendo criado na primeira entrada.
              return const _Loading();
            }
            if (!appUser.hasChurch) {
              return ChooseChurchPage(user: appUser);
            }
            return ChurchHomePage(user: appUser);
          },
        );
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
