import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'firebase_options.dart';

/// Liga o app aos emuladores locais quando rodado com
/// `--dart-define=USE_EMULATOR=true`.
const bool kUseEmulator = bool.fromEnvironment('USE_EMULATOR');

/// Host dos emuladores. No emulador Android use `10.0.2.2`; no simulador
/// iOS e no desktop use `localhost`.
const String kEmulatorHost = String.fromEnvironment(
  'EMULATOR_HOST',
  defaultValue: 'localhost',
);

class FirebaseBootstrap {
  FirebaseBootstrap._();

  static Future<void> init() async {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

    if (kUseEmulator) {
      await FirebaseAuth.instance.useAuthEmulator(kEmulatorHost, 9099);
      FirebaseFirestore.instance.useFirestoreEmulator(kEmulatorHost, 8080);
      debugPrint('Altar: usando Firebase Emulator em $kEmulatorHost');
    }
  }
}
