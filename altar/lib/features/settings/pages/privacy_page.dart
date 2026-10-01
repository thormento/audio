import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/app_user.dart';
import '../../ads/ads_service.dart';
import '../../auth/auth_repository.dart';

/// Idade completa em [at].
int ageAt(DateTime birth, DateTime at) {
  var age = at.year - birth.year;
  if (at.month < birth.month || (at.month == birth.month && at.day < birth.day)) age--;
  return age;
}

/// Privacidade (LGPD): exportar dados, pedir exclusão, desligar anúncio e
/// ranking, data de nascimento opcional.
class PrivacyPage extends StatefulWidget {
  const PrivacyPage({super.key, required this.user});

  final AppUser user;

  /// URLs públicas da política e dos termos. Trocar antes de publicar.
  static const String privacyUrl = 'https://altar.app/privacidade';
  static const String termsUrl = 'https://altar.app/termos';

  @override
  State<PrivacyPage> createState() => _PrivacyPageState();
}

class _PrivacyPageState extends State<PrivacyPage> {
  bool _busy = false;

  DocumentReference<Map<String, dynamic>> get _userRef =>
      FirebaseFirestore.instance.collection('users').doc(widget.user.uid);

  Future<void> _export() async {
    setState(() => _busy = true);
    try {
      final db = FirebaseFirestore.instance;
      final user = await _userRef.get();
      final data = <String, dynamic>{
        'exportadoEm': DateTime.now().toIso8601String(),
        'usuario': _clean(user.data()),
        'pontos': (await _userRef.collection('pointsLog').get())
            .docs
            .map((d) => _clean(d.data()))
            .toList(),
        'quizzes': (await _userRef.collection('quizResults').get())
            .docs
            .map((d) => {'dia': d.id, ..._clean(d.data())})
            .toList(),
      };
      if (widget.user.hasChurch) {
        final church = db.collection('churches').doc(widget.user.churchId);
        final member = await church.collection('members').doc(widget.user.uid).get();
        data['membro'] = _clean(member.data());
        final gifts = await church.collection('gifts').where('uid', isEqualTo: widget.user.uid).get();
        data['contribuicoes'] = gifts.docs
            .map((d) => _clean(d.data())..remove('qrCodeBase64'))
            .toList();
        final prayers = await church
            .collection('posts')
            .where('type', isEqualTo: 'oracao')
            .where('authorId', isEqualTo: widget.user.uid)
            .get();
        data['pedidosDeOracao'] = prayers.docs.map((d) => _clean(d.data())).toList();
      }
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/altar-meus-dados.json');
      await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data));
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: 'application/json')], subject: 'Meus dados no Altar'),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível exportar. $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> _clean(Map<String, dynamic>? raw) {
    final out = <String, dynamic>{};
    for (final e in (raw ?? const {}).entries) {
      final v = e.value;
      out[e.key] = v is Timestamp ? v.toDate().toIso8601String() : v;
    }
    out.remove('fcmToken');
    out.remove('deviceId');
    return out;
  }

  Future<void> _requestDeletion() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Apagar minha conta?'),
        content: const Text(
          'Seus dados pessoais, pontos, quizzes e pedidos de oração serão apagados em até 15 dias. '
          'Registros de dízimo ficam na igreja sem o seu nome. Esta ação não pode ser desfeita.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Apagar conta'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await FirebaseFirestore.instance.collection('deletionRequests').doc(widget.user.uid).set({
        'uid': widget.user.uid,
        'requestedAt': FieldValue.serverTimestamp(),
        'status': 'pending',
      });
      await AuthRepository.instance.signOut();
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Não foi possível pedir a exclusão. $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickBirthDate(DateTime? current) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked == null) return;
    final age = ageAt(picked, now);
    if (age < 13) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('O Altar é para maiores de 13 anos.')),
        );
      }
      return;
    }
    final updates = <String, dynamic>{'birthDate': DateFormat('yyyy-MM-dd').format(picked)};
    if (age < 16) updates['statusOptIn'] = false;
    await _userRef.update(updates);
    if (age < 16 && widget.user.hasChurch) {
      await FirebaseFirestore.instance
          .collection('churches')
          .doc(widget.user.churchId)
          .collection('members')
          .doc(widget.user.uid)
          .update({'statusOptIn': false});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacidade')),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: _userRef.snapshots(),
        builder: (context, snap) {
          final data = snap.data?.data() ?? const <String, dynamic>{};
          final consentAds = data['consentAds'] == true;
          final optIn = data['statusOptIn'] == true;
          final birth = data['birthDate'] as String?;
          final birthDate = birth != null ? DateTime.tryParse(birth) : null;
          final under16 = birthDate != null && ageAt(birthDate, DateTime.now()) < 16;
          return ListView(
            children: [
              const ListTile(
                title: Text('Seus dados são seus'),
                subtitle: Text(
                  'Dado religioso é sensível. Você escolhe o que compartilha, pode levar '
                  'tudo em JSON e pode apagar a conta. Dízimo e oferta vão para a igreja, '
                  'não para o Altar.',
                ),
              ),
              SwitchListTile(
                value: consentAds,
                onChanged: (v) async {
                  await _userRef.update({'consentAds': v, 'consentAt': FieldValue.serverTimestamp()});
                  await AdsService.instance.setConsent(v);
                },
                title: const Text('Mostrar anúncios'),
                subtitle: const Text('Desligue quando quiser. Sem anúncio, nada é carregado.'),
              ),
              SwitchListTile(
                value: optIn && !under16,
                onChanged: under16
                    ? null
                    : (v) async {
                        await _userRef.update({'statusOptIn': v});
                        if (widget.user.hasChurch) {
                          await FirebaseFirestore.instance
                              .collection('churches')
                              .doc(widget.user.churchId)
                              .collection('members')
                              .doc(widget.user.uid)
                              .update({'statusOptIn': v, 'name': widget.user.name});
                        }
                      },
                title: const Text('Aparecer no ranking da igreja'),
                subtitle: Text(
                  under16
                      ? 'Menores de 16 anos não entram em ranking.'
                      : 'Mostra nome, status e pontos para a sua igreja.',
                ),
              ),
              ListTile(
                leading: const Icon(Icons.cake_outlined),
                title: const Text('Data de nascimento (opcional)'),
                subtitle: Text(
                  birthDate != null
                      ? DateFormat('dd/MM/yyyy').format(birthDate)
                      : 'Não informada. Usada só para a regra de idade do ranking.',
                ),
                onTap: _busy ? null : () => _pickBirthDate(birthDate),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.download_outlined),
                title: const Text('Exportar meus dados (JSON)'),
                onTap: _busy ? null : _export,
              ),
              ListTile(
                leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
                title: const Text('Pedir exclusão da conta'),
                subtitle: const Text('Concluída em até 15 dias.'),
                onTap: _busy ? null : _requestDeletion,
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.policy_outlined),
                title: const Text('Política de privacidade'),
                onTap: () => launchUrl(Uri.parse(PrivacyPage.privacyUrl), mode: LaunchMode.externalApplication),
              ),
              ListTile(
                leading: const Icon(Icons.gavel_outlined),
                title: const Text('Termos de uso'),
                onTap: () => launchUrl(Uri.parse(PrivacyPage.termsUrl), mode: LaunchMode.externalApplication),
              ),
            ],
          );
        },
      ),
    );
  }
}
