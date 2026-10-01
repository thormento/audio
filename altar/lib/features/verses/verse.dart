import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/time/recife_time.dart';

/// Documento `verses/{verseId}` ou item do seed embutido.
class Verse {
  const Verse({
    required this.id,
    required this.slot,
    required this.text,
    required this.reference,
    this.imageUrl,
    this.activeOn,
  });

  final String id;
  final VerseSlot slot;
  final String text;
  final String reference;
  final String? imageUrl;
  final String? activeOn;

  factory Verse.fromJson(Map<String, dynamic> json, {String? id}) {
    return Verse(
      id: id ?? (json['id'] as String? ?? ''),
      slot: VerseSlot.fromKey(json['slot'] as String? ?? 'manha'),
      text: json['text'] as String? ?? '',
      reference: json['reference'] as String? ?? '',
      imageUrl: json['imageUrl'] as String?,
      activeOn: json['activeOn'] as String?,
    );
  }

  factory Verse.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      Verse.fromJson(doc.data() ?? const {}, id: doc.id);
}
