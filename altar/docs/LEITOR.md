# App do leitor — o que ficou pronto e como testar

Entrega da primeira versão voltada ao fiel: versículo do dia, compartilhar, anúncio no lugar certo, pontos, status, indicação e quiz. Corresponde às fases 5, 6, 7 e 8 do `docs/ROTEIRO.md`, feitas antes das fases da igreja por decisão de produto.

## O que ficou pronto

**Entrada sem igreja.** Depois do cadastro o app abre direto nas abas Início, Igreja, Quiz e Perfil. A aba Igreja oferece entrar com código ou criar igreja, mas nada do leitor depende disso.

**Versículo do dia (fase 5).** Três slots por dia no fuso America/Recife: manhã (5h às 11h59), tarde (12h às 17h59), noite. Seed de 21 versículos em `assets/seed/verses.json`, texto de Almeida 1911 (domínio público), 7 por slot. O app tenta `verses` no Firestore com `activeOn` do dia e cai no seed embutido se não houver. Botão compartilhar abre uma pré-visualização do card (versículo, referência, status do usuário se tiver pontos, marca Altar) e o share nativo com imagem e texto.

**AdMob (fase 6).** `google_mobile_ads` com IDs de teste do Google no Android e iOS. Banner só no feed de versículos, abaixo do card. Intersticial no máximo 1 a cada 3 compartilhamentos e nunca no primeiro do dia, decidido na tela do versículo. Rewarded preparado e desligado por `kRewardedAdsEnabled`. Sem `consentAds`, o SDK nem inicializa. Rotas proibidas em `AdPolicy.forbiddenRoutes` (login, cadastro, dízimo, detalhe de evento, oração, plano); `AdBanner` falha em debug se entrar numa delas e há teste cobrindo isso.

**Pontos e status (fase 7).** Abrir no dia +5 (com sequência de dias), compartilhar +10 até 3 por dia, indicação +50, presença +10 por evento (método pronto para a agenda), quiz +15 por acerto. Status Semente, Bronze, Prata, Ouro, Diamante nos limites do roteiro, sem zerar. Perfil com troféu, pontos, próximo status, sequência e quizzes da semana. Card compartilhável "Meu status no Altar é Ouro". Ranking só da igreja e só para quem ligou "Aparecer no ranking". Código de indicação próprio, separado do código da igreja, informado opcionalmente no cadastro. Antifraude: mesmo `deviceId` não conta.

**Quiz (fase 8).** 30 perguntas em `assets/seed/quizzes.json`, com referência exibida depois de cada resposta. 5 por dia, sorteadas pelo dia para todo mundo responder as mesmas. Erro não tira ponto. Oferta de dobrar os pontos com rewarded só aparece com `consentAds` ligado e o rewarded habilitado. Resultado fica em `users/{uid}/quizResults/{dia}` e aparece no perfil como "quizzes esta semana", sem comparação com outros.

**Ajustes.** Consentimentos separados para anúncio, notificação e ranking. Código de indicação com botão de copiar. Sair.

**Regras e seed.** `firebase/firestore.rules` cobre pontos (só sobem), log de pontos (só o dono, só acrescenta), quiz do dia, indicação (quem indicou credita, o indicado não), versículos e quizzes (leitura logada, escrita fechada). `firebase/seed.mjs` popula `verses` e `quizzes`.

## Como testar

1. Suba os emuladores e popule: `cd firebase && npm install && npm run emulators` e, noutro terminal, `npm run seed`.
2. Rode o app: `flutter run --dart-define=USE_EMULATOR=true --dart-define=EMULATOR_HOST=10.0.2.2` (Android) ou sem `EMULATOR_HOST` (iOS/desktop).
3. **Cadastro e abertura.** Crie uma conta. Aparece "Bem-vindo de volta! +5 pontos". Perfil mostra Semente com 5 pontos.
4. **Versículo.** A aba Início mostra "Bom dia", "Boa tarde" ou "Boa noite" conforme a hora em Recife. Puxe para atualizar.
5. **Compartilhar.** Toque em Compartilhar, veja o card e confirme no share nativo. Volta com "+10 pontos". Repita 3 vezes: a quarta diz que os pontos de hoje já foram contados. Com anúncios ligados nos ajustes, o terceiro compartilhamento mostra o intersticial de teste.
6. **Anúncio.** Nos ajustes, ligue "Mostrar anúncios". O banner de teste aparece abaixo do card no Início. Confira que não aparece no login, cadastro, perfil ou quiz.
7. **Quiz.** Responda as 5 perguntas. A referência aparece após cada resposta. No fim, +15 por acerto. Abrir de novo mostra "Quiz de hoje feito".
8. **Indicação.** No perfil, abra Ajustes e copie o código de indicação. Saia, crie outra conta informando o código. Volte à primeira conta: ao abrir, "1 indicação confirmada: +50 pontos". No emulador Android os dois usuários estão no mesmo aparelho, então a indicação é marcada como `rejected_same_device` e não dá pontos. Para ver o crédito, altere o `deviceId` de um dos usuários no painel do emulador antes de abrir a conta de quem indicou.
9. **Semente para Bronze.** 5 (abrir) + 30 (3 shares) + 50 (indicação) + 15 (um acerto no quiz) = 100 pontos. O perfil troca para Bronze.
10. **Ranking.** Entre numa igreja pela aba Igreja, ligue "Aparecer no ranking" nos ajustes e abra o ranking no perfil.

Testes automáticos:

```bash
flutter test                 # 18 testes: rotas proibidas, intersticial, status, fuso, quiz, seed
cd firebase && npm test      # 20 testes de regras no emulador
```

## Dívidas e limitações

- Pontos são somados no cliente com regras que só garantem que nunca diminuem. Um Cloud Function para validar limites diários entra quando o backend ganhar funções (fase da igreja).
- Texto dos versículos foi digitado a partir da Almeida 1911 e precisa de revisão contra a edição impressa antes de publicar.
- Rewarded está desligado. Ligar `kRewardedAdsEnabled` quando o produto decidir, sem mudar a regra de que é opcional.
- Google Sign-In e Apple seguem como na fase 1: dependem de projeto real e conta Apple.
- Share em desktop e web não gera imagem; o fluxo foi feito para Android e iOS.
- Rotas proibidas de dízimo, evento, oração e plano existem só como nomes. As telas entram nas fases da igreja e devem ser empurradas com esses nomes.
- O limite de 16 anos para ranking e a exportação/exclusão de dados entram na fase de privacidade.
