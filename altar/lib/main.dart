import 'dart:async';

import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/firebase/firebase_bootstrap.dart';
import 'core/notifications/local_notifications.dart';

Future<void> main() async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    await FirebaseBootstrap.init();
    await LocalNotifications.instance.init();

    // Crashlytics só fora do emulador e em release. Nunca registra valor
    // de dízimo: os erros de pagamento são logados sem o payload.
    if (!kUseEmulator && !kIsWeb && kReleaseMode) {
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true);
    }

    runApp(const AltarApp());
  }, (error, stack) {
    if (!kUseEmulator && !kIsWeb && kReleaseMode) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    } else {
      debugPrint('Erro não tratado: $error\n$stack');
    }
  });
}
