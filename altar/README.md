# Altar

App para igrejas com duas receitas: mensalidade da igreja e anúncios (AdMob) no uso do fiel. A igreja comunica, agenda, recebe dízimo via Pix na própria chave. O fiel lê e compartilha versículos, confirma presença, pede oração, contribui e sobe de status.

Nome provisório. Trocar antes de publicar.

## Documentos

- `CLAUDE.md`: regras permanentes do projeto. Leia antes de qualquer sessão.
- `docs/ROTEIRO.md`: spec completa e prompts de cada fase.
- `docs/PRD.md`: personas, fluxos, telas, modelo Firestore e critério de pronto.
- `docs/FASES.md`: lista das fases e a fase atual.

## Como rodar

Requisitos: Flutter 3.x estável (testado com 3.47), Android Studio ou Xcode com um emulador configurado.

```bash
flutter pub get
flutter run
```

Testes e análise estática:

```bash
flutter analyze
flutter test
```

Na Fase 0 o app abre apenas com o nome Altar. Não há Firebase ainda.

## Estrutura

```text
lib/
  main.dart            entrada
  app/
    app.dart           MaterialApp e tela inicial
    theme/             tema claro e escuro
  features/
    auth/  church/  members/  feed/  events/  giving/
    verses/  gamification/  ads/  billing/  settings/
```

Cada feature é uma pasta própria. Todo documento de negócio carrega `churchId`.

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
