# Altar

App para igrejas com duas receitas: mensalidade da igreja e anúncios (AdMob) no uso do fiel. A igreja comunica, agenda, recebe dízimo via Pix na própria chave. O fiel lê e compartilha versículos, confirma presença, pede oração, contribui e sobe de status.

Nome provisório. Trocar antes de publicar.

## Documentos

- `CLAUDE.md`: regras permanentes do projeto. Leia antes de qualquer sessão.
- `docs/ROTEIRO.md`: spec completa e prompts de cada fase.
- `docs/PRD.md`: personas, fluxos, telas, modelo Firestore e critério de pronto.
- `docs/FASES.md`: lista das fases e a fase atual.

## Como rodar

Requisitos: Flutter 3.x estável (testado com 3.47), Android Studio ou Xcode com um emulador configurado, Node 18+ e Java 17+ para o Firebase Emulator Suite.

### Com os emuladores do Firebase (recomendado para desenvolver)

```bash
cd firebase && npm install && npm run emulators   # terminal 1
flutter pub get
flutter run --dart-define=USE_EMULATOR=true --dart-define=EMULATOR_HOST=10.0.2.2   # emulador Android
flutter run --dart-define=USE_EMULATOR=true                                        # simulador iOS ou desktop
```

O painel dos emuladores fica em http://localhost:4000. Nenhum projeto Firebase real é necessário: o app usa o projeto `demo-altar`.

### Com um projeto Firebase real

```bash
dart pub global activate flutterfire_cli
flutterfire configure --project=SEU_PROJETO --out=lib/core/firebase/firebase_options.dart
```

Depois publique as regras: `cd firebase && npx firebase deploy --only firestore:rules`. Para "Entrar com Google" funcionar fora do emulador, adicione o `google-services.json` (Android) e o `GoogleService-Info.plist` (iOS) gerados pelo console e cadastre o SHA-1 do app no Firebase.

### Testes

```bash
flutter analyze
flutter test                 # testes de widget e unidade
cd firebase && npm test      # regras do Firestore no emulador
```

## Estrutura

```text
lib/
  main.dart            entrada, inicializa o Firebase
  app/
    app.dart           MaterialApp
    theme/             tema claro e escuro
  core/
    firebase/          opções e ligação com os emuladores
    models/            AppUser, Church, Roles
  features/
    auth/  church/  members/  feed/  events/  giving/
    verses/  gamification/  ads/  billing/  settings/
```

Cada feature é uma pasta própria. Todo documento de negócio carrega `churchId`. As regras do Firestore ficam em `firebase/firestore.rules`, com testes em `firebase/test/`.

## Ordem das fases

| Fase | Entrega | Não misturar com |
| --- | --- | --- |
| 0 | Spec e projeto Flutter | Firebase de produto |
| 1 | Conta, igreja, convite | Aviso e pagamento |
| 2 | Comunicado e oração | Agenda |
| 3 | Agenda e link online | Dízimo |
| 4 | Pix da igreja | Anúncio |
| 5 | Versículo e share | AdMob |
| 6 | AdMob no lugar certo | Pontos |
| 7 | Status e indicação | Quiz |
| 8 | Quiz | Mensalidade |
| 9 | Plano da igreja | Loja |
| 10 | LGPD e ficha das lojas | Feature nova |

Uma fase por sessão. Para começar uma sessão, cole o prompt da fase em `docs/ROTEIRO.md` e termine com: "Siga o CLAUDE.md e o docs/ROTEIRO.md. Não avance para a próxima fase. Ao terminar, liste o que ficou pronto, o que falta e como testar."
