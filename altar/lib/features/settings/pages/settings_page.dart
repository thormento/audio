import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/models/app_user.dart';
import '../../ads/ads_service.dart';
import '../../auth/auth_repository.dart';
import 'privacy_page.dart';

/// Ajustes e consentimentos. Anúncio, notificação e ranking são escolhas
/// separadas, como manda a LGPD para dado sensível.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final db = FirebaseFirestore.instance;
    final userRef = db.collection('users').doc(user.uid);

    return Scaffold(
      appBar: AppBar(title: const Text('Ajustes')),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: userRef.snapshots(),
        builder: (context, snap) {
          final data = snap.data?.data() ?? const <String, dynamic>{};
          final consentAds = data['consentAds'] == true;
          final consentPush = data['consentPush'] == true;
          final optIn = data['statusOptIn'] == true;
          final referralCode = data['referralCode'] as String?;

          Future<void> setOptIn(bool v) async {
            final batch = db.batch();
            batch.update(userRef, {'statusOptIn': v});
            if (user.hasChurch) {
              batch.update(
                db
                    .collection('churches')
                    .doc(user.churchId)
                    .collection('members')
                    .doc(user.uid),
                {
                  'statusOptIn': v,
                  'name': user.name,
                  'points': data['points'] ?? 0,
                  'status': data['status'] ?? 'semente',
                },
              );
            }
            await batch.commit();
          }

          return ListView(
            children: [
              const _Section('Privacidade'),
              SwitchListTile(
                value: consentAds,
                onChanged: (v) async {
                  await userRef.update({
                    'consentAds': v,
                    'consentAt': FieldValue.serverTimestamp(),
                  });
                  await AdsService.instance.setConsent(v);
                },
                title: const Text('Mostrar anúncios'),
                subtitle: const Text(
                  'Anúncios aparecem só no feed de versículos e sustentam o app. '
                  'Nunca em dízimo, oração ou culto.',
                ),
              ),
              SwitchListTile(
                value: consentPush,
                onChanged: (v) => userRef.update({
                  'consentPush': v,
                  'consentAt': FieldValue.serverTimestamp(),
                }),
                title: const Text('Receber notificações'),
                subtitle: const Text('Avisos da igreja, quando ela publicar.'),
              ),
              SwitchListTile(
                value: optIn,
                onChanged: setOptIn,
                title: const Text('Aparecer no ranking da igreja'),
                subtitle: Text(
                  user.hasChurch
                      ? 'Seu nome, status e pontos ficam visíveis para a sua igreja.'
                      : 'Disponível quando você entrar numa igreja.',
                ),
              ),
              const _Section('Indicar amigos'),
              ListTile(
                leading: const Icon(Icons.card_giftcard_outlined),
                title: Text(referralCode ?? '...'),
                subtitle: const Text(
                  'Quem criar conta com seu código te dá 50 pontos.',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.copy),
                  onPressed: referralCode == null
                      ? null
                      : () async {
                          await Clipboard.setData(ClipboardData(text: referralCode));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Código copiado')),
                            );
                          }
                        },
                ),
              ),
              const _Section('Conta'),
              ListTile(
                leading: const Icon(Icons.person_outline),
                title: Text(user.name),
                subtitle: Text(user.email ?? ''),
              ),
              ListTile(
                leading: const Icon(Icons.policy_outlined),
                title: const Text('Privacidade e meus dados'),
                subtitle: const Text('Exportar, apagar conta, política e termos'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => PrivacyPage(user: user),
                  ),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sair'),
                onTap: () async {
                  await AuthRepository.instance.signOut();
                  if (context.mounted) {
                    Navigator.of(context).popUntil((r) => r.isFirst);
                  }
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 4),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.primary,
            ),
      ),
    );
  }
}
