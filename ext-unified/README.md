# Facebook Session Assistant

Extensão para Google Chrome (Manifest V3) que organiza e executa **sessões de navegação no Facebook**: você define intervalos mínimos e máximos para cada atividade, a extensão sorteia os valores a cada nova sessão, abre a seção correspondente, controla os cronômetros, as pausas e as metas assistidas, e salva um histórico local.

> A extensão **não** curte, **não** envia solicitações de amizade, **não** comenta, **não** compartilha e **não** envia mensagens. Essas ações permanecem manuais: você as executa no Facebook e apenas registra no contador. Para mensagens, ela apenas sorteia e copia uma saudação. Nenhum dado sai do seu navegador.

---

## Estatísticas acumuladas (novo)

A aba **Início** mostra o cartão **📊 Suas estatísticas**, sempre que você abre a extensão:

- **Minutos por atividade**: quanto tempo você já passou em Feed, Reels, Vídeos, Lives, Jogos e Messenger, somando todas as sessões.
- **Total** de minutos de atividades.
- **Dia N**: quantos dias distintos já tiveram pelo menos uma sessão (dia 1, dia 2, ...), além da data da primeira sessão e da sequência de dias seguidos.
- Totais de curtidas, solicitações e mensagens que você registrou.

Tudo fica salvo em `chrome.storage.local` e não depende do histórico (que guarda só as últimas 30 sessões). Ao atualizar de uma versão anterior, os totais são reconstruídos uma vez a partir do histórico existente.

---

## Instalação

1. Baixe a extensão (esta pasta `facebook-session-assistant/`).
2. Extraia os arquivos, se estiverem compactados.
3. Abra o Chrome.
4. Digite na barra de endereços: `chrome://extensions`
5. Ative **Modo do desenvolvedor** (canto superior direito).
6. Clique em **Carregar sem compactação**.
7. Escolha a pasta `facebook-session-assistant`.
8. Fixe o ícone da extensão na barra (ícone de quebra-cabeça → alfinete).

A extensão usa a conta do Facebook que já estiver autenticada no navegador. Não há servidor externo nem dependências.

---

## Como usar (modo simples, aba Início)

1. **Abra o painel** clicando no ícone da extensão. A aba **Início** tem três passos:
   - **1. O que vamos fazer?** Toque nos quadrados (📰 Feed, 🎬 Reels, ▶️ Vídeos, 🔴 Lives, 🎮 Jogos, 💬 Messenger) para ligar ou desligar. Pode escolher só um.
   - **2. Quanto tempo?** Toque em 5, 10, 15, 20, 30, 45 ou 60 minutos (o tempo é dividido entre as atividades ligadas) ou em 🎲 Sortear para usar os intervalos de Ajustes.
   - **3. Repetir sozinho?** Não, ou a cada 30 min, 1h, 2h ou 3h.
2. Toque em **▶ COMEÇAR AGORA**. A extensão abre a página certa, mostra o que fazer e conta o tempo. Ou toque em **👀 Ver o plano antes** para conferir o sorteio.
3. Na tela ao vivo, marque o que você fez com os botões grandes: **👍 Curti um post!**, **🤝 Pedi amizade!**, **💬 Mandei a mensagem!**. Ao terminar, aparece a celebração com o resumo e o botão **Fazer outra**.

Tudo que o Início faz também pode ser ajustado em detalhe na aba **Ajustes**, descrita abaixo.

## Jogo: XP, níveis, medalhas e missões

O cartão no topo do Início mostra o jogador: avatar (toque para trocar), nível com título (Iniciante, Curioso, Explorador, Sociável, Conectado, Influente, Veterano, Mestre, Lenda), barra de XP, sequência de dias 🔥, as 14 medalhas (acesas quando conquistadas) e as missões de hoje.

| Ganha XP por | Valor |
|--------------|-------|
| Cada minuto de atividade | 1 XP |
| Curtida registrada | 10 XP |
| Solicitação registrada | 25 XP |
| Mensagem registrada | 20 XP |
| Meta batida | 30 XP |
| Todas as etapas concluídas (sem pular) | 50 XP |
| Sessão concluída | 20 XP |
| Missão diária | 30 a 40 XP, uma vez por dia |

Nível = raiz quadrada de (XP / 100) + 1, então o nível 2 vem com 100 XP, o 3 com 400, o 4 com 900. Medalhas: primeira sessão, 5 e 20 sessões, 3 e 7 dias seguidos, 50 curtidas, 10 amizades, 20 mensagens, 10 horas, sessão perfeita, maratona (1h), faz-tudo (todas as atividades), madrugador (antes das 8h) e coruja (depois das 22h). Missões do dia: fazer 1 sessão, ficar 15 minutos ativo, curtir 5 posts, conversar com 2 amigos. O progresso fica em `chrome.storage.local` (chave `progress`) e pode ser zerado em Opções. Regras em `utils/gamification.js`.

## Ajustes detalhados (aba Ajustes)

1. **Abra a aba Ajustes** no painel.
2. **Marque quais atividades executar** no card "Quais atividades executar". Pode ser uma só (por exemplo, apenas Feed ou apenas Lives). Cada card também tem o interruptor "Executar: Sim/Não". Outra forma de pular uma atividade é deixar o **tempo máximo em 0** (ou a participação em 0% no modo de tempo total): ela aparece como "não executada" na sessão.
3. **Escolha o modo de duração** no card "Duração das atividades":
   - **Sortear entre mín. e máx.**: cada atividade tem tempo mínimo e máximo (minutos) e a extensão sorteia um valor a cada sessão.
   - **Tempo total dividido**: escolha o tempo total da sessão (1, 2, 5, 10, 15, 20 min ou outro valor) e ajuste a **barra de participação** de cada atividade. Os minutos são divididos proporcionalmente e a prévia mostra quanto cada uma recebe. Participação 0% deixa a atividade de fora.
   Para as metas (Curtidas, Amigos) informe quantidade mínima e máxima.
4. **Repetir automaticamente** (opcional): ative o interruptor no card "Repetir automaticamente" e escolha **A cada X minutos** (atalhos de 15 min a 3h, ou outro valor) ou **Intervalo aleatório** entre um mínimo e um máximo. Com o navegador aberto, ao terminar uma sessão a extensão espera esse intervalo e gera e inicia outra sozinha, com novos sorteios, até você clicar em **Parar**.
5. Ajuste as opções de sessão: **Embaralhar atividades** e **Pausa entre atividades** (segundos).
6. Clique em **Salvar configurações**.
7. Clique em **Gerar nova sessão**. A extensão define:
   - a duração de cada atividade (sorteada ou dividida pelo tempo total, conforme o modo);
   - a quantidade de cada meta;
   - a pausa entre cada etapa;
   - a ordem das etapas (se o embaralhamento estiver ativo).
8. Revise os valores sorteados e clique em **Iniciar sessão**.
9. A extensão abre a seção correspondente do Facebook e inicia o cronômetro. O popup pode ser fechado: a sessão continua no service worker.
10. Use **Pausar / Continuar / Pular etapa / Finalizar** quando quiser.
11. Ao curtir ou enviar uma solicitação manualmente, clique em **+ Registrar curtida** / **+ Registrar solicitação** (no popup ou no widget flutuante na página).
12. Ao terminar, a extensão mostra o **resumo** e grava a sessão no **histórico** (últimos 30 registros).

### Atividades

| Atividade | URL aberta | Observação |
|-----------|-----------|------------|
| Feed | `https://www.facebook.com/` | Rolagem automática opcional, com pausas variáveis. Para se você interagir com a página. |
| Reels | `https://www.facebook.com/reel/` | Cronômetro regressivo. |
| Vídeos | `https://www.facebook.com/watch/` | Cronômetro regressivo. |
| Lives | `https://www.facebook.com/watch/live/` | Você escolhe a live. |
| Jogos | `https://www.facebook.com/gaming/` | Você escolhe o jogo. |
| Messenger | `https://www.facebook.com/messages/` | Você escolhe o amigo e envia a saudação sugerida. |

### Metas assistidas

| Meta | Comportamento |
|------|---------------|
| Curtidas | Sorteia uma meta (ex.: 7). Você curte manualmente e registra. Ao atingir: "Meta de curtidas concluída." |
| Solicitações de amizade | Sorteia uma meta (ex.: 3). Você envia manualmente e registra. |
| Mensagens | Sorteia uma meta (ex.: 2). O botão **Sugerir saudação** sorteia uma das 50 saudações do banco (mais as suas, cadastradas nas opções) e copia o texto. Você cola no Messenger, envia e registra. A extensão nunca envia mensagens sozinha. |

---

## Estrutura do projeto

```
facebook-session-assistant/
├── manifest.json        Manifest V3, permissões mínimas
├── background.js        Service worker: sessão, etapas, alarmes, abas, notificações
├── popup.html/css/js    Painel principal (400px): configuração, sessão, histórico
├── options.html/css/js  Página de opções: perfis, preferências, histórico completo, reset
├── content.js/css       Content script: widget flutuante, rolagem do Feed, detecção de login
├── icons/               icon16/32/48/128.png
├── utils/
│   ├── constants.js     Nome da extensão, atividades, padrões, chaves de storage
│   ├── random.js        randomBetween, shuffle, randomChoice
│   ├── storage.js       Acesso a chrome.storage.local, perfis, validação, histórico
│   ├── session.js       Funções puras: gerar sessão, calcular resumo
│   ├── timer.js         Conversões e formatação de tempo
│   └── logger.js        Logs com prefixo, desligáveis nas opções
└── README.md
```

### Alterar o nome da extensão

- Nome exibido pelo Chrome: `manifest.json` → campos `name`, `short_name` e `action.default_title`.
- Nome exibido na interface: `utils/constants.js` → `APP_NAME` (e a constante de mesmo nome no topo de `content.js`).

---

## Como funciona por dentro

- **Cronômetros por timestamp.** Cada etapa salva `deadline` (prazo absoluto), `elapsedMs` e `remainingMs`. O popup e o widget apenas recalculam `deadline - agora`. Fechar o popup não interrompe nada.
- **chrome.alarms.** Um alarme é criado para o fim de cada etapa (`fsa-step-end`) e de cada pausa (`fsa-pause-end`). Um alarme periódico de vigilância (`fsa-watchdog`, a cada 30 s) confere se algum prazo venceu, caso o service worker tenha sido encerrado. Timers locais complementam a precisão enquanto o worker está vivo.
- **Restauração.** Ao reiniciar o Chrome ou recarregar a extensão, `restoreSession()` lê a sessão salva, recria os alarmes e avança etapas cujo prazo venceu. Nunca inicia uma sessão nova sozinha.
- **Fila de mutações.** Todas as alterações de sessão passam por uma fila serial, evitando condições de corrida entre alarme, popup e content script.
- **Modo de tempo total.** `distributeTotalMinutes()` em `utils/session.js` divide o total em segundos pelos pesos (método do maior resto), de modo que a soma das etapas é exatamente o total escolhido. As pausas entre etapas ficam fora desse total.
- **Repetição automática.** O agendador (`scheduler` no storage) é ativado quando você inicia uma sessão com a opção ligada. Ao fim de cada sessão (por tempo esgotado ou pelo botão Finalizar), o intervalo é definido (fixo ou sorteado), o alarme `fsa-auto-next` é criado e uma faixa verde no topo do painel mostra a contagem regressiva com os botões **Iniciar agora** e **Parar**. Sessões iniciadas assim aparecem no histórico com a marca "automática". Se o navegador for reaberto com o horário já vencido, a próxima sessão começa em 1 minuto. Se o alarme disparar com uma sessão manual em andamento, ele é ignorado e a próxima é agendada quando ela terminar.
- **Perfis.** Três perfis (`Perfil 1/2/3`) com configurações independentes. Troque o perfil ativo na página de opções. A estrutura permite adicionar mais perfis depois.
- **Rolagem do Feed.** O content script rola a página com distâncias, velocidades e pausas de leitura sorteadas, às vezes volta um pouco, e pausa por alguns segundos sempre que você usa mouse, teclado ou toque. Não há mecanismo de contorno de sistemas da plataforma.

### Dados salvos (`chrome.storage.local`)

```json
{
  "schemaVersion": 1,
  "activeProfileId": "profile-1",
  "profiles": {
    "profile-1": {
      "id": "profile-1",
      "name": "Perfil 1",
      "settings": {
        "autoRepeat": { "enabled": false, "mode": "fixed", "minutes": 60, "min": 60, "max": 90 },
        "durationMode": "random",
        "totalMinutes": 10,
        "feed":    { "enabled": true, "min": 1, "max": 15, "weight": 30, "autoScroll": true },
        "reels":   { "enabled": true, "min": 2, "max": 10, "weight": 25 },
        "videos":  { "enabled": true, "min": 2, "max": 8, "weight": 20 },
        "lives":   { "enabled": true, "min": 3, "max": 10, "weight": 15 },
        "games":   { "enabled": true, "min": 2, "max": 5, "weight": 10 },
        "messenger": { "enabled": true, "min": 2, "max": 5, "weight": 10 },
        "likes":   { "enabled": true, "min": 5, "max": 10 },
        "friends": { "enabled": true, "min": 1, "max": 3 },
        "messages": { "enabled": true, "min": 1, "max": 3 },
        "shuffle": true,
        "pauses":  { "enabled": true, "min": 10, "max": 60 }
      }
    }
  },
  "session": null,
  "history": [],
  "prefs": { "notifications": true, "overlay": true, "debugLogs": true, "customGreetings": [] }
}
```

---

## Permissões

| Permissão | Uso |
|-----------|-----|
| `storage` | Salvar configurações, sessão e histórico localmente. |
| `alarms` | Cronômetros independentes do popup. |
| `notifications` | Avisos de etapa concluída, próxima atividade e sessão finalizada. |
| `tabs` | Abrir/reutilizar a aba da sessão e detectar quando ela é fechada. |
| `host_permissions` (facebook.com) | Executar o content script (widget, rolagem do Feed e detecção de login) apenas em páginas do Facebook. |

---

## Tratamento de erros

| Situação | Comportamento |
|----------|---------------|
| Aba da sessão fechada | Cronômetro continua; o painel mostra aviso e botão **Reabrir aba**. A próxima etapa abre em nova aba. |
| Usuário não autenticado | O content script detecta a tela de login; painel e widget avisam; notificação é enviada. |
| Navegador reiniciado | A sessão é restaurada com etapa, tempo, progresso e contadores. A repetição automática, se ativa, é rearmada. |
| Service worker encerrado | Alarmes acordam o worker; o alarme de vigilância cobre atrasos. |
| Dados corrompidos | Perfis, histórico e sessão inválidos são substituídos pelos padrões com aviso no console. |
| Valores inválidos | Mínimo > máximo, negativos ou vazios são bloqueados com mensagem no formulário. Tempo máximo 0 é permitido e significa "não executar"; se todas as atividades marcadas estiverem em 0, o painel avisa. |
| Falha ao abrir página | Aviso no painel com opção de reabrir. |

---

## Logs

Mensagens com prefixo `[Session Assistant]` aparecem no console do service worker (chrome://extensions → **Service worker**), do popup e da página do Facebook. Desative em **Opções → Registrar logs de desenvolvimento**. Erros são sempre exibidos.

---

## Observações

- Pausas menores que 30 segundos podem ser arredondadas pelo Chrome em extensões empacotadas (limite mínimo de `chrome.alarms`). Em modo desenvolvedor (sem compactação) o limite não se aplica. O timer local do service worker e o alarme de vigilância reduzem esse efeito.
- As URLs das seções do Facebook ficam em `utils/constants.js` e podem ser ajustadas se a plataforma mudar os caminhos.
- Use a extensão de forma responsável e de acordo com os Termos de Serviço do Facebook.
