# Fase 1 — Conta, igreja e convite

## O que ficou pronto

- Firebase Auth com e-mail/senha e Google. Apple preparado e desligado (`kAppleSignInEnabled`).
- Cadastro pede nome e consentimento da conta. Não pede CPF; as regras recusam o campo.
- Pastor cria igreja (nome, cidade), recebe `inviteCode` de 6 caracteres e vira `churchAdmin`. Trial de 14 dias já gravado na igreja.
- Fiel entra pelo código e vira `member`, com `churchId` e `role` em `users/{uid}` e o papel autoritativo em `churches/{id}/members/{uid}`.
- `inviteCodes/{code}` aponta para a igreja. Isso deixa o fiel validar o código sem ler a coleção `churches`.
- Regras do Firestore: usuário só lê a própria igreja e os membros dela; não lista igrejas nem códigos; não se promove; não cria igreja em nome de outro.
- Telas: entrar, criar conta, escolher (código ou criar igreja), criar igreja, entrar com código, início vazio com nome da igreja, papel e, para a equipe, o código com botão de copiar e contagem de membros.
- Código inválido, igreja inexistente e código desatualizado têm mensagem própria.

## Como testar com dois usuários

1. Suba os emuladores: `cd firebase && npm install && npm run emulators`.
2. Rode o app: `flutter run --dart-define=USE_EMULATOR=true --dart-define=EMULATOR_HOST=10.0.2.2` (Android) ou sem `EMULATOR_HOST` (iOS/desktop).
3. **Pastor:** toque em "Criar conta", informe nome, e-mail `pastor@teste.com`, senha `123456`, aceite o consentimento. Na tela seguinte toque em "Sou pastor, quero criar a igreja", informe nome e cidade. O início mostra a igreja, o chip "Administrador" e o código de 6 caracteres. Copie o código.
4. Saia pelo ícone no canto superior direito.
5. **Fiel:** crie outra conta (`fiel@teste.com`). Toque em "Tenho um código de convite" e digite o código. O início mostra a igreja com o chip "Membro" e sem o card do código.
6. **Código inválido:** repita com `ZZZZZZ`. Aparece "Código inválido. Confira com a sua igreja."
7. **Igreja inexistente:** no painel do emulador (http://localhost:4000/firestore) apague o documento da igreja e tente entrar com o código antigo. Aparece "Igreja não encontrada ou código desatualizado." Quem já estava dentro vê a tela "Não encontramos sua igreja".
8. No painel do emulador confira `users/{uid}`, `churches/{id}`, `churches/{id}/members/{uid}` e `inviteCodes/{code}`.

Para testar as regras sem abrir o app: `cd firebase && npm test`. São 13 casos, incluindo "fiel não lê outra igreja nem seus membros" e "fiel não se promove sozinho".

## Dívidas e limitações

- Google Sign-In só funciona com projeto Firebase real e `google-services.json` / `GoogleService-Info.plist` configurados. Nos emuladores, use e-mail/senha.
- Apple Sign-In desligado: falta conta Apple Developer e o pacote `sign_in_with_apple`.
- `lib/core/firebase/firebase_options.dart` é um placeholder para os emuladores. Substituir com `flutterfire configure` antes de qualquer build para aparelho com projeto real.
- Convite por QR fica para quando o painel da igreja existir (fase 2 em diante).
- O limite de membros do plano (30 no trial) é exibido, mas ainda não bloqueia entrada. Entra na fase 9.
- O doc de membro guarda `inviteCode` além dos campos do roteiro. É o que permite às regras validar o código no servidor.
