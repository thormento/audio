import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/device/device_id.dart';
import '../../core/models/app_user.dart';
import '../church/church_repository.dart';

/// Apple Sign-In fica preparado mas desligado até existir conta Apple
/// Developer configurada. Ligar aqui e adicionar o pacote `sign_in_with_apple`.
const bool kAppleSignInEnabled = false;

/// Erro de autenticação já com mensagem em português.
class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

class AuthRepository {
  AuthRepository({FirebaseAuth? auth, FirebaseFirestore? db})
      : _auth = auth ?? FirebaseAuth.instance,
        _db = db ?? FirebaseFirestore.instance;

  static final AuthRepository instance = AuthRepository();

  final FirebaseAuth _auth;
  final FirebaseFirestore _db;
  bool _googleInitialized = false;

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  DocumentReference<Map<String, dynamic>> _userRef(String uid) =>
      _db.collection('users').doc(uid);

  Stream<AppUser?> watchUser(String uid) {
    return _userRef(uid).snapshots().map(
          (doc) => doc.exists ? AppUser.fromDoc(doc) : null,
        );
  }

  Future<void> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      final cred = await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      await _ensureUserDoc(cred.user!, consentAccount: true);
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_message(e));
    }
  }

  /// Cadastro com nome e consentimento da conta. Não pede CPF.
  Future<void> signUpWithEmail({
    required String name,
    required String email,
    required String password,
    required bool consentAccount,
    String? referralCode,
  }) async {
    if (!consentAccount) {
      throw const AuthFailure(
        'É preciso aceitar os termos para criar a conta.',
      );
    }
    try {
      final cred = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      final user = cred.user!;
      await user.updateDisplayName(name.trim());
      await _ensureUserDoc(
        user,
        name: name.trim(),
        consentAccount: true,
        referralCode: referralCode,
      );
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_message(e));
    }
  }

  Future<void> signInWithGoogle() async {
    try {
      final signIn = GoogleSignIn.instance;
      if (!_googleInitialized) {
        await signIn.initialize();
        _googleInitialized = true;
      }
      final account = await signIn.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) {
        throw const AuthFailure('Não foi possível entrar com o Google.');
      }
      final credential = GoogleAuthProvider.credential(idToken: idToken);
      final cred = await _auth.signInWithCredential(credential);
      await _ensureUserDoc(
        cred.user!,
        name: account.displayName ?? cred.user!.displayName,
        consentAccount: true,
      );
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      throw AuthFailure('Google: ${e.description ?? e.code.name}');
    } on FirebaseAuthException catch (e) {
      throw AuthFailure(_message(e));
    }
  }

  Future<void> signInWithApple() async {
    if (!kAppleSignInEnabled) {
      throw const AuthFailure('Entrar com Apple ainda não está disponível.');
    }
    throw UnimplementedError('Adicionar sign_in_with_apple quando houver conta Apple.');
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }

  /// Cria `users/{uid}` na primeira entrada, com código de indicação
  /// próprio e deviceId para o antifraude. Não sobrescreve se já existir.
  Future<void> _ensureUserDoc(
    User user, {
    String? name,
    required bool consentAccount,
    String? referralCode,
  }) async {
    final ref = _userRef(user.uid);
    final snap = await ref.get();
    if (snap.exists) return;

    final deviceId = await DeviceId.get();
    final myCode = await _reserveReferralCode(user.uid);
    final referrerUid = await _lookupReferrer(referralCode, user.uid);

    final batch = _db.batch();
    batch.set(ref, {
      'name': name ?? user.displayName ?? user.email?.split('@').first ?? '',
      'email': user.email,
      'photoUrl': user.photoURL,
      'consentAccount': consentAccount,
      'consentAt': FieldValue.serverTimestamp(),
      'consentAds': false,
      'consentPush': false,
      'statusOptIn': false,
      'points': 0,
      'status': 'semente',
      'streakDays': 0,
      'referralCode': myCode,
      'deviceId': deviceId,
      'createdAt': FieldValue.serverTimestamp(),
    });
    if (referrerUid != null) {
      batch.set(_db.collection('referrals').doc(user.uid), {
        'referrerUid': referrerUid,
        'code': ChurchRepository.normalizeCode(referralCode!),
        'deviceId': deviceId,
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /// Gera um código de indicação único em `referralCodes/{code}`.
  Future<String> _reserveReferralCode(String uid) async {
    final gen = ChurchRepository.instance;
    for (var i = 0; i < 5; i++) {
      final code = gen.generateCode();
      final ref = _db.collection('referralCodes').doc(code);
      final ok = await _db.runTransaction<bool>((tx) async {
        final snap = await tx.get(ref);
        if (snap.exists) return false;
        tx.set(ref, {'uid': uid, 'createdAt': FieldValue.serverTimestamp()});
        return true;
      });
      if (ok) return code;
    }
    throw const AuthFailure('Não foi possível gerar seu código de indicação.');
  }

  /// Resolve o código digitado no cadastro. Código inválido é ignorado
  /// em silêncio: não deve impedir a conta de ser criada.
  Future<String?> _lookupReferrer(String? raw, String myUid) async {
    if (raw == null || raw.trim().isEmpty) return null;
    final code = ChurchRepository.normalizeCode(raw);
    if (code.length != ChurchRepository.codeLength) return null;
    try {
      final snap = await _db.collection('referralCodes').doc(code).get();
      final uid = snap.data()?['uid'] as String?;
      if (uid == null || uid == myUid) return null;
      return uid;
    } catch (_) {
      return null;
    }
  }

  String _message(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-email':
        return 'E-mail inválido.';
      case 'user-disabled':
        return 'Esta conta foi desativada.';
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'E-mail ou senha incorretos.';
      case 'email-already-in-use':
        return 'Já existe uma conta com este e-mail.';
      case 'weak-password':
        return 'A senha precisa ter pelo menos 6 caracteres.';
      case 'network-request-failed':
        return 'Sem conexão. Tente novamente.';
      case 'too-many-requests':
        return 'Muitas tentativas. Aguarde um pouco.';
      default:
        return 'Não foi possível entrar (${e.code}).';
    }
  }
}
