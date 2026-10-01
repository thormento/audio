import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/gift.dart';
import '../giving_repository.dart';

/// Dízimo e oferta. Tela sem anúncio, sem banner e sem pré-carregamento.
class GivingPage extends StatefulWidget {
  const GivingPage({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  State<GivingPage> createState() => _GivingPageState();
}

class _GivingPageState extends State<GivingPage> {
  final _amount = TextEditingController();
  String _kind = Gift.kindDizimo;
  bool _busy = false;
  Gift? _gift;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int? get _cents {
    final raw = _amount.text.replaceAll('.', '').replaceAll(',', '.').trim();
    final v = double.tryParse(raw);
    if (v == null) return null;
    return (v * 100).round();
  }

  Future<void> _confirmAndCreate() async {
    final cents = _cents;
    if (cents == null || cents < 100) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe um valor a partir de R\$ 1,00.')),
      );
      return;
    }
    final fmt = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_kind == Gift.kindOferta ? 'Confirmar oferta' : 'Confirmar dízimo'),
        content: Text(
          '${fmt.format(cents / 100)} para ${widget.church.name}.\n\n'
          'O valor vai para a chave Pix da igreja. A plataforma não retém nada.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Gerar Pix')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final gift = await GivingRepository.instance.createGift(
        church: widget.church,
        uid: widget.user.uid,
        kind: _kind,
        amountCents: cents,
      );
      setState(() => _gift = gift);
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
    final gift = _gift;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dízimo e oferta'),
        actions: [
          IconButton(
            tooltip: 'Meus lançamentos',
            icon: const Icon(Icons.history),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                settings: RouteSettings(name: ModalRoute.of(context)?.settings.name),
                builder: (_) => MyGiftsPage(user: widget.user, church: widget.church),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: gift != null
            ? _PixResult(gift: gift, church: widget.church, onDone: () => Navigator.of(context).pop())
            : ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  if (!widget.church.hasPix)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('A igreja ainda não cadastrou a chave Pix. Fale com o pastor.'),
                      ),
                    ),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: Gift.kindDizimo, label: Text('Dízimo')),
                      ButtonSegment(value: Gift.kindOferta, label: Text('Oferta')),
                    ],
                    selected: {_kind},
                    onSelectionChanged: (s) => setState(() => _kind = s.first),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
                    decoration: const InputDecoration(
                      labelText: 'Valor',
                      prefixText: 'R\$ ',
                      hintText: '50,00',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Destino: ${widget.church.name}. Sem cartão, sem taxa da plataforma.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy || !widget.church.hasPix ? null : _confirmAndCreate,
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Continuar'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _PixResult extends StatelessWidget {
  const _PixResult({required this.gift, required this.church, required this.onDone});

  final Gift gift;
  final Church church;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final code = gift.pixCopiaECola ?? '';
    final textTheme = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text('${gift.kindLabel} de ${gift.amountLabel}', style: textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(
          gift.method == Gift.methodPixDireto
              ? 'Pix com a chave da ${church.name}. Cai direto na conta da igreja.'
              : 'Pix gerado no Mercado Pago (sandbox). Repasse manual à igreja.',
          style: textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        if (gift.qrCodeBase64 != null)
          Center(
            child: Image.memory(
              base64Decode(gift.qrCodeBase64!),
              width: 220,
              height: 220,
            ),
          ),
        const SizedBox(height: 16),
        Text('Pix copia e cola', style: textTheme.labelLarge),
        const SizedBox(height: 4),
        SelectableText(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: code));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Código Pix copiado. Cole no app do seu banco.')),
              );
            }
          },
          icon: const Icon(Icons.copy),
          label: const Text('Copiar código Pix'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () async {
            await GivingRepository.instance.markInformed(church.id, gift.id);
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Obrigado! A tesouraria vai conferir.')),
              );
              onDone();
            }
          },
          child: Text(kDebugMode && gift.method == Gift.methodPixMp ? 'Já paguei (debug)' : 'Já paguei'),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: onDone, child: const Text('Pagar depois')),
      ],
    );
  }
}

/// Lançamentos do próprio fiel. Só os dele.
class MyGiftsPage extends StatelessWidget {
  const MyGiftsPage({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM/yyyy HH:mm', 'pt_BR');
    return Scaffold(
      appBar: AppBar(title: const Text('Meus lançamentos')),
      body: StreamBuilder<List<Gift>>(
        stream: GivingRepository.instance.watchMyGifts(church.id, user.uid),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('Erro: ${snap.error}'));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final gifts = snap.data!;
          if (gifts.isEmpty) return const Center(child: Text('Nenhum lançamento ainda.'));
          return ListView.builder(
            itemCount: gifts.length,
            itemBuilder: (context, i) {
              final g = gifts[i];
              return ListTile(
                leading: Icon(
                  g.status == Gift.statusPago ? Icons.check_circle : Icons.schedule,
                  color: g.status == Gift.statusPago ? Colors.green : null,
                ),
                title: Text('${g.kindLabel} · ${g.amountLabel}'),
                subtitle: Text(
                  '${g.statusLabel}${g.createdAt != null ? ' · ${fmt.format(g.createdAt!)}' : ''}',
                ),
              );
            },
          );
        },
      ),
    );
  }
}
