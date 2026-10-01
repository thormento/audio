# Altar — Etapas completas para o Cloud Code

App para igrejas com duas receitas: mensalidade da igreja e anúncios (AdMob) no uso do fiel. Este arquivo é a spec e o roteiro de implementação. Cole uma fase por sessão. Não peça o app inteiro num único prompt.

Nome provisório: **Altar**. Troque antes de publicar.

---

## 1. Como importar no Cloud Code

“Cloud Code” neste roteiro significa o agente de código que lê a pasta e executa (Claude Code, Gemini no Google Cloud Code ou Antigravity). Os três aceitam o mesmo texto.

1. Crie uma pasta vazia, por exemplo `altar`.
2. Copie este arquivo para `docs/ROTEIRO.md`.
3. Abra o agente nessa pasta.
4. Cole o prompt da **Fase 0**. Ele deve gerar `CLAUDE.md`, `docs/PRD.md` e o esqueleto.
5. Nas sessões seguintes, cole só o prompt da fase atual e termine com: “Siga o CLAUDE.md e o docs/ROTEIRO.md. Não avance para a próxima fase. Ao terminar, liste o que ficou pronto, o que falta e como testar.”
6. Só passe de fase quando o fluxo principal da fase atual abrir no emulador ou no aparelho.

Regra de ouro: uma fase, um objetivo, um commit. Se o agente tentar “fazer tudo”, interrompa e repita o limite da fase.

---

## 2. Produto

O Altar é o canal da igreja com os fiéis e, ao mesmo tempo, um app diário de versículos para compartilhar.

A igreja usa o app para:

- enviar comunicados e pedidos de oração;
- marcar cultos e encontros presenciais;
- marcar encontros online (link de Meet, Zoom ou live);
- receber dízimo e oferta via Pix na chave da própria igreja;
- ver quem confirmou presença e quem contribuiu.

O fiel usa o app para:

- receber o que a igreja publicou;
- ler e compartilhar mensagem de bom dia, boa tarde e boa noite com versículo;
- confirmar presença, pedir oração e contribuir;
- ganhar pontos, subir de status e mostrar esse status aos amigos.

Dois pagadores, dois produtos no mesmo app:

| Quem paga | Pelo quê | O que destrava |
| --- | --- | --- |
| Igreja | Mensalidade | Painel, comunicados, agenda, dízimo, encontros online, relatórios |
| Fiel | Nada (vê anúncio) | Feed bíblico, compartilhamento, pontos, status, quiz |

O fiel da igreja assinante não paga. O anúncio fica no feed bíblico e no compartilhamento, nunca no fluxo da igreja.

---

## 3. Personas

- **Fiel:** entra por convite, lê, compartilha, ora, contribui, sobe de status.
- **Líder:** publica aviso no próprio ministério e vê a escala do grupo.
- **Pastor / admin da igreja:** dono do tenant. Comunica, agenda, vê dízimos, convida equipe.
- **Tesoureiro:** vê contribuições e exporta. Não precisa ser o pastor.
- **Superadmin da plataforma:** só na fase final. Vê igrejas, planos e denúncias. Não vê conteúdo pastoral sem motivo.

---

## 4. Receita

### 4.1 Mensalidade da igreja

Cobrança via Mercado Pago, primeiro em sandbox. Planos iniciais (valores editáveis):

| Plano | Membros ativos | Comunicados / mês | Encontros online | Preço sugerido |
| --- | --- | --- | --- | --- |
| Trial | 30 | 20 | sim, 14 dias | R$ 0 |
| Essencial | 150 | 40 | não | R$ 49 |
| Comunhão | 500 | 120 | sim | R$ 99 |
| Missão | 2.000 | ilimitado | sim + relatório | R$ 199 |

Atraso de pagamento: 7 dias de tolerância, depois o painel fica somente leitura. O fiel continua lendo o feed bíblico.

### 4.2 Anúncios

AdMob, só no app do fiel:

- banner no feed de versículos;
- intersticial no máximo 1 a cada 3 compartilhamentos, nunca no primeiro uso do dia;
- rewarded opcional: ver um anúncio para dobrar os pontos de um quiz.

Proibido: anúncio em dízimo, oferta, culto, oração, login, cadastro e pagamento. Proibido incentivar clique (“toque no anúncio para ganhar ponto”).

AdSense só entra se houver site. O app usa AdMob.

### 4.3 O que a plataforma não fica

O Pix do dízimo cai na chave da igreja. A plataforma não retém, não faz split e não cobra taxa sobre o dízimo na v1. A receita da plataforma é mensalidade + anúncio.

---

## 5. Gamificação

Pontos medem uso e acerto em quiz. Não existe “nota de fé”.

| Ação | Pontos | Limite |
| --- | --- | --- |
| Abrir o app no dia | 5 | 1 vez por dia |
| Compartilhar versículo | 10 | 3 vezes por dia |
| Indicar amigo que cria conta | 50 | sem limite, antifraude por aparelho |
| Acertar pergunta do quiz | 15 | 1 quiz por dia, 5 perguntas |
| Confirmar presença em culto | 10 | 1 vez por evento |

Status por pontos acumulados (não zera no mês):

| Status | A partir de |
| --- | --- |
| Semente | 0 |
| Bronze | 100 |
| Prata | 400 |
| Ouro | 1.000 |
| Diamante | 2.500 |

O perfil mostra o status como troféu e gera um card compartilhável (“Meu status no Altar é Ouro”). Ranking da igreja é opt-in e só aparece para quem aceitou. Sem ranking global na v1.

O quiz bíblico é a única medida de conhecimento. Perguntas curtas, múltipla escolha, com a referência do versículo depois da resposta. Errar não tira ponto.

---

## 6. Stack obrigatória

- **App:** Flutter (Android e iOS no mesmo código).
- **Backend:** Firebase Auth (e-mail, Google, Apple), Firestore, Cloud Functions, Cloud Messaging, Storage.
- **Anúncio:** google_mobile_ads (AdMob), com IDs de teste até a fase de loja.
- **Pagamento:** Mercado Pago. Checkout da mensalidade e Pix do dízimo. Nunca guardar número de cartão.
- **Encontro online:** link externo (Meet ou Zoom) colado pela igreja. Sem vídeo próprio na v1.
- **Idioma:** português do Brasil.
- **Arquitetura:** por feature (`auth`, `church`, `members`, `feed`, `events`, `giving`, `verses`, `gamification`, `ads`, `billing`, `settings`).
- **Multi-tenant:** todo documento de negócio tem `churchId`.
- **Papéis:** `member`, `leader`, `pastor`, `churchAdmin`.

Não trocar a stack no meio do projeto sem pedido explícito.

---

## 7. Modelo de dados (Firestore)

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

Regras: fiel só lê a própria igreja e o próprio dízimo. Dízimo de terceiros só para `pastor`, `churchAdmin` e tesoureiro. Versículo do dia é leitura pública para usuário logado.

---

## 8. Telas da v1

Fiel: entrar, escolher igreja pelo código, início, feed da igreja, versículo do dia, compartilhar, agenda, detalhe do evento, dízimo, oração, perfil com status, quiz, ranking opt-in, ajustes e privacidade.

Igreja: entrar, criar igreja, assinar plano, painel, novo comunicado, nova agenda, lista de membros, convite (código e QR), dízimos do período, chave Pix, equipe e papéis.

Não desenhar rede social aberta, stories, vídeo próprio, chat 1:1 ilimitado nem loja de produtos na v1.

---

## 9. LGPD e lojas

Dado religioso é dado sensível no Brasil. Por isso:

- consentimento separado para conta, notificação e anúncio;
- política de privacidade e termos em português, link visível no cadastro;
- exportar e apagar conta em até 15 dias;
- não pedir CPF do fiel;
- não usar lista de membros para anúncio de terceiro;
- idade mínima 13; menor de 16 não entra em ranking;
- dízimo com trilha de quem acessou o relatório;
- chave Pix e logo são dados da igreja, não do fiel.

Nas lojas, a ficha deve dizer que doação vai para a igreja, não para o desenvolvedor. Apps de doação e de conteúdo religioso passam por revisão extra: sem promessa de milagre, sem cura garantida, sem incentivo a clique em anúncio.

---

## 10. Fora da v1

Chat em tempo real entre fiéis, transmissão de vídeo própria, EBD completa, celular/check-in infantil, multi-campus, nota fiscal, split de Pix, site público da igreja, indicação premiada com dinheiro.

---

## 11. Critério geral de pronto

Uma fase só fecha quando:

- o fluxo principal abre no emulador;
- regra de acesso foi testada (fiel não vê dízimo alheio);
- não há anúncio em tela proibida;
- textos estão em português;
- o agente entregou como testar e o que ficou de dívida.

---

# Prompts para colar

Cada bloco abaixo é uma sessão. Cole o bloco inteiro.

---

## Fase 0 — Spec e esqueleto

```text
Você vai construir o app Altar, descrito em docs/ROTEIRO.md. Se o arquivo ainda não existir, use o roteiro que colei junto.

Nesta sessão, não implemente feature de produto. Faça só isto:

1. Crie CLAUDE.md com as regras permanentes: visão, duas receitas, stack Flutter + Firebase + AdMob + Mercado Pago, multi-tenant por churchId, papéis, gamificação, proibição de anúncio em dízimo/culto/oração/pagamento, LGPD, idioma pt-BR, e a regra de não avançar de fase sem pedido.
2. Crie docs/PRD.md com personas, fluxos, telas, modelo Firestore e critério de pronto de cada fase.
3. Crie docs/FASES.md com a lista das fases 1 a 9, uma por seção, copiando o objetivo de cada uma do roteiro.
4. Rode flutter create com nome altar e organização com.altar.app, dentro desta pasta, sem sobrescrever os docs.
5. Deixe a estrutura de pastas lib/features/ pronta (auth, church, members, feed, events, giving, verses, gamification, ads, billing, settings) e um tema sóbrio claro/escuro. Tela inicial apenas com o nome do app.
6. Acrescente README.md com como rodar e a ordem das fases.

Não integre Firebase ainda. Ao terminar, liste os arquivos criados e pare.
```

---

## Fase 1 — Conta, igreja e convite

```text
Implemente a Fase 1 do CLAUDE.md e do docs/ROTEIRO.md. Não avance.

Objetivo: um fiel entra numa igreja e um pastor cria a igreja.

Escopo:
- Firebase Auth com e-mail/senha e Google. Apple fica preparado, mas pode ficar desligado se não houver conta Apple neste ambiente.
- Cadastro pede nome e consentimento da conta. Não peça CPF.
- Pastor cria igreja (nome, cidade) e recebe inviteCode de 6 caracteres.
- Fiel entra pelo código e passa a ter churchId e role member.
- Papéis gravados em churches/{id}/members/{uid}. Quem cria a igreja vira churchAdmin.
- Firestore rules: usuário só lê a própria igreja; não lê membros de outra.
- Telas: entrar, criar conta, criar igreja, entrar com código, início vazio com o nome da igreja.
- Trate código inválido e igreja inexistente.

Fora: mensalidade, avisos, agenda, dízimo, versículo, anúncio, pontos.

Entregue como testar com dois usuários (pastor e fiel) e pare.
```

---

## Fase 2 — Comunicados e oração

```text
Implemente a Fase 2. Não avance.

Objetivo: o pastor fala com os fiéis e o fiel pede oração.

Escopo:
- Pastor e churchAdmin publicam aviso (título e texto) em churches/{id}/posts.
- Fiel vê o feed da própria igreja, do mais novo para o mais antigo.
- Fiel envia pedido de oração (type oracao). Pastor vê a lista e pode marcar como orado, sem publicar o pedido no feed.
- Push com FCM quando sai aviso. Se o token não existir no emulador, registre o token e deixe a função pronta.
- Líder ainda não publica. Só pastor e churchAdmin.
- Vazio bem desenhado: “Nenhum comunicado ainda”.

Fora: agenda, dízimo, versículo, anúncio, pontos, chat.

Regras de segurança: fiel não publica aviso e não lê oração de outro fiel. Entregue o teste desses dois casos e pare.
```

---

## Fase 3 — Agenda e encontro online

```text
Implemente a Fase 3. Não avance.

Objetivo: marcar culto, encontro presencial e encontro online, com confirmação.

Escopo:
- Pastor cria evento: título, data/hora, local, tipo (culto, encontro, online) e URL opcional.
- Tipo online exige URL. Não construa vídeo próprio.
- Fiel vê a agenda e confirma presença (RSVP um por usuário).
- Lembrete local 60 minutos antes. Push fica para a função já existente, se der.
- Detalhe do evento com botão de abrir o link online.
- Evento passado vai para o fim da lista.

Fora: dízimo, versículo, anúncio, pontos, mensalidade.

Entregue como criar um culto e um encontro online e pare.
```

---

## Fase 4 — Dízimo e oferta

```text
Implemente a Fase 4. Não avance.

Objetivo: o fiel contribui e o valor cai na igreja, não na plataforma.

Escopo:
- Igreja cadastra chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória) e o tipo.
- Fiel informa valor e vê o resumo. Tela sem qualquer anúncio, banner ou pré-carregamento de ad.
- Gere Pix pelo Mercado Pago em sandbox, com a chave da igreja como destino. Se o sandbox não permitir destino direto, documente a limitação e use um pagamento sandbox marcado como “repasse manual”, sem split inventado.
- Não guarde dado de cartão. Não peça cartão na v1 do dízimo.
- Fiel vê só os próprios lançamentos. Tesoureiro, pastor e churchAdmin veem o período e exportam CSV.
- Status: pendente, pago, expirado. Atualize por webhook ou consulta. Se webhook não for possível aqui, deixe a Cloud Function e um botão “já paguei” só em debug.

Fora: mensalidade, anúncio, versículo, pontos.

Teste de regra: fiel A não vê o dízimo do fiel B. Entregue esse teste e pare.
```

---

## Fase 5 — Versículo do dia e compartilhar

```text
Implemente a Fase 5. Não avance.

Objetivo: bom dia, boa tarde e boa noite com versículo, prontos para compartilhar.

Escopo:
- Coleção verses com slot manha, tarde e noite, texto, referência e data.
- Seed de 21 dias (7 de cada slot) em português, referências reais (use Almeida ou NVI somente se a licença permitir; se não puder embutir tradução protegida, use referências e texto de domínio público e documente a escolha).
- Aba Início do fiel mostra o versículo do período atual, segundo o fuso America/Recife.
- Botão compartilhar gera um card (versículo, referência, status do usuário se já existir, marca Altar) e abre o share nativo.
- Igreja não paga por isso. O feed bíblico existe mesmo sem plano, para sustentar o anúncio depois.
- Guarde o share em pointsLog ainda sem somar status (a soma entra na fase 7).

Fora: AdMob, quiz, ranking, mensalidade.

Entregue o card compartilhado e pare.
```

---

## Fase 6 — AdMob

```text
Implemente a Fase 6. Não avance.

Objetivo: anúncio só onde a spec permite.

Escopo:
- google_mobile_ads com IDs de teste do Google.
- Banner apenas no feed de versículos, abaixo do card, nunca fixo sobre o botão de dízimo.
- Intersticial no máximo 1 a cada 3 compartilhamentos e nunca no primeiro compartilhamento do dia.
- Rewarded ainda não liga em ponto. Deixe o método pronto e desligado.
- Flag consentAds. Sem consentimento, não carregue anúncio.
- Lista de rotas proibidas no código: giving, event detail, prayer, login, billing. Um teste deve falhar se um banner entrar nessas rotas.
- Não escreva “toque no anúncio”.

Fora: mensalidade, quiz, status.

Entregue o teste das rotas proibidas e pare.
```

---

## Fase 7 — Pontos, status e indicação

```text
Implemente a Fase 7. Não avance.

Objetivo: a pessoa vê o status e consegue mostrar como troféu.

Escopo, exatamente estas regras:
- Abrir o app no dia: +5, uma vez.
- Compartilhar versículo: +10, até 3 por dia.
- Indicar amigo que cria conta com o código: +50. Código de indicação do usuário, separado do código da igreja.
- Confirmar presença: +10, uma vez por evento.
- Status: Semente 0, Bronze 100, Prata 400, Ouro 1000, Diamante 2500. Não zera no mês.
- Perfil com troféu, pontos e próximo status.
- Card compartilhável do status.
- Ranking da igreja só para quem ligou statusOptIn. Sem ranking global.
- Antifraude simples: mesmo aparelho não conta como indicação.

Fora: quiz, mensalidade, rewarded.

Entregue um usuário subindo de Semente para Bronze e pare.
```

---

## Fase 8 — Quiz bíblico

```text
Implemente a Fase 8. Não avance.

Objetivo: conhecimento entra só por quiz, não por inferência.

Escopo:
- 30 perguntas curtas, múltipla escolha, referência exibida depois da resposta.
- 1 quiz por dia, 5 perguntas. Acerto: +15. Erro: 0, sem punição.
- Rewarded opcional, desligado por padrão, para dobrar os pontos daquele quiz. Só aparece se consentAds estiver ligado. Nunca obrigatório.
- Resultado no perfil (“quizzes esta semana”), sem nota de fé e sem comparar com outros fiéis.
- Seed das perguntas em português, com fonte da referência.

Fora: mensalidade e painel financeiro novo.

Entregue um quiz completo e pare.
```

---

## Fase 9 — Mensalidade da igreja

```text
Implemente a Fase 9. Não avance.

Objetivo: a igreja assina e o plano trava o que a spec manda.

Escopo:
- Planos Trial 14 dias, Essencial, Comunhão e Missão, com os limites de membros e comunicados do roteiro.
- Checkout Mercado Pago em sandbox. Não guarde cartão.
- Trial permite o painel. Ao expirar sem plano, painel fica somente leitura: não publica aviso, não cria evento, não vê dízimo novo. O fiel continua no versículo.
- Encontro online só no Comunhão e no Missão.
- Tela de plano para o churchAdmin, com status e data de renovação.
- Webhook ou consulta de status. Documente o que ficou sandbox.

Fora: superadmin, loja, nota fiscal.

Entregue a igreja no trial e a igreja expirada em somente leitura e pare.
```

---

## Fase 10 — Privacidade, polimento e lojas

```text
Implemente a Fase 10, a última desta v1. Não invente feature nova.

Escopo:
- Tela de privacidade: exportar meus dados (JSON), pedir exclusão, desligar anúncio, desligar ranking.
- Textos de política de privacidade e termos em docs/legal/, em português, com a frase de que o dízimo vai para a igreja.
- Idade: bloqueie ranking abaixo de 16 se a data de nascimento for informada. Não obrigue a data.
- Crashlytics ou equivalente já usado no Firebase, sem dados de dízimo no log.
- Ícone, nome Altar, splash.
- docs/LOJA.md com ficha da Play e da App Store, screenshots necessários, classificação e o aviso de doação para a igreja.
- Checklist do que falta para produção: IDs reais de AdMob, chave Mercado Pago de produção, conta Apple, política publicada numa URL.

Entregue o checklist e pare. Não publique nas lojas.
```

---

## 12. Prompt curto de continuação

Use no começo de qualquer sessão que não seja a primeira da fase:

```text
Continue a fase atual do Altar. Leia CLAUDE.md e docs/ROTEIRO.md. Não mude a stack. Não avance de fase. Rode o app, corrija o que quebrar e me diga como testar.
```

---

## 13. Ordem e o que não misturar

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

Mensalidade na fase 9 é de propósito: o feed bíblico e o anúncio precisam existir antes, senão o agente acopla anúncio no painel da igreja.
