import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../models/app_user.dart';

/// Registra o token FCM e assina o tópico da igreja quando o fiel consentiu
/// notificações. A Cloud Function `notifyNewPost` envia para o tópico.
class MessagingService {
  MessagingService._();

  static final MessagingService instance = MessagingService._();

  String? _topic;

  static String topicFor(String churchId) => 'church_$churchId';

  Future<void> sync(AppUser user) async {
    if (kIsWeb) return;
    final messaging = FirebaseMessaging.instance;
    try {
      if (!user.consentPush) {
        if (_topic != null) {
          await messaging.unsubscribeFromTopic(_topic!);
          _topic = null;
        }
        return;
      }
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await messaging.getToken();
      if (token != null) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(user.uid)
            .update({'fcmToken': token, 'fcmTokenAt': FieldValue.serverTimestamp()});
      }

      final wanted = user.hasChurch ? topicFor(user.churchId!) : null;
      if (_topic != wanted) {
        if (_topic != null) await messaging.unsubscribeFromTopic(_topic!);
        if (wanted != null) await messaging.subscribeToTopic(wanted);
        _topic = wanted;
      }
    } catch (e) {
      // No emulador não há FCM. A função fica pronta para o aparelho real.
      debugPrint('FCM indisponível: $e');
    }
  }
}
