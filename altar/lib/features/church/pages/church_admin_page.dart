import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../app/routes.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/church.dart';
import '../../../core/models/roles.dart';
import '../../billing/pages/plan_page.dart';
import '../../billing/plans.dart';
import '../../feed/pages/prayers_page.dart';
import '../../giving/pages/gifts_report_page.dart';
import '../../giving/pages/pix_settings_page.dart';
import '../../members/pages/members_page.dart';
import '../church_repository.dart';

/// Painel da igreja: convite, membros, orações, dízimos, chave Pix e plano.
class ChurchAdminPage extends StatelessWidget {
  const ChurchAdminPage({super.key, required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final isStaff = Roles.isStaff(user.role);
    final isAdmin = user.role == Roles.churchAdmin;
    return StreamBuilder<Church?>(
      stream: ChurchRepository.instance.watchChurch(user.churchId!),
      builder: (context, snap) {
        final church = snap.data;
        if (church == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final plan = Plans.byId(church.plan);
        final fmt = DateFormat('dd/MM/yyyy', 'pt_BR');
        return Scaffold(
          appBar: AppBar(title: const Text('Painel da igreja')),
          body: ListView(
            children: [
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined),
                title: Text(ChurchAccess.statusLabel(church)),
                subtitle: Text(
                  church.plan == 'trial' && church.trialEndsAt != null
                      ? 'Teste até ${fmt.format(church.trialEndsAt!)}'
                      : church.currentPeriodEnd != null
                          ? 'Renova em ${fmt.format(church.currentPeriodEnd!)}'
                          : 'Escolha um plano para continuar após o teste',
                ),
                trailing: isAdmin ? const Icon(Icons.chevron_right) : null,
                onTap: isAdmin
                    ? () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            settings: const RouteSettings(name: AppRoutes.billing),
                            builder: (_) => PlanPage(user: user),
                          ),
                        )
                    : null,
              ),
              const Divider(),
              if (isStaff) _InviteTile(church: church),
              ListTile(
                leading: const Icon(Icons.people_outline),
                title: const Text('Membros e equipe'),
                subtitle: Text(
                  '${church.memberCount} de ${church.memberLimit} no plano ${plan?.label ?? ''}',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => MembersPage(user: user)),
                ),
              ),
              if (isStaff)
                ListTile(
                  leading: const Icon(Icons.volunteer_activism_outlined),
                  title: const Text('Pedidos de oração'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      settings: const RouteSettings(name: AppRoutes.prayer),
                      builder: (_) => PrayersPage(user: user),
                    ),
                  ),
                ),
              if (Roles.isFinance(user.role))
                ListTile(
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: const Text('Dízimos e ofertas do período'),
                  subtitle: Text(
                    ChurchAccess.canWrite(church)
                        ? 'Relatório e exportação em CSV'
                        : 'Somente leitura até regularizar o plano',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      settings: const RouteSettings(name: AppRoutes.giving),
                      builder: (_) => GiftsReportPage(user: user, church: church),
                    ),
                  ),
                ),
              if (isStaff)
                ListTile(
                  leading: const Icon(Icons.pix),
                  title: const Text('Chave Pix da igreja'),
                  subtitle: Text(
                    church.hasPix
                        ? '${church.pixKeyType ?? ''}: ${church.pixKey}'
                        : 'Não cadastrada. O dízimo depende dela.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      settings: const RouteSettings(name: AppRoutes.giving),
                      builder: (_) => PixSettingsPage(user: user, church: church),
                    ),
                  ),
                ),
              if (isStaff && plan?.postsPerMonth != null)
                ListTile(
                  leading: const Icon(Icons.campaign_outlined),
                  title: const Text('Comunicados este mês'),
                  subtitle: Text(
                    '${ChurchAccess.postsThisMonth(church)} de ${plan!.postsPerMonth}',
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _InviteTile extends StatelessWidget {
  const _InviteTile({required this.church});

  final Church church;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.vpn_key_outlined),
      title: const Text('Código de convite'),
      subtitle: Text(
        church.inviteCode,
        style: const TextStyle(fontSize: 22, letterSpacing: 4, fontWeight: FontWeight.w700),
      ),
      trailing: IconButton(
        tooltip: 'Copiar',
        icon: const Icon(Icons.copy),
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: church.inviteCode));
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Código copiado')),
            );
          }
        },
      ),
    );
  }
}
