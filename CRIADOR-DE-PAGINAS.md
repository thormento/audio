# Criador de Páginas do Facebook (macro)

Macro de navegador que automatiza a criação de uma Página no Facebook, exatamente como no passo a passo do vídeo:

1. Gera um **nome de página aleatório**.
2. Vai no campo **Categoria**, digita **uma letra aleatória** e seleciona a **primeira opção** que aparece.
3. Clica em **Criar Página**.

O arquivo é um **userscript** (`facebook-criar-paginas.user.js`), então roda dentro da sua sessão já logada no Facebook — não precisa de senha, token nem servidor.

## Instalação

1. Instale a extensão **Tampermonkey** (Chrome, Edge, Brave, Firefox) ou **Violentmonkey**.
2. Abra o painel da extensão → **Criar novo script**.
3. Apague o conteúdo padrão, cole todo o conteúdo de `facebook-criar-paginas.user.js` e salve (Ctrl+S).

> Alternativa: arraste o arquivo `facebook-criar-paginas.user.js` para a aba de extensões do Tampermonkey.

## Como usar

1. Acesse **https://www.facebook.com/pages/creation** já logado.
2. Um botão flutuante **"Criar página (macro)"** aparece no canto inferior direito.
3. Clique no botão (ou use o atalho **Alt + C**). A macro preenche nome, categoria e clica em Criar.

O status da execução (nome gerado, categoria escolhida, sucesso ou erro) aparece abaixo do botão.

## Configuração

No topo do arquivo, no bloco `CONFIGURAÇÃO`:

- `TECLA_ATALHO` — combinação de teclas que dispara a macro (padrão `Alt + C`).
- `AUTO_EXECUTAR` — se `true`, dispara sozinho ao carregar a página de criação. Padrão `false`.
- `TIMEOUT` — tempo máximo de espera por cada elemento da tela, em milissegundos.

Você também pode editar as listas `PREFIXOS` e `SUFIXOS` para mudar o estilo dos nomes gerados (por padrão sai algo como "alem portal", "nova store", "mundo news").

## Observações

- O script foi feito para o layout atual de `facebook.com/pages/creation`. Se o Facebook mudar a tela, pode ser necessário ajustar os seletores.
- Cada acionamento cria **uma** página (é o que o fluxo do vídeo faz). Para criar várias, repita o acionamento — lembrando que o próprio Facebook limita criações em sequência e pode exibir "An error occurred while creating the page".
- Use com responsabilidade e de acordo com as políticas do Facebook.
