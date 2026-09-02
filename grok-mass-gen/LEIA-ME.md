# Grok Imagine Mass Gen

Extensão Chrome (Manifest V3) que automatiza, na sua própria conta, a geração em massa a partir de uma lista de prompts e o download em massa dos resultados no Grok Imagine (grok.com/imagine). Ela apenas repete os cliques que você faria manualmente, sem burlar nenhum limite da plataforma.

## Instalação

1. Baixe o arquivo `grok-mass-gen.zip` e extraia em uma pasta permanente (o Chrome carrega a extensão direto dessa pasta, então não apague depois).
2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo do desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** e selecione a pasta `grok-mass-gen` (a pasta que contém o `manifest.json`).
5. Abra ou recarregue `https://grok.com/imagine`. O painel escuro aparece no canto superior direito.

Para atualizar a extensão depois de trocar os arquivos, clique no ícone de recarregar do card dela em `chrome://extensions` e recarregue a aba do Grok.

## O painel

- **Arrastar**: segure o cabeçalho e arraste. A posição fica salva.
- **Minimizar**: botão de traço no cabeçalho. O X esconde o painel.
- **Alt+G**: mostra ou esconde o painel a qualquer momento.
- **Contadores** no cabeçalho: prompts enviados e arquivos baixados na sessão atual (zeram ao recarregar a página).

Todos os campos são salvos automaticamente em `chrome.storage.local`, então prompts e configurações sobrevivem a recarregar a página.

## Fila de geração

1. Cole os prompts na caixa de texto, um por linha. Linhas vazias são ignoradas. Ou use **Importar TXT/CSV** (no CSV é usada a primeira coluna, um cabeçalho chamado `prompt` é ignorado).
2. Na página do Grok, escolha manualmente as configurações que quer usar (Vídeo ou Imagem, resolução, duração, proporção). A extensão não mexe nesses botões, só no campo de texto e no enviar.
3. Escolha o **modo de espera**:
   - **Intervalo fixo**: espera N segundos entre um envio e outro (mínimo 3, padrão 45).
   - **Detectar conclusão**: usa um `MutationObserver` para perceber quando um novo vídeo ou imagem aparece na página depois do envio. Assim que detecta, espera o "Delay após detectar" (padrão 5s) e envia o próximo. Se estourar o "Timeout máximo" (padrão 120s), cai no intervalo fixo como fallback.
4. Clique em **Iniciar fila**. A barra de progresso, o status e o log mostram o andamento. **Parar** interrompe de forma limpa ao final do passo atual.

### Retry e limite

- Se o campo ou o botão de enviar não forem encontrados, a extensão tenta de novo 3 vezes, esperando 5s, 15s e 30s. Se ainda assim falhar, pula o prompt e registra no log e no relatório.
- Se, logo após um envio, aparecer na página um aviso com "limit", "limite", "try again" ou "tente novamente", a fila pausa por 5 minutos automaticamente, depois reenvia o mesmo prompt.

### Retomar de onde parou

O índice do último prompt enviado fica salvo. Se a página recarregar no meio da fila, o painel mostra a caixa **Retomar de onde parou**. Clique nela para continuar do próximo prompt, ou em **Descartar** para esquecer o progresso.

### Modo teste

Marque **Simular (não enviar)** para percorrer a fila fazendo tudo (localizar campo, preencher, localizar botão) menos o clique final. Use isso para validar os seletores antes de rodar de verdade. O botão **Testar seletores** em Avançado também destaca na tela o campo (azul) e o botão (verde) encontrados.

## Download em massa

**Baixar tudo da página** coleta:

- todos os elementos `video` (src, currentSrc e `source` internos);
- links `a[href*='.mp4']`;
- se a opção "Incluir imagens" estiver marcada, imagens com largura natural de pelo menos 300px (ignora ícones e avatares).

As URLs são deduplicadas e as já baixadas na sessão são ignoradas, então clicar duas vezes seguidas não gera arquivo repetido. Arquivos http(s) são salvos pelo Chrome em `Downloads/grok-imagine/` com o nome `prefixo_data-hora_numero.extensao`. Se o nome já existir, o Chrome adiciona um sufixo numérico.

URLs `blob:` (vídeos que o site monta em memória) são lidas na própria página e salvas com um link de download, por isso caem na pasta padrão de Downloads, e não na subpasta `grok-imagine`.

### Download automático por prompt

Com o modo **Detectar conclusão** e a opção **Baixar automaticamente cada mídia gerada** marcados, cada mídia nova detectada depois de um envio é baixada na hora com o nome `prefixo_numero_slug-do-prompt.extensao`. O slug são as primeiras 40 letras do prompt, sem acentos ou caracteres especiais. Quando um prompt gera várias imagens (o Grok gera 4 por vez em modo Imagem), cada uma recebe um sufixo `_1`, `_2`, e assim por diante.

Observações sobre a detecção:

- O Grok mostra os resultados primeiro como tiles borrados e depois troca pela mídia final. A extensão espera o `src` estabilizar antes de baixar. Se ainda vier borrado, aumente o "Delay após detectar".
- A grade de resultados carrega mais itens antigos quando você rola a página. Evite rolar durante a fila em modo detecção, senão um item antigo pode ser confundido com uma geração nova.
- "Carência da detecção" (em Avançado, padrão 8s) ignora mídias que aparecem logo após o envio, como a troca de tela para a página do projeto.
- Em "Mídia esperada", escolha Vídeo ou Imagem conforme o modo selecionado no Grok. Isso evita detectar a miniatura de um vídeo como resultado.
- As imagens da grade são as versões que a página renderiza. Para a resolução máxima, abra a imagem no Grok e use o download do próprio site.

## Relatório

Ao final da fila (ou depois de parar), **Exportar relatório CSV** salva um arquivo com as colunas `prompt, status, horario, arquivo`. Os status possíveis são `enviado`, `falhou` (limite detectado ou timeout sem mídia), `pulado` (não conseguiu enviar após as tentativas) e `simulado`.

## Seletores personalizados

Em **Avançado** há dois campos para seletores CSS: o do campo de prompt e o do botão de enviar. Quando preenchidos, têm prioridade sobre a heurística automática. Deixe vazios para usar a detecção automática:

- campo: `textarea` ou `input` com placeholder contendo "imagin", depois `contenteditable` com `data-placeholder` ou `aria-label` contendo "imagin", depois o primeiro `textarea` visível;
- botão: até 6 níveis acima do campo, um `button` visível com aria-label ou texto contendo submit, send, enviar, generate ou gerar, depois `type=submit`, depois o último botão do container. Se nada for encontrado, a extensão simula a tecla Enter no campo.

Como o Grok é uma SPA em React que muda o HTML com frequência, se a heurística parar de funcionar, abra o DevTools (F12), inspecione o campo e o botão, e cole seletores estáveis nesses campos. Use **Testar seletores** para conferir.

## Estrutura dos arquivos

```
grok-mass-gen/
├── manifest.json   Manifest V3, permissões downloads e storage
├── background.js   Service worker que chama chrome.downloads
├── content.js      Painel injetado e toda a lógica
├── panel.css       Estilo do painel (prefixo gmg-)
└── LEIA-ME.md      Este arquivo
```

## Cuidados

- Respeite os limites da sua conta. O intervalo mínimo entre envios é de 3 segundos e não pode ser reduzido.
- A extensão só roda em `grok.com` e subdomínios.
- Nenhum dado sai do seu navegador. Os prompts e configurações ficam apenas no `chrome.storage.local` da extensão.
