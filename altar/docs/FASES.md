# Fases do Altar

Uma fase por sessão. Uma fase, um objetivo, um commit. Nunca avance sem pedido explícito. Os prompts completos de cada fase estão em `docs/ROTEIRO.md`.

## Ordem decidida pelo produto

O app do leitor sai primeiro; o lado da igreja vem depois, sem desfazer nada.

| Bloco | Fases | Estado |
| --- | --- | --- |
| Base | 0, 1 | concluídas (`docs/FASE1.md`) |
| Leitor | 5, 6, 7, 8 | concluídas (`docs/LEITOR.md`) |
| Igreja | 2, 3, 4, 9 | próximas, nesta ordem |
| Fechamento | 10 | por último |

Fase atual: **bloco do leitor concluído**. Próxima: **2** (comunicados e oração).

## Fase 0 — Spec e esqueleto

Objetivo: `CLAUDE.md`, `docs/PRD.md`, `docs/FASES.md`, projeto Flutter `altar` (org `com.altar.app`), pastas `lib/features/`, tema claro/escuro, tela inicial só com o nome do app, `README.md`. Sem Firebase.

Não misturar com: Firebase de produto.

## Fase 1 — Conta, igreja e convite

Objetivo: um fiel entra numa igreja e um pastor cria a igreja.

Escopo: Firebase Auth (e-mail/senha e Google; Apple preparado), cadastro com nome e consentimento (sem CPF), pastor cria igreja e recebe `inviteCode` de 6 caracteres, fiel entra pelo código e vira `member`, papéis em `churches/{id}/members/{uid}`, criador vira `churchAdmin`, rules isolam igrejas, telas de entrar, criar conta, criar igreja, entrar com código e início vazio. Tratar código inválido.

Fora: mensalidade, avisos, agenda, dízimo, versículo, anúncio, pontos.

Não misturar com: aviso e pagamento.

## Fase 2 — Comunicados e oração

Objetivo: o pastor fala com os fiéis e o fiel pede oração.

Escopo: pastor e `churchAdmin` publicam aviso em `posts`, feed do mais novo ao mais antigo, pedido de oração visível só ao pastor com marcação de orado, push FCM ao sair aviso, líder ainda não publica, vazio "Nenhum comunicado ainda".

Fora: agenda, dízimo, versículo, anúncio, pontos, chat.

Não misturar com: agenda.

## Fase 3 — Agenda e encontro online

Objetivo: marcar culto, encontro presencial e encontro online, com confirmação.

Escopo: evento com título, data/hora, local, tipo e URL opcional (online exige URL), RSVP único por usuário, lembrete local 60 minutos antes, detalhe com botão de abrir link, evento passado no fim da lista.

Fora: dízimo, versículo, anúncio, pontos, mensalidade.

Não misturar com: dízimo.

## Fase 4 — Dízimo e oferta

Objetivo: o fiel contribui e o valor cai na igreja, não na plataforma.

Escopo: chave Pix e tipo da igreja, fiel informa valor e vê resumo sem anúncio, Pix via Mercado Pago sandbox com a igreja como destino (documentar limitação se não houver destino direto), sem cartão, fiel vê só os próprios lançamentos, tesoureiro/pastor/`churchAdmin` veem período e exportam CSV, status pendente/pago/expirado por webhook ou consulta.

Fora: mensalidade, anúncio, versículo, pontos.

Não misturar com: anúncio.

## Fase 5 — Versículo do dia e compartilhar

Objetivo: bom dia, boa tarde e boa noite com versículo, prontos para compartilhar.

Escopo: coleção `verses` com slot, seed de 21 dias em português com referências reais (texto de domínio público se a tradução protegida não puder ser embutida), aba Início com o versículo do período no fuso America/Recife, card compartilhável com marca Altar e share nativo, share gravado em `pointsLog` sem somar status.

Fora: AdMob, quiz, ranking, mensalidade.

Não misturar com: AdMob.

## Fase 6 — AdMob

Objetivo: anúncio só onde a spec permite.

Escopo: `google_mobile_ads` com IDs de teste, banner só no feed de versículos abaixo do card, intersticial no máximo 1 a cada 3 shares e nunca no primeiro do dia, rewarded preparado e desligado, flag `consentAds`, lista de rotas proibidas no código (giving, event detail, prayer, login, billing) com teste que falha se um banner entrar, sem texto "toque no anúncio".

Fora: mensalidade, quiz, status.

Não misturar com: pontos.

## Fase 7 — Pontos, status e indicação

Objetivo: a pessoa vê o status e consegue mostrar como troféu.

Escopo: +5 abrir no dia, +10 share até 3 por dia, +50 indicação com código próprio do usuário, +10 presença por evento, status Semente/Bronze/Prata/Ouro/Diamante sem zerar, perfil com troféu e próximo status, card de status, ranking da igreja só com `statusOptIn`, antifraude por aparelho.

Fora: quiz, mensalidade, rewarded.

Não misturar com: quiz.

## Fase 8 — Quiz bíblico

Objetivo: conhecimento entra só por quiz, não por inferência.

Escopo: 30 perguntas de múltipla escolha com referência após a resposta, 1 quiz por dia com 5 perguntas, +15 por acerto e 0 por erro, rewarded opcional desligado por padrão só com `consentAds`, resultado no perfil sem nota de fé e sem comparação, seed em português com fonte.

Fora: mensalidade e painel financeiro novo.

Não misturar com: mensalidade.

## Fase 9 — Mensalidade da igreja

Objetivo: a igreja assina e o plano trava o que a spec manda.

Escopo: planos Trial 14 dias, Essencial, Comunhão e Missão com limites do roteiro, checkout Mercado Pago sandbox sem guardar cartão, trial libera o painel e expirado vira somente leitura (fiel segue no versículo), encontro online só em Comunhão e Missão, tela de plano para o `churchAdmin`, webhook ou consulta de status documentados.

Fora: superadmin, loja, nota fiscal.

Não misturar com: loja.

## Fase 10 — Privacidade, polimento e lojas

Objetivo: fechar a v1 sem feature nova.

Escopo: tela de privacidade (exportar JSON, pedir exclusão, desligar anúncio, desligar ranking), textos legais em `docs/legal/` com a frase de que o dízimo vai para a igreja, bloqueio de ranking abaixo de 16 quando houver data de nascimento, Crashlytics sem dado de dízimo, ícone, nome e splash, `docs/LOJA.md` com fichas das lojas, checklist de produção (IDs AdMob reais, chave Mercado Pago de produção, conta Apple, URL da política).

Fora: qualquer feature nova. Não publicar nas lojas.
