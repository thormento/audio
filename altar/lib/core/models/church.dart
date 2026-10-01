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
    this.trialEndsAt,
    this.logoUrl,
  });

  final String id;
  final String name;
  final String city;
  final String inviteCode;
  final String createdBy;
  final String plan;
  final String planStatus;
  final int memberLimit;
  final DateTime? trialEndsAt;
  final String? logoUrl;

  factory Church.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    return Church(
      id: doc.id,
      name: (data['name'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      inviteCode: (data['inviteCode'] as String?) ?? '',
      createdBy: (data['createdBy'] as String?) ?? '',
      plan: (data['plan'] as String?) ?? 'trial',
      planStatus: (data['planStatus'] as String?) ?? 'active',
      memberLimit: (data['memberLimit'] as num?)?.toInt() ?? 30,
      trialEndsAt: (data['trialEndsAt'] as Timestamp?)?.toDate(),
      logoUrl: data['logoUrl'] as String?,
    );
  }
}
