# Lado da igreja e fechamento — o que ficou pronto e como testar

Cobre as fases 2 (comunicados e oração), 3 (agenda), 4 (dízimo), 9 (mensalidade) e 10 (privacidade, polimento e lojas) do `docs/ROTEIRO.md`.

## O que ficou pronto

**Fase 2, comunicados e oração.** Pastor e administrador publicam aviso na aba Igreja; o feed mostra do mais novo ao mais antigo e tem o vazio "Nenhum comunicado ainda". Fiel pede oração numa tela sem anúncio; só ele e a equipe veem, e o pastor marca como orado no painel. Push via tópico FCM `church_{id}` pela função `notifyNewPost`; o app assina o tópico quando `consentPush` está ligado e grava o token em `users`. Líder ainda não publica.

**Fase 3, agenda.** Pastor marca culto, encontro presencial ou online (URL obrigatória). Fiel confirma presença (um RSVP por usuário, +10 pontos uma vez por evento), recebe lembrete local 60 minutos antes e abre o link no detalhe. Passados vão para o fim da lista. Push `notifyNewEvent`.

**Fase 4, dízimo e oferta.** A igreja cadastra chave Pix e tipo. O fiel escolhe dízimo ou oferta, informa o valor e vê o resumo numa tela sem anúncio. Dois caminhos: a função `createGiftPix` gera o Pix no Mercado Pago sandbox (status por webhook `mpWebhook`), marcado como repasse manual porque o sandbox não permite destino direto; sem a função, o app gera o BR Code estático com a chave da igreja, que cai direto na conta dela. O fiel pode informar que pagou; tesoureiro, pastor e administrador confirmam, veem o período, exportam CSV e deixam trilha em `giftsAudit`. Papel `treasurer` novo. Botão "já paguei" só muda para "informado", nunca para "pago".

**Fase 9, mensalidade.** Planos Teste (14 dias), Essencial, Comunhão e Missão com limites do roteiro em `lib/features/billing/plans.dart`. Checkout do Mercado Pago via `createSubscriptionCheckout` (assinatura, sem cartão no app); webhook atualiza `billing/{churchId}` e o plano da igreja. `expireTrials` roda diariamente e põe trial vencido e atraso além de 7 dias em somente leitura. Nesse estado as regras bloqueiam aviso, evento e relatório de dízimo novo; fiel continua no versículo e ainda pede oração. Encontro online só em Teste, Comunhão e Missão. Limite de membros bloqueia a entrada pelo código; limite de comunicados por mês é contado pela função e verificado no app.

**Fase 10, privacidade e lojas.** Tela Privacidade: exportar JSON, pedir exclusão (função `deleteUserData` apaga em até 15 dias e anonimiza dízimos), desligar anúncio e ranking, data de nascimento opcional que bloqueia ranking abaixo de 16. Crashlytics ligado só em release fora do emulador. Ícone e splash gerados por `tool/make_icon.dart`. Textos legais em `docs/legal/`, ficha das lojas em `docs/LOJA.md`, checklist em `docs/PRODUCAO.md`.

## Como testar

Suba emuladores com funções: `cd firebase && npm run emulators` (Firestore, Auth, Functions na porta 5001). Funções que chamam o Mercado Pago precisam de `MP_ACCESS_TOKEN` de sandbox em `firebase/functions/.secret.local` (`MP_ACCESS_TOKEN=TEST-...`); sem ele, o dízimo cai no Pix direto e a assinatura mostra a mensagem de indisponibilidade.

Fase 2, com pastor e fiel da fase 1:
1. Pastor: aba Igreja, "Novo comunicado". O fiel vê o aviso no topo do feed.
2. Fiel: "Pedir oração". Pastor: painel (ícone no canto) > Pedidos de oração > "Orei". O fiel vê "A equipe orou por você". O fiel B não vê o pedido do fiel A.
3. Regras: `npm test` cobre "fiel não publica aviso" e "fiel não lê oração de outro fiel".

Fase 3:
1. Pastor: aba Agenda, "Novo evento", tipo Culto. Depois outro do tipo Online com link do Meet. Sem link, o formulário recusa.
2. Fiel: abre o evento, "Vou participar". Aparece "+10 pontos" e o lembrete fica agendado para 60 minutos antes (precisa de aparelho ou emulador móvel). "Abrir encontro online" abre o link.
3. Marque um evento com data passada pelo painel do emulador: ele vai para "Já aconteceram".

Fase 4:
1. Pastor: painel > Chave Pix da igreja, cadastre um e-mail ou CNPJ.
2. Fiel A: feed > "Dízimo e oferta", valor 50, confirme. Aparece o código Pix copia e cola. Toque em "Já paguei".
3. Mude o papel do fiel B para Tesoureiro em Membros e equipe. Fiel B: painel > Dízimos do período vê o lançamento como "Informado pelo fiel" e confirma. Fiel B não vê nada em "Meus lançamentos" do fiel A. Exportar CSV abre o share.
4. Regras: `npm test` cobre "fiel A não vê o dízimo do fiel B".

Fase 9:
1. Com a igreja no trial, o painel mostra "Teste: N dias restantes" e tudo funciona.
2. No painel do emulador, mude `planStatus` para `expired` (ou `trialEndsAt` para ontem). O pastor vê a faixa "painel somente leitura", o botão de comunicado explica o bloqueio, e as regras recusam aviso, evento e relatório. O fiel continua no versículo e no quiz.
3. Painel > plano: lista Essencial, Comunhão e Missão. "Assinar" chama o checkout; sem token do Mercado Pago, mostra a mensagem de indisponibilidade.
4. Mude `plan` para `essencial` e `planStatus` para `active`: "Novo evento" desabilita a opção Online.

Fase 10:
1. Perfil > Ajustes > Privacidade e meus dados > Exportar: abre o share com o JSON.
2. Informe uma data de nascimento com 15 anos: o ranking desliga e trava.
3. "Pedir exclusão da conta": grava `deletionRequests/{uid}` e sai. Com as funções no emulador, `deleteUserData` apaga os dados.

Testes automáticos: `flutter test` (27) e `cd firebase && npm test` (34 regras).

## Dívidas e limitações

- Mercado Pago só em sandbox e sem destino direto para a chave da igreja: o Pix do MP é repasse manual. O Pix direto (BR Code) já atende o roteiro sem a plataforma tocar no dinheiro.
- Limite de comunicados por mês é verificado no app e contado pela função; as regras não o impõem.
- Push, lembrete local, share com imagem e link externo precisam de aparelho ou emulador móvel com projeto Firebase real.
- Líder ainda não publica no próprio ministério (ficou como no roteiro da fase 2).
- Convite por QR não foi feito; o código de 6 caracteres cobre o convite.
- Textos legais precisam de revisão jurídica e de uma URL pública.
- Ícone e splash são um placeholder geométrico. Trocar `assets/icon/*.png` e rodar os dois comandos do `tool/make_icon.dart`.
