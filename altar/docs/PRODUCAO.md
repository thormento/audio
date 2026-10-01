# Checklist para produção

O que falta entre este repositório e as lojas. Nada disto foi feito; o app roda em sandbox e emuladores.

## Firebase

- [ ] Criar projeto Firebase de produção e rodar `flutterfire configure --out=lib/core/firebase/firebase_options.dart`.
- [ ] Baixar `google-services.json` (Android) e `GoogleService-Info.plist` (iOS). Estão no `.gitignore`.
- [ ] Ativar Auth (e-mail/senha, Google) e cadastrar o SHA-1 e SHA-256 do app no Android.
- [ ] Publicar regras e índices: `cd firebase && npx firebase deploy --only firestore:rules,firestore:indexes`.
- [ ] Publicar as funções: `cd firebase/functions && npm install && cd .. && npx firebase deploy --only functions`. Plano Blaze é necessário.
- [ ] Rodar o seed em produção: `GOOGLE_APPLICATION_CREDENTIALS=... GCLOUD_PROJECT=... node seed.mjs`.
- [ ] Ativar Cloud Messaging e, no iOS, enviar a chave APNs.
- [ ] Ativar Crashlytics no console.

## Mercado Pago

- [ ] Conta Mercado Pago da plataforma com credenciais de produção.
- [ ] `firebase functions:secrets:set MP_ACCESS_TOKEN` com o token de produção (hoje: sandbox).
- [ ] Cadastrar a URL do webhook (`mpWebhook`) no painel do Mercado Pago para pagamentos e assinaturas.
- [ ] Decidir o processo de repasse manual dos Pix que passam pelo Mercado Pago, ou manter só o Pix direto com a chave da igreja (já funciona sem o MP).
- [ ] Revisar os preços dos planos em `lib/features/billing/plans.dart` e `firebase/functions/index.js`.

## AdMob

- [ ] Criar app e blocos no AdMob e trocar os IDs de teste em `lib/features/ads/ads_service.dart`, `android/app/src/main/AndroidManifest.xml` e `ios/Runner/Info.plist`.
- [ ] Decidir se o rewarded liga (`kRewardedAdsEnabled`).
- [ ] Se usar anúncio personalizado no iOS, incluir o prompt App Tracking Transparency e o SDK de consentimento (UMP).

## Apple e Google

- [ ] Conta Apple Developer. Ligar Sign in with Apple: adicionar `sign_in_with_apple`, capability no Xcode e `kAppleSignInEnabled = true`.
- [ ] Conta Google Play Console.
- [ ] Assinatura de release: keystore Android (hoje usa debug) e certificados iOS.
- [ ] Bundle id definitivo (hoje `com.altar.app.altar`) e nome definitivo do app.

## Legal

- [ ] Revisão jurídica de `docs/legal/privacidade.md` e `docs/legal/termos.md` e preenchimento dos campos entre colchetes.
- [ ] Publicar os dois textos numa URL pública e atualizar `PrivacyPage.privacyUrl` e `PrivacyPage.termsUrl`.
- [ ] Responder os formulários de segurança de dados da Play e da App Store conforme `docs/LOJA.md`.

## Conteúdo

- [ ] Revisar os 21 versículos de `assets/seed/verses.json` contra a edição de domínio público escolhida.
- [ ] Revisar as 30 perguntas de `assets/seed/quizzes.json`.
- [ ] Ampliar o seed de versículos além de 21 (o app repete por dia do ano).

## Qualidade

- [ ] Rodar em aparelho Android e iOS reais: share com imagem, notificação local, push, link externo, banner de teste.
- [ ] Teste de regra em produção com dois usuários (fiel não vê dízimo alheio).
- [ ] Screenshots das lojas.
