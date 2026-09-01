# Criador de Páginas do Facebook — Extensão do Chrome

Extensão (Manifest V3) que cria **uma** Página no Facebook por clique, de forma automática:

1. Você clica no ícone da extensão → abre um popup com o botão **Criar página**.
2. Ao clicar, a extensão **abre a aba** `facebook.com/pages/creation` e faz tudo sozinha:
   - preenche um **nome aleatório** (nomes de mulher, em inglês — ex.: "Emma Carter");
   - vai na **categoria**, digita uma **letra aleatória** e seleciona a **primeira opção** da lista (assim não repete);
   - clica em **Criar Página**.

Um aviso no canto inferior direito da aba mostra o nome gerado, a categoria e se deu certo.

## Instalar (modo desenvolvedor)

1. Baixe/clone esta pasta `extensao-chrome` para o seu computador.
2. No Chrome, abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `extensao-chrome`.
5. O ícone da extensão aparece na barra. (Clique no quebra-cabeça e fixe-a, se quiser.)

## Usar

1. Esteja **logado no Facebook** no Chrome.
2. Clique no ícone da extensão → **Criar página**.
3. Uma aba abre e a página é criada automaticamente.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `manifest.json` | Configuração da extensão (MV3), permissões e páginas onde roda. |
| `popup.html` / `popup.js` | Interface do popup com o botão "Criar página". |
| `background.js` | Service worker: marca o pedido e abre a aba de criação. |
| `content.js` | Automação executada na página do Facebook (nome, categoria, criar). |
| `icons/` | Ícones da extensão (16/48/128). |

## Personalizar

- **Nomes:** edite as listas `PRIMEIROS` e `SOBRENOMES` no topo de `content.js`.
  Por padrão são nomes femininos americanos comuns e sempre saem em duas palavras
  (nome + sobrenome).
- **Palavras bloqueadas:** se o Facebook recusar algum nome, adicione a palavra
  (em minúsculas) na lista `PALAVRAS_BLOQUEADAS` em `content.js`. Qualquer nome que
  contenha uma dessas palavras é descartado e outro é sorteado.
- **Tempo de espera:** ajuste `TIMEOUT` em `content.js`.

## Observações

- Cria **uma** página por clique (é o comportamento desta primeira versão).
- O próprio Facebook limita criações em sequência e pode mostrar
  "An error occurred while creating the page" — isso vem do Facebook, não da extensão.
- Feita para o layout atual de `facebook.com/pages/creation`; se o Facebook mudar a tela,
  os seletores podem precisar de ajuste.
- Use de acordo com as políticas do Facebook.
