import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `churches/{churchId}`.
class Church {
  const Church({
    required this.id,
    required this.name,
    required this.city,
    required this.inviteCode,
    required this.createdBy,
    this.plan = 'trial',
    this.planStatus = 'active',
    this.memberLimit = 30,
    this.memberCount = 0,
    this.trialEndsAt,
    this.graceUntil,
    this.currentPeriodEnd,
    this.logoUrl,
    this.pixKey,
    this.pixKeyType,
    this.usage = const {},
  });

  final String id;
  final String name;
  final String city;
  final String inviteCode;
  final String createdBy;
  final String plan;
  final String planStatus;
  final int memberLimit;
  final int memberCount;
  final DateTime? trialEndsAt;
  final DateTime? graceUntil;
  final DateTime? currentPeriodEnd;
  final String? logoUrl;
  final String? pixKey;
  final String? pixKeyType;

  /// Comunicados por mês: `{'2026-10': 3}`.
  final Map<String, int> usage;

  bool get hasPix => pixKey != null && pixKey!.isNotEmpty;

  factory Church.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final rawUsage = data['usage'];
    return Church(
      id: doc.id,
      name: (data['name'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      inviteCode: (data['inviteCode'] as String?) ?? '',
      createdBy: (data['createdBy'] as String?) ?? '',
      plan: (data['plan'] as String?) ?? 'trial',
      planStatus: (data['planStatus'] as String?) ?? 'active',
      memberLimit: (data['memberLimit'] as num?)?.toInt() ?? 30,
      memberCount: (data['memberCount'] as num?)?.toInt() ?? 0,
      trialEndsAt: (data['trialEndsAt'] as Timestamp?)?.toDate(),
      graceUntil: (data['graceUntil'] as Timestamp?)?.toDate(),
      currentPeriodEnd: (data['currentPeriodEnd'] as Timestamp?)?.toDate(),
      logoUrl: data['logoUrl'] as String?,
      pixKey: data['pixKey'] as String?,
      pixKeyType: data['pixKeyType'] as String?,
      usage: rawUsage is Map
          ? rawUsage.map((k, v) => MapEntry(k.toString(), (v as num).toInt()))
          : const {},
    );
  }
}
