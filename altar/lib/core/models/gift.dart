import 'package:cloud_firestore/cloud_firestore.dart';

/// Documento `churches/{churchId}/gifts/{giftId}`. Dízimo ou oferta.
class Gift {
  const Gift({
    required this.id,
    required this.churchId,
    required this.uid,
    required this.kind,
    required this.amountCents,
    required this.method,
    required this.status,
    this.settlement,
    this.externalId,
    this.pixCopiaECola,
    this.qrCodeBase64,
    this.createdAt,
    this.expiresAt,
  });

  static const String kindDizimo = 'dizimo';
  static const String kindOferta = 'oferta';

  /// `pix_mp`: gerado pelo Mercado Pago (status por webhook, repasse manual).
  /// `pix_direto`: BR Code estático com a chave da igreja (cai direto).
  static const String methodPixMp = 'pix_mp';
  static const String methodPixDireto = 'pix_direto';

  static const String statusPendente = 'pendente';
  static const String statusInformado = 'informado';
  static const String statusPago = 'pago';
  static const String statusExpirado = 'expirado';

  final String id;
  final String churchId;
  final String uid;
  final String kind;
  final int amountCents;
  final String method;
  final String status;
  final String? settlement;
  final String? externalId;
  final String? pixCopiaECola;
  final String? qrCodeBase64;
  final DateTime? createdAt;
  final DateTime? expiresAt;

  String get amountLabel =>
      'R\$ ${(amountCents / 100).toStringAsFixed(2).replaceAll('.', ',')}';

  String get kindLabel => kind == kindOferta ? 'Oferta' : 'Dízimo';

  String get statusLabel {
    switch (status) {
      case statusPago:
        return 'Pago';
      case statusInformado:
        return 'Informado pelo fiel';
      case statusExpirado:
        return 'Expirado';
      default:
        return 'Pendente';
    }
  }

  factory Gift.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? const <String, dynamic>{};
    return Gift(
      id: doc.id,
      churchId: d['churchId'] as String? ?? '',
      uid: d['uid'] as String? ?? '',
      kind: d['kind'] as String? ?? kindDizimo,
      amountCents: (d['amountCents'] as num?)?.toInt() ?? 0,
      method: d['method'] as String? ?? methodPixDireto,
      status: d['status'] as String? ?? statusPendente,
      settlement: d['settlement'] as String?,
      externalId: d['externalId'] as String?,
      pixCopiaECola: d['pixCopiaECola'] as String?,
      qrCodeBase64: d['qrCodeBase64'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate(),
    );
  }
}
