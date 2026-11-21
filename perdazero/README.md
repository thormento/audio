# Perdazero — Monitor de Perda de Dinheiro (v1)

> “Veja o que você está deixando de usar e onde está gastando demais.”

PWA mobile-first, sem build e sem backend. Os dados ficam só no aparelho (`localStorage`), sem conta e sem conexão bancária.

## Rodar

```bash
cd perdazero
python3 -m http.server 5173   # ou: npm start
# abra http://localhost:5173
npm test                      # testes do motor de análise (node:test)
```

Para publicar, sirva a pasta como site estático (Netlify, Vercel, GitHub Pages, Cloudflare Pages). Notificações e instalação como app exigem HTTPS.

## Telas (seguem o documento de produto)

| Rota | Tela |
|---|---|
| `#/onboarding/1..4` | Promessa, Como funciona, O que você recebe, Notificações (opcional) |
| `#/cadastro` | Cadastro rápido: foto/print, perguntas rápidas, digitar manualmente |
| `#/cadastro/foto` | Câmera/galeria com OCR no aparelho (tesseract.js via CDN); preenche o formulário para conferência |
| `#/cadastro/perguntas` | 3 a 4 perguntas: categoria, nome, valor/frequência e uso |
| `#/cadastro/manual`, `#/item/:id/editar` | Formulário com campos por categoria, editar e remover |
| `#/` | Home: total R$/mês, “Deixando de usar”, “Gastando demais”, todos os itens (vermelho/amarelo/verde), estados vazios, botão + Adicionar |
| `#/perda/:id/:achado` | Detalhe: perda/mês, valor anual, motivo; Como resolver, Ignorar por agora (30 dias), Editar dados |
| `#/resolver/:id/:achado` | Passo a passo (até 5 passos) + links; “Já resolvi” tira o achado das perdas ativas |
| `#/avisos` | Somente achados concretos, em ordem cronológica, com opção de marcar como lido |
| `#/perfil` | Itens cadastrados, ativar/desativar avisos, sobre, apagar dados |

## Regras de análise (`engine.js`)

Todos os valores são estimativas. As referências ficam no topo do arquivo e podem ser ajustadas.

| Categoria | Deixando de usar | Gastando demais |
|---|---|---|
| Assinaturas | ≥30 dias sem uso → 100% do valor; 15–29 dias → 50% | — |
| Contas | — | >15% acima da referência por pessoa (energia R$ 60/pessoa, água R$ 35, internet R$ 110, telefone R$ 55/linha); reajuste >10% contra a conta anterior |
| Cartão | Pontos vencendo em ≤90 dias (R$ 0,02/ponto, valor “em risco”) | Anuidade |
| Banco | — | Qualquer tarifa de pacote (serviços essenciais são gratuitos) |
| Saúde | — | Reajuste acima do teto da ANS (individual; constante `ANS_CAP`, atualizar todo ano) ou >15% (coletivo); sem uso em 12 meses → ~30% |
| Benefícios/FGTS | Benefício não ativado; FGTS ou valores a receber não resgatados | — |
| Outros | Uso “nunca” → 100%; “raramente” → 50% | — |

Toda perda tem um “Como resolver” (há teste garantindo isso). Avisos são gerados apenas para achados `concrete`.

## Limitações da v1

- **Push:** as notificações são locais, disparadas quando o app é aberto e surge um aviso novo. Push com o app fechado exige backend (Web Push), fora do escopo.
- **OCR:** extração básica de valor, nome do serviço, pontos e validade. Sempre abre o formulário para conferência. PDF não é lido: envie um print.
- **Dados:** ficam só no navegador. Limpar os dados do site apaga tudo.
