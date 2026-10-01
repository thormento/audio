import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/gift.dart';
import '../../billing/plans.dart';
import '../giving_repository.dart';

/// Tesoureiro, pastor e administrador veem o período e exportam CSV.
/// Cada abertura grava trilha em `giftsAudit`.
class GiftsReportPage extends StatefulWidget {
  const GiftsReportPage({super.key, required this.user, required this.church});

  final AppUser user;
  final Church church;

  @override
  State<GiftsReportPage> createState() => _GiftsReportPageState();
}

class _GiftsReportPageState extends State<GiftsReportPage> {
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  String get _periodKey => DateFormat('yyyy-MM').format(_month);

  @override
  void initState() {
    super.initState();
    _audit('view');
  }

  void _audit(String action) {
    GivingRepository.instance
        .logReportAccess(
          churchId: widget.church.id,
          uid: widget.user.uid,
          period: _periodKey,
          action: action,
        )
        .catchError((_) {});
  }

  void _shift(int months) {
    setState(() => _month = DateTime(_month.year, _month.month + months));
    _audit('view');
  }

  Future<void> _exportCsv(List<Gift> gifts) async {
    _audit('export');
    final csv = GivingRepository.toCsv(gifts);
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/dizimos-$_periodKey.csv');
    await file.writeAsString(csv);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'text/csv')],
        subject: 'Dízimos ${widget.church.name} $_periodKey',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final from = _month;
    final to = DateTime(_month.year, _month.month + 1);
    final fmtMonth = DateFormat('MMMM yyyy', 'pt_BR');
    final fmt = DateFormat('dd/MM HH:mm', 'pt_BR');
    final money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    final readOnly = !ChurchAccess.canWrite(widget.church);

    return Scaffold(
      appBar: AppBar(title: const Text('Dízimos e ofertas')),
      body: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left)),
              Text(fmtMonth.format(_month), style: Theme.of(context).textTheme.titleMedium),
              IconButton(onPressed: () => _shift(1), icon: const Icon(Icons.chevron_right)),
            ],
          ),
          if (readOnly)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                'Plano somente leitura: lançamentos novos ficam ocultos até regularizar.',
                textAlign: TextAlign.center,
              ),
            ),
          Expanded(
            child: StreamBuilder<List<Gift>>(
              stream: GivingRepository.instance.watchPeriod(widget.church.id, from: from, to: to),
              builder: (context, snap) {
                if (snap.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('Não foi possível carregar. ${snap.error}'),
                    ),
                  );
                }
                if (!snap.hasData) return const Center(child: CircularProgressIndicator());
                final gifts = snap.data!;
                final paid = gifts.where((g) => g.status == Gift.statusPago).toList();
                final total = paid.fold<int>(0, (s, g) => s + g.amountCents);
                return Column(
                  children: [
                    ListTile(
                      title: Text('Total confirmado: ${money.format(total / 100)}'),
                      subtitle: Text('${paid.length} pagos de ${gifts.length} lançamentos'),
                      trailing: IconButton(
                        tooltip: 'Exportar CSV',
                        icon: const Icon(Icons.download_outlined),
                        onPressed: gifts.isEmpty ? null : () => _exportCsv(gifts),
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: gifts.isEmpty
                          ? const Center(child: Text('Nenhum lançamento neste mês.'))
                          : ListView.builder(
                              itemCount: gifts.length,
                              itemBuilder: (context, i) {
                                final g = gifts[i];
                                return ListTile(
                                  leading: Icon(
                                    g.status == Gift.statusPago
                                        ? Icons.check_circle
                                        : g.status == Gift.statusInformado
                                            ? Icons.help_outline
                                            : Icons.schedule,
                                    color: g.status == Gift.statusPago ? Colors.green : null,
                                  ),
                                  title: Text('${g.kindLabel} · ${g.amountLabel}'),
                                  subtitle: Text(
                                    '${g.statusLabel} · ${g.method == Gift.methodPixDireto ? 'Pix direto' : 'Mercado Pago'}'
                                    '${g.createdAt != null ? ' · ${fmt.format(g.createdAt!)}' : ''}',
                                  ),
                                  trailing: g.status == Gift.statusPago
                                      ? null
                                      : PopupMenuButton<String>(
                                          onSelected: (s) => GivingRepository.instance.setStatus(
                                            churchId: widget.church.id,
                                            giftId: g.id,
                                            status: s,
                                            byUid: widget.user.uid,
                                          ),
                                          itemBuilder: (_) => const [
                                            PopupMenuItem(
                                              value: Gift.statusPago,
                                              child: Text('Confirmar recebimento'),
                                            ),
                                            PopupMenuItem(
                                              value: Gift.statusExpirado,
                                              child: Text('Marcar como expirado'),
                                            ),
                                          ],
                                        ),
                                );
                              },
                            ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
