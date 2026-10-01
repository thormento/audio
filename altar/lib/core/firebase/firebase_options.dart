import 'package:firebase_core/firebase_core.dart';

/// Opções do Firebase.
///
/// Este arquivo é um placeholder que funciona apenas com o Firebase Emulator
/// Suite (projeto "demo-altar"). Para apontar para um projeto real, rode:
///
/// ```bash
/// dart pub global activate flutterfire_cli
/// flutterfire configure --project=SEU_PROJETO --out=lib/core/firebase/firebase_options.dart
/// ```
///
/// O comando sobrescreve este arquivo com as chaves do projeto. Nunca
/// coloque chaves de produção em commit sem revisar as regras do Firestore.
class DefaultFirebaseOptions {
  DefaultFirebaseOptions._();

  /// Projeto de demonstração aceito pelos emuladores. Qualquer id que comece
  /// com `demo-` nunca toca um projeto real.
  static const String demoProjectId = 'demo-altar';

  static const FirebaseOptions currentPlatform = FirebaseOptions(
    apiKey: 'demo-api-key',
    appId: '1:000000000000:android:0000000000000000',
    messagingSenderId: '000000000000',
    projectId: demoProjectId,
    storageBucket: '$demoProjectId.appspot.com',
  );
}
