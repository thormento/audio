import 'package:flutter/material.dart';

import '../../../core/models/app_user.dart';
import '../church_repository.dart';

class CreateChurchPage extends StatefulWidget {
  const CreateChurchPage({super.key, required this.user});

  final AppUser user;

  @override
  State<CreateChurchPage> createState() => _CreateChurchPageState();
}

class _CreateChurchPageState extends State<CreateChurchPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _city = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ChurchRepository.instance.createChurch(
        uid: widget.user.uid,
        name: _name.text,
        city: _city.text,
      );
      // O AuthGate troca para o início da igreja ao ver o churchId.
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } on ChurchFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Criar igreja')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Você será o administrador da igreja e receberá um código '
                      'de 6 caracteres para convidar os fiéis. O período de teste '
                      'dura 14 dias.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Nome da igreja',
                      ),
                      validator: (v) => (v == null || v.trim().length < 3)
                          ? 'Informe o nome da igreja'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _city,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Cidade'),
                      validator: (v) => (v == null || v.trim().length < 2)
                          ? 'Informe a cidade'
                          : null,
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Criar igreja'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
