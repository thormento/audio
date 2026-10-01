# CLAUDE.md — Altar

Regras permanentes do projeto. Leia antes de qualquer sessão. A fonte completa é `docs/ROTEIRO.md`; o PRD está em `docs/PRD.md`; a lista de fases em `docs/FASES.md`.

## Visão

Altar é o canal da igreja com os fiéis e, ao mesmo tempo, um app diário de versículos para compartilhar. A igreja comunica, agenda, recebe dízimo via Pix na própria chave e vê quem participa. O fiel lê, compartilha, ora, contribui e sobe de status.

Nome provisório. Trocar antes de publicar.

## Duas receitas, dois produtos no mesmo app

| Quem paga | Pelo quê | O que destrava |
| --- | --- | --- |
| Igreja | Mensalidade (Mercado Pago) | Painel, comunicados, agenda, dízimo, encontros online, relatórios |
| Fiel | Nada (vê anúncio AdMob) | Feed bíblico, compartilhamento, pontos, status, quiz |

- O fiel nunca paga. O fiel de igreja assinante também não paga.
- O Pix do dízimo cai na chave da igreja. A plataforma não retém, não faz split e não cobra taxa sobre dízimo na v1.
- O feed bíblico existe mesmo sem plano da igreja. Ele sustenta o anúncio.
- Mensalidade atrasada: 7 dias de tolerância, depois painel somente leitura. O fiel continua lendo o feed bíblico.

## Stack obrigatória (não trocar sem pedido explícito)

- App: Flutter, Android e iOS no mesmo código. Package `altar`, organização `com.altar.app`.
- Backend: Firebase Auth (e-mail, Google, Apple), Firestore, Cloud Functions, Cloud Messaging, Storage.
- Anúncio: `google_mobile_ads` (AdMob) com IDs de teste até a fase de loja.
- Pagamento: Mercado Pago (checkout da mensalidade e Pix do dízimo). Nunca guardar número de cartão.
- Encontro online: link externo (Meet, Zoom, live) colado pela igreja. Sem vídeo próprio.
- Idioma: português do Brasil em todos os textos de interface.
- Arquitetura por feature em `lib/features/`: `auth`, `church`, `members`, `feed`, `events`, `giving`, `verses`, `gamification`, `ads`, `billing`, `settings`.

## Multi-tenant e papéis

- Todo documento de negócio carrega `churchId`.
- Papéis: `member`, `leader`, `pastor`, `churchAdmin`. Gravados em `churches/{churchId}/members/{uid}`.
- Quem cria a igreja vira `churchAdmin`.
- Fiel só lê a própria igreja e o próprio dízimo. Dízimo de terceiros só para `pastor`, `churchAdmin` e tesoureiro.
- Versículo do dia é leitura pública para usuário logado.
- Toda fase que mexe em dados precisa de regra Firestore testada: fiel não vê dízimo alheio, fiel não publica aviso, fiel não lê oração de outro fiel.

## Gamificação (regras exatas)

| Ação | Pontos | Limite |
| --- | --- | --- |
| Abrir o app no dia | 5 | 1 vez por dia |
| Compartilhar versículo | 10 | 3 vezes por dia |
| Indicar amigo que cria conta | 50 | sem limite, antifraude por aparelho |
| Acertar pergunta do quiz | 15 | 1 quiz por dia, 5 perguntas |
| Confirmar presença em culto | 10 | 1 vez por evento |

Status acumulado, não zera no mês: Semente 0, Bronze 100, Prata 400, Ouro 1.000, Diamante 2.500.

- Não existe "nota de fé". O quiz é a única medida de conhecimento. Errar não tira ponto.
- Ranking da igreja é opt-in (`statusOptIn`). Sem ranking global na v1. Menor de 16 não entra em ranking.

## Anúncio: onde pode e onde não pode

Permitido (só no app do fiel):

- banner no feed de versículos, abaixo do card;
- intersticial no máximo 1 a cada 3 compartilhamentos, nunca no primeiro uso do dia;
- rewarded opcional para dobrar pontos de um quiz, nunca obrigatório.

Proibido:

- anúncio em dízimo, oferta, culto, detalhe de evento, oração, login, cadastro, billing e pagamento;
- banner fixo sobre o botão de dízimo;
- pré-carregar anúncio em tela proibida;
- carregar anúncio sem `consentAds`;
- qualquer texto que incentive clique ("toque no anúncio para ganhar ponto").

As rotas proibidas ficam em lista no código e um teste falha se um banner entrar nelas.

## LGPD

Dado religioso é dado sensível no Brasil.

- Consentimento separado para conta, notificação (`consentPush`) e anúncio (`consentAds`).
- Política de privacidade e termos em português, com link visível no cadastro.
- Exportar e apagar conta em até 15 dias.
- Não pedir CPF do fiel. Chave Pix e logo são dados da igreja, não do fiel.
- Não usar lista de membros para anúncio de terceiro.
- Idade mínima 13. Data de nascimento opcional.
- Relatório de dízimo com trilha de quem acessou.
- Sem dado de dízimo em log de crash.

## Fora da v1

Chat em tempo real, vídeo próprio, EBD completa, check-in infantil, multi-campus, nota fiscal, split de Pix, site público da igreja, indicação premiada com dinheiro, rede social aberta, stories, loja de produtos, ranking global.

## Regra de fases (a mais importante)

- Uma fase, um objetivo, um commit. A lista e a ordem decidida estão em `docs/FASES.md`: base (0, 1), leitor (5, 6, 7, 8), igreja (2, 3, 4, 9), fechamento (10).
- Telas da igreja usam os nomes de rota de `lib/app/routes.dart`, porque a política de anúncios os proíbe por nome.
- A v1 está concluída em sandbox. O que falta para produção está em `docs/PRODUCAO.md`. Mudança nova é escopo novo: não inventar feature sem pedido.
- Nunca avance para a próxima fase sem pedido explícito do usuário.
- Se o pedido for "continue a fase atual", não inicie feature da fase seguinte.
- Uma fase só fecha quando: o fluxo principal abre no emulador; a regra de acesso foi testada; não há anúncio em tela proibida; os textos estão em português; o agente entregou como testar e o que ficou de dívida.
- Ao terminar, liste o que ficou pronto, o que falta e como testar. Depois pare.
