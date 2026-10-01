import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `users/{uid}`.
class AppUser {
  const AppUser({
    required this.uid,
    required this.name,
    this.email,
    this.photoUrl,
    this.churchId,
    this.role,
    this.consentAccount = false,
    this.consentAds = false,
    this.consentPush = false,
    this.points = 0,
    this.referralCode,
    this.createdAt,
  });

  final String uid;
  final String name;
  final String? email;
  final String? photoUrl;
  final String? churchId;
  final String? role;
  final bool consentAccount;
  final bool consentAds;
  final bool consentPush;
  final int points;
  final String? referralCode;
  final DateTime? createdAt;

  bool get hasChurch => churchId != null && churchId!.isNotEmpty;

  factory AppUser.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    return AppUser(
      uid: doc.id,
      name: (data['name'] as String?) ?? '',
      email: data['email'] as String?,
      photoUrl: data['photoUrl'] as String?,
      churchId: data['churchId'] as String?,
      role: data['role'] as String?,
      consentAccount: (data['consentAccount'] as bool?) ?? false,
      consentAds: (data['consentAds'] as bool?) ?? false,
      consentPush: (data['consentPush'] as bool?) ?? false,
      points: (data['points'] as num?)?.toInt() ?? 0,
      referralCode: data['referralCode'] as String?,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}
