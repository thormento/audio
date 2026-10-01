# PRD — Altar

Documento de requisitos da v1. A spec de origem é `docs/ROTEIRO.md`. Em caso de conflito, o roteiro vence.

## 1. Problema e proposta

Igrejas pequenas e médias falam com os fiéis por grupos de mensagem espalhados, cobram dízimo por chave Pix passada de boca em boca e não sabem quem confirmou presença. Fiéis querem um versículo diário bonito para compartilhar.

O Altar junta os dois: um canal oficial da igreja (comunicado, agenda, oração, dízimo) e um app diário de versículos com pontos e status.

Receita: mensalidade da igreja e anúncios AdMob apenas no uso do fiel. Dízimo nunca passa pela plataforma.

## 2. Personas

| Persona | Quem é | O que faz no app |
| --- | --- | --- |
| Fiel | Membro da igreja, entra por convite | Lê feed, compartilha versículo, confirma presença, pede oração, contribui, sobe de status |
| Líder | Responsável por ministério | Publica aviso no próprio ministério e vê a escala do grupo (recurso parcial na v1) |
| Pastor / admin da igreja | Dono do tenant | Comunica, agenda, vê dízimos, convida equipe, assina plano |
| Tesoureiro | Cuida do financeiro | Vê contribuições do período e exporta CSV. Não precisa ser o pastor |
| Superadmin da plataforma | Operador do Altar | Vê igrejas, planos e denúncias. Só na fase final. Não vê conteúdo pastoral sem motivo |

Papéis no sistema: `member`, `leader`, `pastor`, `churchAdmin`. Tesoureiro é tratado como papel na fase de dízimo.

## 3. Fluxos principais

### 3.1 Entrada do pastor

1. Cria conta (nome, e-mail/senha ou Google, consentimento da conta).
2. Cria igreja (nome, cidade).
3. Recebe `inviteCode` de 6 caracteres e vira `churchAdmin`.
4. Entra no painel e começa o trial de 14 dias.

### 3.2 Entrada do fiel

1. Cria conta.
2. Digita o código da igreja.
3. Passa a ter `churchId` e `role = member`.
4. Vê o início com o nome da igreja e o versículo do período.

### 3.3 Comunicado e oração

- Pastor ou `churchAdmin` publica aviso. Push via FCM para os membros.
- Fiel lê o feed da própria igreja, do mais novo ao mais antigo.
- Fiel envia pedido de oração. Só o pastor vê e pode marcar como orado. O pedido nunca aparece no feed.

### 3.4 Agenda

- Pastor cria evento: culto, encontro presencial ou online. Online exige URL.
- Fiel vê agenda, confirma presença (um RSVP por usuário) e recebe lembrete local 60 minutos antes.
- Evento passado vai para o fim da lista.

### 3.5 Dízimo e oferta

- Igreja cadastra chave Pix e tipo.
- Fiel informa valor, vê o resumo e recebe o Pix gerado no Mercado Pago (sandbox) com a igreja como destino.
- Status: pendente, pago, expirado. Atualizado por webhook ou consulta.
- Fiel vê só os próprios lançamentos. Tesoureiro, pastor e `churchAdmin` veem o período e exportam CSV.
- Nenhum anúncio nessa tela.

### 3.6 Versículo e compartilhamento

- Três slots por dia: manhã, tarde, noite, segundo o fuso America/Recife.
- Compartilhar gera um card (versículo, referência, status do usuário, marca Altar) e abre o share nativo.
- Cada share vai para `pointsLog`.

### 3.7 Pontos, status, quiz

- Regras de pontos e faixas de status estão no `CLAUDE.md`.
- Perfil mostra troféu, pontos e próximo status, e gera card compartilhável.
- Quiz diário de 5 perguntas, múltipla escolha, referência após a resposta. Rewarded opcional dobra os pontos daquele quiz.
- Ranking da igreja só para quem ligou `statusOptIn`.

### 3.8 Mensalidade

- Planos Trial, Essencial, Comunhão e Missão.
- Checkout Mercado Pago em sandbox.
- Trial vencido sem plano: painel somente leitura. Fiel continua no feed bíblico.
- Encontro online só em Comunhão e Missão.

## 4. Planos

| Plano | Membros ativos | Comunicados / mês | Encontros online | Preço sugerido |
| --- | --- | --- | --- | --- |
| Trial | 30 | 20 | sim, 14 dias | R$ 0 |
| Essencial | 150 | 40 | não | R$ 49 |
| Comunhão | 500 | 120 | sim | R$ 99 |
| Missão | 2.000 | ilimitado | sim + relatório | R$ 199 |

Valores editáveis. Atraso: 7 dias de tolerância, depois somente leitura.

## 5. Telas da v1

Fiel: entrar, criar conta, escolher igreja pelo código, início, feed da igreja, versículo do dia, compartilhar, agenda, detalhe do evento, dízimo, oração, perfil com status, quiz, ranking opt-in, ajustes e privacidade.

Igreja: entrar, criar igreja, assinar plano, painel, novo comunicado, nova agenda, lista de membros, convite (código e QR), dízimos do período, chave Pix, equipe e papéis.

Não desenhar: rede social aberta, stories, vídeo próprio, chat 1:1 ilimitado, loja de produtos.

## 6. Modelo de dados (Firestore)

```text
users/{uid}
  name, photoUrl, phone, createdAt
  points, status, streakDays, lastOpenOn
  consentAds, consentPush, consentAt
  churchId, role

churches/{churchId}
  name, city, logoUrl, pixKey, pixKeyType
  plan, planStatus, trialEndsAt, memberLimit
  inviteCode

churches/{churchId}/members/{uid}
  role, joinedAt, statusOptIn

churches/{churchId}/posts/{postId}
  authorId, title, body, type (aviso|oracao)
  createdAt, audience

churches/{churchId}/events/{eventId}
  title, startsAt, place, onlineUrl, type (culto|encontro|online)
  reminderMinutes

churches/{churchId}/events/{eventId}/rsvp/{uid}
  going, at

churches/{churchId}/gifts/{giftId}
  uid, amountCents, method (pix), status, createdAt, externalId

verses/{verseId}
  slot (manha|tarde|noite), text, reference, imageUrl, activeOn

users/{uid}/pointsLog/{id}
  action, points, at, refId

quizzes/{quizId}
  question, options[], correctIndex, reference

billing/{churchId}
  mpSubscriptionId, status, currentPeriodEnd
```

Coleções acrescentadas na implementação: `inviteCodes/{code}`, `referralCodes/{code}`, `referrals/{uid}`, `deletionRequests/{uid}`, `churches/{id}/giftsAudit/{id}` e `users/{uid}/quizResults/{dia}`. O doc de membro espelha `points`, `status` e `name` para o ranking opt-in. Papel extra: `treasurer`.

Regras de acesso:

- Fiel só lê a própria igreja e o próprio dízimo.
- Dízimo de terceiros só para `pastor`, `churchAdmin` e tesoureiro.
- Versículo do dia é leitura pública para usuário logado.
- Fiel não publica aviso e não lê oração de outro fiel.

## 7. Anúncios

Ver `CLAUDE.md`, seção "Anúncio". Resumo: banner só no feed de versículos, intersticial limitado a 1 a cada 3 shares e nunca no primeiro do dia, rewarded opcional no quiz. Proibido em dízimo, evento, oração, login, cadastro, billing. Sem `consentAds`, nada carrega.

## 8. LGPD e lojas

Ver `CLAUDE.md`, seção "LGPD". Nas lojas, a ficha diz que a doação vai para a igreja, não para o desenvolvedor. Sem promessa de milagre, sem cura garantida, sem incentivo a clique em anúncio.

## 9. Critério de pronto por fase

Critério geral, válido para todas: o fluxo principal abre no emulador; a regra de acesso foi testada; não há anúncio em tela proibida; os textos estão em português; o agente entregou como testar e o que ficou de dívida.

| Fase | Entrega | Pronto quando |
| --- | --- | --- |
| 0 | Spec e esqueleto Flutter | `CLAUDE.md`, `docs/PRD.md`, `docs/FASES.md`, projeto Flutter abre com o nome do app, pastas de features criadas, tema claro/escuro |
| 1 | Conta, igreja e convite | Pastor cria igreja e recebe código; fiel entra pelo código; rules impedem ler outra igreja; teste com dois usuários documentado |
| 2 | Comunicados e oração | Pastor publica, fiel lê o feed; fiel pede oração só visível ao pastor; função de push pronta; testes: fiel não publica, fiel não lê oração alheia |
| 3 | Agenda e encontro online | Culto e encontro online criados; RSVP único por usuário; lembrete local; link abre no detalhe; passado no fim da lista |
| 4 | Dízimo e oferta | Chave Pix da igreja; Pix sandbox gerado; status pendente/pago/expirado; CSV para tesoureiro; teste: fiel A não vê dízimo de B; nenhum ad na tela |
| 5 | Versículo e compartilhar | 21 versículos semeados; slot correto por fuso Recife; card gerado e share nativo aberto; share gravado em `pointsLog` |
| 6 | AdMob | Banner só no feed de versículos; intersticial com limite; rewarded preparado e desligado; `consentAds` respeitado; teste de rotas proibidas falha se banner entrar |
| 7 | Pontos, status e indicação | Regras de pontos exatas; status e troféu no perfil; card de status; ranking opt-in; antifraude por aparelho; usuário sobe de Semente para Bronze |
| 8 | Quiz bíblico | 30 perguntas semeadas; 1 quiz por dia com 5 perguntas; +15 por acerto; rewarded opcional; resultado no perfil sem comparação |
| 9 | Mensalidade da igreja | Planos e limites; checkout sandbox; trial funcional; expirado em somente leitura; encontro online só em Comunhão e Missão; tela de plano |
| 10 | Privacidade, polimento e lojas | Exportar JSON, pedir exclusão, desligar anúncio e ranking; textos legais em `docs/legal/`; bloqueio de ranking abaixo de 16; Crashlytics sem dado de dízimo; ícone e splash; `docs/LOJA.md`; checklist de produção |

## 10. Fora da v1

Chat em tempo real entre fiéis, transmissão de vídeo própria, EBD completa, check-in infantil, multi-campus, nota fiscal, split de Pix, site público da igreja, indicação premiada com dinheiro.
