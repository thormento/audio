import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';

/// Identificador estável do aparelho, usado só para o antifraude simples
/// de indicação. Não é usado para anúncio nem sai do Firestore do app.
class DeviceId {
  DeviceId._();

  static String? _cached;

  static Future<String> get() async {
    if (_cached != null) return _cached!;
    try {
      final info = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        _cached = (await info.androidInfo).id;
      } else if (Platform.isIOS) {
        _cached = (await info.iosInfo).identifierForVendor ?? 'unknown';
      } else {
        _cached = 'unknown';
      }
    } catch (e) {
      debugPrint('deviceId indisponível: $e');
      _cached = 'unknown';
    }
    return _cached!;
  }
}
