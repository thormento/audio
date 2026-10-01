import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../giving_repository.dart';

/// Igreja cadastra a chave Pix. Dado da igreja, não do fiel.
class PixSettingsPage extends StatefulWidget {
  const PixSettingsPage({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  State<PixSettingsPage> createState() => _PixSettingsPageState();
}

class _PixSettingsPageState extends State<PixSettingsPage> {
  static const types = {
    'cpf': 'CPF',
    'cnpj': 'CNPJ',
    'email': 'E-mail',
    'telefone': 'Telefone',
    'aleatoria': 'Chave aleatória',
  };

  late final _key = TextEditingController(text: widget.church.pixKey ?? '');
  late String _type = widget.church.pixKeyType ?? 'cnpj';
  bool _busy = false;

  @override
  void dispose() {
    _key.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await GivingRepository.instance.savePixKey(
        churchId: widget.church.id,
        pixKey: _key.text,
        pixKeyType: _type,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chave Pix salva')),
      );
      Navigator.of(context).pop();
    } on GivingFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chave Pix da igreja')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            'O dízimo e a oferta dos fiéis vão para esta chave. Use a conta da igreja, '
            'nunca a de uma pessoa.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Tipo da chave'),
            items: [
              for (final e in types.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _key,
            decoration: const InputDecoration(labelText: 'Chave Pix'),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
  }
}
