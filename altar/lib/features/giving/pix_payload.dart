import 'package:characters/characters.dart';

/// Gera o "Pix copia e cola" estático (BR Code, padrão EMV do Banco Central)
/// com a chave da própria igreja. O dinheiro cai direto na conta da igreja,
/// sem passar pela plataforma.
class PixPayload {
  PixPayload._();

  static String _field(String id, String value) {
    final len = value.length.toString().padLeft(2, '0');
    return '$id$len$value';
  }

  static String _ascii(String s, int max) {
    const from = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
    const to = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
    final buf = StringBuffer();
    for (final ch in s.characters) {
      final i = from.indexOf(ch);
      buf.write(i >= 0 ? to[i] : ch);
    }
    final clean = buf.toString().replaceAll(RegExp(r'[^A-Za-z0-9 .\-]'), '').trim();
    return clean.length > max ? clean.substring(0, max) : clean;
  }

  /// CRC16/CCITT-FALSE, como manda o padrão.
  static int crc16(String data) {
    var crc = 0xFFFF;
    for (final byte in data.codeUnits) {
      crc ^= byte << 8;
      for (var i = 0; i < 8; i++) {
        crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc;
  }

  /// [key] é a chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória).
  /// [txid] só aceita letras e números, até 25 caracteres; `***` = sem id.
  static String build({
    required String key,
    required String merchantName,
    required String merchantCity,
    int? amountCents,
    String txid = '***',
    String? description,
  }) {
    final cleanTxid = txid.replaceAll(RegExp(r'[^A-Za-z0-9*]'), '');
    final merchantInfo = StringBuffer()
      ..write(_field('00', 'br.gov.bcb.pix'))
      ..write(_field('01', key.trim()));
    if (description != null && description.isNotEmpty) {
      merchantInfo.write(_field('02', _ascii(description, 40)));
    }
    final body = StringBuffer()
      ..write(_field('00', '01'))
      ..write(_field('26', merchantInfo.toString()))
      ..write(_field('52', '0000'))
      ..write(_field('53', '986'));
    if (amountCents != null && amountCents > 0) {
      body.write(_field('54', (amountCents / 100).toStringAsFixed(2)));
    }
    body
      ..write(_field('58', 'BR'))
      ..write(_field('59', _ascii(merchantName, 25)))
      ..write(_field('60', _ascii(merchantCity, 15)))
      ..write(_field('62', _field('05', cleanTxid.isEmpty ? '***' : cleanTxid.substring(0, cleanTxid.length > 25 ? 25 : cleanTxid.length))))
      ..write('6304');
    final crc = crc16(body.toString()).toRadixString(16).toUpperCase().padLeft(4, '0');
    return '$body$crc';
  }
}
