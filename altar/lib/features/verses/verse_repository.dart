import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../core/time/recife_time.dart';
import 'verse.dart';

/// Versículo do período.
///
/// Primeiro tenta `verses` no Firestore com `activeOn` igual ao dia atual e
/// o slot do período. Se não houver, usa o seed embutido em
/// `assets/seed/verses.json`, escolhendo pelo dia do ano. Assim o feed
/// bíblico funciona mesmo sem igreja, sem plano e sem seed no servidor.
class VerseRepository {
  VerseRepository({FirebaseFirestore? db, AssetBundle? bundle})
      : _dbOverride = db,
        _bundle = bundle ?? rootBundle;

  static final VerseRepository instance = VerseRepository();

  final FirebaseFirestore? _dbOverride;
  final AssetBundle _bundle;
  List<Verse>? _bundled;

  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;

  Future<List<Verse>> bundledVerses() async {
    if (_bundled != null) return _bundled!;
    final raw = await _bundle.loadString('assets/seed/verses.json');
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final list = (json['verses'] as List)
        .cast<Map<String, dynamic>>()
        .map(Verse.fromJson)
        .toList();
    _bundled = list;
    return list;
  }

  /// Escolha determinística no seed: mesmo dia, mesmo versículo em todo
  /// aparelho.
  Future<Verse> bundledVerseFor(VerseSlot slot, {DateTime? at}) async {
    final all = await bundledVerses();
    final ofSlot = all.where((v) => v.slot == slot).toList();
    if (ofSlot.isEmpty) {
      throw StateError('Seed sem versículo para o slot ${slot.key}');
    }
    final index = RecifeTime.dayOfYear(at) % ofSlot.length;
    return ofSlot[index];
  }

  Future<Verse> verseFor({DateTime? at, bool useFirestore = true}) async {
    final now = at ?? RecifeTime.now();
    final slot = VerseSlot.forTime(now);
    if (useFirestore) {
      try {
        final q = await _db
            .collection('verses')
            .where('activeOn', isEqualTo: RecifeTime.dayKey(now))
            .where('slot', isEqualTo: slot.key)
            .limit(1)
            .get();
        if (q.docs.isNotEmpty) return Verse.fromDoc(q.docs.first);
      } catch (e) {
        debugPrint('verses no Firestore indisponível, usando seed: $e');
      }
    }
    return bundledVerseFor(slot, at: now);
  }
}
