import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/models/app_user.dart';
import '../church_repository.dart';

class JoinChurchPage extends StatefulWidget {
  const JoinChurchPage({super.key, required this.user});

  final AppUser user;

  @override
  State<JoinChurchPage> createState() => _JoinChurchPageState();
}

class _JoinChurchPageState extends State<JoinChurchPage> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final church = await ChurchRepository.instance.joinByCode(
        uid: widget.user.uid,
        rawCode: _code.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bem-vindo à ${church.name}!')),
      );
      Navigator.of(context).popUntil((r) => r.isFirst);
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
      appBar: AppBar(title: const Text('Entrar na igreja')),
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
                      'Peça o código de convite ao pastor ou a quem administra '
                      'o app na sua igreja.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _code,
                      autofocus: true,
                      textCapitalization: TextCapitalization.characters,
                      maxLength: ChurchRepository.codeLength,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp('[A-Za-z0-9]'),
                        ),
                        _UpperCaseFormatter(),
                      ],
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: 6,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                      decoration: const InputDecoration(
                        labelText: 'Código de convite',
                        hintText: 'ABC123',
                        counterText: '',
                      ),
                      validator: (v) => (v == null ||
                              ChurchRepository.normalizeCode(v).length !=
                                  ChurchRepository.codeLength)
                          ? 'O código tem 6 caracteres'
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
                          : const Text('Entrar'),
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

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}
