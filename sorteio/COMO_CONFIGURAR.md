# Como colocar o sorteio no ar

O sistema tem três arquivos:

| Arquivo | Para que serve |
| --- | --- |
| `sorteio.html` | Página pública de cadastro e painel de sorteio (o mesmo arquivo, o painel abre com `?painel`). |
| `apps-script.gs` | Backend gratuito no Google Apps Script. Grava os cadastros numa planilha do Google Sheets. |
| `COMO_CONFIGURAR.md` | Este guia. |

Tempo estimado: 15 minutos.

## 1. Criar a planilha e colar o script

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma planilha nova. Dê um nome, por exemplo "Sorteio iPhone".
2. No menu da planilha, abra **Extensões > Apps Script**.
3. Apague o conteúdo do editor e cole todo o código de `apps-script.gs`.
4. No topo do código, troque a senha:

   ```js
   const SENHA_PAINEL = 'troque-esta-senha';
   ```

   Use uma senha longa e que ninguém adivinhe. Essa senha fica só no script, nunca no HTML.
5. Salve com o ícone de disquete ou Ctrl+S.

A aba `Participantes` com as colunas `Data | Nome | Instagram` é criada sozinha no primeiro cadastro. Não precisa criar nada na planilha.

## 2. Publicar como App da Web

1. No editor do Apps Script, clique em **Implantar > Nova implantação**.
2. Clique na engrenagem ao lado de "Selecionar tipo" e escolha **App da Web**.
3. Preencha:
   - Descrição: qualquer texto, por exemplo "Sorteio v1".
   - **Executar como: Eu** (sua conta).
   - **Quem pode acessar: Qualquer pessoa**.
4. Clique em **Implantar**.
5. O Google vai pedir autorização. Clique em "Autorizar acesso", escolha sua conta, e se aparecer "O Google não verificou este app", clique em **Avançado > Acessar (nome do projeto)**. Isso é normal para scripts pessoais.
6. Copie a **URL do app da Web**. Ela termina em `/exec`.

Para testar, abra essa URL no navegador. Deve aparecer `{"ok":true,"status":"online"}`.

**Atenção ao editar o script depois de publicado:** a URL continua rodando a versão antiga até você criar uma versão nova. Para atualizar, vá em **Implantar > Gerenciar implantações**, clique no lápis, em "Versão" escolha **Nova versão** e clique em **Implantar**. A URL não muda.

## 3. Configurar o HTML

Abra `sorteio.html` num editor de texto e localize o bloco `CONFIG` no início do `<script>`:

```js
const CONFIG = {
  API_URL: "",                 // cole aqui a URL /exec
  ORGANIZADOR: "Sorteio oficial @seuperfil",
  PREMIO: "iPhone 16 128GB",
  DESCRICAO: "Cadastre seu nome e seu @ do Instagram para concorrer. O resultado sai ao vivo no nosso perfil.",
  ENCERRA_EM: "Inscrições até 30/09/2026 às 20h",
  TEXTO_ACEITE: "Li e aceito as regras do sorteio.",
  LINK_REGRAS: "",             // opcional, transforma o texto de aceite em link
  PEDIR_INSTAGRAM: true,
  INSTAGRAM_OBRIGATORIO: true,
  INSCRICOES_ABERTAS: true     // false desativa o botão com "Inscrições encerradas"
};
```

1. Cole a URL `/exec` em `API_URL`, entre as aspas.
2. Ajuste organizador, prêmio, descrição, data de encerramento e texto de aceite.
3. Se tiver uma página com o regulamento, coloque o endereço em `LINK_REGRAS`.

Enquanto `API_URL` estiver vazio, a página roda em **modo teste**: os cadastros ficam só no navegador, qualquer senha entra no painel e aparece o botão "Gerar 40 de teste". Use isso para ensaiar o sorteio antes de publicar.

## 4. Publicar a página

Escolha uma das opções:

- **Servidor ou hospedagem comum:** envie `sorteio.html` para a pasta pública do site (por FTP, painel da hospedagem, Netlify, Vercel, GitHub Pages, etc.).
- **WordPress:** crie uma página nova, adicione um bloco **HTML personalizado** e cole o conteúdo inteiro de `sorteio.html`. Alguns temas limitam a largura do conteúdo, então prefira um modelo de página em branco ou de largura total se houver.

Os links ficam assim:

- Cadastro (divulgue este): `https://seusite.com/sorteio.html`
- Painel (só para você): `https://seusite.com/sorteio.html?painel`

Ninguém consegue entrar no painel sem a senha, e a senha não está no HTML. Ainda assim, não divulgue o link do painel.

Teste o cadastro em um celular: preencha nome e @, marque o aceite e confira se a linha apareceu na planilha e se a tela mostrou o número da sorte.

## 5. No dia do sorteio

1. **Feche as inscrições** nos dois lugares:
   - No `sorteio.html`, troque `INSCRICOES_ABERTAS` para `false` e envie o arquivo de novo. O botão passa a mostrar "Inscrições encerradas".
   - No Apps Script, troque `INSCRICOES_ABERTAS` para `false`, salve e crie uma nova versão em "Gerenciar implantações". Assim nenhum cadastro entra pela API, mesmo que alguém use uma página antiga em cache.
2. Abra `seusite.com/sorteio.html?painel`, digite a senha e clique em "Entrar".
3. Clique em **Atualizar lista** e confira o total de participantes.
4. Em "Regras do sorteio", defina o número de ganhadores e confira se "Uma chance por @" está marcado.
5. Comece a gravar a tela (ou faça uma live) e clique em **Sortear ganhador**. Depois dos ganhadores, os próximos sorteios viram suplentes automaticamente.
6. Ao terminar, clique em **Baixar resultado** e guarde o CSV como prova do sorteio. Se quiser, baixe também o CSV da lista de participantes.

O resultado fica salvo no navegador. Se a página recarregar sem querer, os sorteados continuam lá. Para um sorteio novo, use "Recomeçar".

## Dúvidas comuns

**A página mostra "Sem conexão com o servidor".**
Confira se a URL em `API_URL` termina em `/exec`, se a implantação está com acesso "Qualquer pessoa" e se você criou uma nova versão depois da última edição.

**O painel diz "Senha incorreta" com a senha certa.**
A senha é a que está no Apps Script publicado. Se você trocou a senha e não criou uma nova versão, a URL ainda usa a senha antiga.

**Quero permitir cadastro sem Instagram.**
Troque `INSTAGRAM_OBRIGATORIO` para `false`. Para esconder o campo por completo, troque `PEDIR_INSTAGRAM` para `false`. Nesse caso a regra "Uma chance por @" passa a remover duplicados pelo nome.

**Como o sorteio escolhe o ganhador?**
O painel usa o gerador de números aleatórios seguro do navegador (`crypto.getRandomValues`) com rejeição de viés. O vencedor é escolhido antes da animação, e a roleta é só uma apresentação visual.
