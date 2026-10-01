import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../../auth/auth_repository.dart';
import 'create_church_page.dart';
import 'join_church_page.dart';

/// Primeira tela após o cadastro: entrar numa igreja ou criar uma.
class ChooseChurchPage extends StatelessWidget {
  const ChooseChurchPage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Altar'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            onPressed: AuthRepository.instance.signOut,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Olá, ${user.name.split(' ').first}',
                    style: textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Para começar, entre na sua igreja com o código do convite '
                    'ou crie a igreja se você é o pastor.',
                    style: textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 32),
                  FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => JoinChurchPage(user: user),
                      ),
                    ),
                    icon: const Icon(Icons.vpn_key_outlined),
                    label: const Text('Tenho um código de convite'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => CreateChurchPage(user: user),
                      ),
                    ),
                    icon: const Icon(Icons.church_outlined),
                    label: const Text('Sou pastor, quero criar a igreja'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
