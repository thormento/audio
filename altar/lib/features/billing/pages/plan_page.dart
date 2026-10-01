import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../church/church_repository.dart';
import '../plans.dart';

/// Plano da igreja: status, renovação e assinatura via Mercado Pago.
/// Rota proibida para anúncio. Nunca pede cartão no app.
class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.user});

  final AppUser user;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> {
  String? _busyPlan;

  Future<void> _subscribe(Church church, Plan plan) async {
    setState(() => _busyPlan = plan.id);
    try {
      final res = await FirebaseFunctions.instanceFor(region: 'southamerica-east1')
          .httpsCallable('createSubscriptionCheckout')
          .call<Map<String, dynamic>>({'churchId': church.id, 'plan': plan.id});
      final url = Map<String, dynamic>.from(res.data)['checkoutUrl'] as String?;
      if (url == null) throw Exception('sem URL de checkout');
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message ?? 'Checkout indisponível (${e.code}).')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Checkout do Mercado Pago indisponível neste ambiente. '
            'Configure MP_ACCESS_TOKEN nas Cloud Functions. ($e)',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busyPlan = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM/yyyy', 'pt_BR');
    return StreamBuilder<Church?>(
      stream: ChurchRepository.instance.watchChurch(widget.user.churchId!),
      builder: (context, snap) {
        final church = snap.data;
        if (church == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final current = Plans.byId(church.plan);
        return Scaffold(
          appBar: AppBar(title: const Text('Plano da igreja')),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: ListTile(
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: Text(ChurchAccess.statusLabel(church)),
                  subtitle: Text(
                    church.plan == 'trial' && church.trialEndsAt != null
                        ? 'Teste até ${fmt.format(church.trialEndsAt!)}'
                        : church.currentPeriodEnd != null
                            ? 'Próxima renovação: ${fmt.format(church.currentPeriodEnd!)}'
                            : 'Sem renovação programada',
                  ),
                ),
              ),
              StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance.collection('billing').doc(church.id).snapshots(),
                builder: (context, b) {
                  final d = b.data?.data();
                  if (d == null) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      'Assinatura Mercado Pago: ${d['status'] ?? '-'} (${d['mpSubscriptionId'] ?? ''})',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              Text('Planos', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final p in Plans.paid)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(p.label, style: Theme.of(context).textTheme.titleLarge),
                            ),
                            Text(p.priceLabel, style: Theme.of(context).textTheme.titleMedium),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(p.highlight),
                        const SizedBox(height: 8),
                        Text(
                          'Até ${p.memberLimit} membros · '
                          '${p.postsPerMonth == null ? 'comunicados ilimitados' : '${p.postsPerMonth} comunicados/mês'} · '
                          '${p.online ? 'encontros online' : 'sem encontros online'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: current?.id == p.id && church.planStatus == 'active' || _busyPlan != null
                              ? null
                              : () => _subscribe(church, p),
                          child: Text(
                            current?.id == p.id && church.planStatus == 'active'
                                ? 'Plano atual'
                                : _busyPlan == p.id
                                    ? 'Abrindo checkout...'
                                    : 'Assinar ${p.label}',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 8),
              Text(
                'O pagamento é feito no checkout do Mercado Pago. O Altar não guarda '
                'dados de cartão. Atraso tem ${Plans.graceDays} dias de tolerância; depois '
                'o painel fica somente leitura e os fiéis continuam no versículo.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        );
      },
    );
  }
}
