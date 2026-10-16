# Redirect Automático por RPS

Redirecionador que troca o destino a cada 30 minutos, apontando sempre para o artigo com maior RPS no momento.

## Objetivo

Um site de entrada (ex.: `chatvito.com`) recebe o tráfego e redireciona para um artigo. A cada 30 minutos um bot consulta o RPS de uma lista de URLs e troca o destino do redirect para a URL com maior RPS.

## Como funciona

1. Tenho uma lista de 10 ou mais URLs (artigos monetizados com Google AdSense).
2. A cada 30 minutos o bot consulta o RPS de cada URL via API.
3. O bot escolhe a URL com maior RPS.
4. O bot atualiza o redirecionador do site de entrada para apontar para essa URL.
5. Todo visitante que chegar nos próximos 30 minutos vai para o artigo escolhido.

## Exemplo

| Hora  | Consulta                       | Ação                               |
|-------|--------------------------------|------------------------------------|
| 10:00 | Artigo 01 tem RPS 100 (maior)  | chatvito.com -> artigo 01          |
| 10:30 | Artigo 02 tem RPS 130 (maior)  | chatvito.com -> artigo 02          |
| 11:00 | Artigo 02 continua maior       | nada muda                          |
| 11:30 | Artigo 05 tem RPS 150 (maior)  | chatvito.com -> artigo 05          |

## Componentes

### 1. Lista de URLs

Planilha (Google Sheets) ou tabela simples com as URLs candidatas.

| id | url                                  | ativo |
|----|--------------------------------------|-------|
| 1  | https://site.com/artigo-01           | sim   |
| 2  | https://site.com/artigo-02           | sim   |
| 3  | https://site.com/artigo-03           | sim   |
| …  | …                                    | …     |

Pode ter 10 URLs ou mais. Só as marcadas como `ativo = sim` entram na disputa.

### 2. API de RPS

Fonte do valor de RPS de cada URL. Opções:

- Google AdSense Management API (relatório por página / URL).
- API própria que já consolida a receita por URL.

O bot chama a API uma vez a cada 30 minutos e recebe algo como:

```json
[
  { "url": "https://site.com/artigo-01", "rps": 100 },
  { "url": "https://site.com/artigo-02", "rps": 130 },
  { "url": "https://site.com/artigo-03", "rps": 80 }
]
```

### 3. Bot / Agente

Processo agendado (cron, GitHub Actions, Cloud Scheduler, n8n ou similar) rodando a cada 30 minutos:

```
a cada 30 min:
  urls      = ler lista de URLs ativas
  rps       = consultar API de RPS para cada URL
  vencedora = url com maior rps
  se vencedora != destino atual:
    atualizar redirect do site de entrada para vencedora
  registrar log (hora, rps de cada url, vencedora)
```

Regras:

- Só troca uma vez a cada 30 minutos, nunca no meio do intervalo.
- Se a API falhar, mantém o destino atual.
- Em caso de empate, mantém o destino atual.

### 4. Redirecionador

O site de entrada (ex.: ChatVito) faz um redirect 302 para o destino atual.

O destino fica em um lugar que o bot consegue alterar por request:

- Variável/arquivo no servidor atualizado por um endpoint `POST /redirect` protegido por token, ou
- Serviço de redirect (Cloudflare Redirect Rules, Vercel, Netlify) atualizado via API, ou
- Linha em uma planilha que o site lê.

Exemplo de endpoint:

```
POST /redirect
Authorization: Bearer <TOKEN>
{ "destino": "https://site.com/artigo-02" }
```

```
GET /
-> 302 Location: https://site.com/artigo-02
```

## Fluxo resumido

```
Visitante -> chatvito.com -> 302 -> artigo com maior RPS
                 ^
                 |  atualiza a cada 30 min
                 |
               Bot -> API de RPS -> escolhe maior -> POST /redirect
```

## O que precisa ser definido

- [ ] Onde ficam as URLs (planilha ou tabela).
- [ ] Qual API fornece o RPS e com qual credencial.
- [ ] Onde o redirecionador roda e como o bot altera o destino.
- [ ] Onde o bot roda (cron, GitHub Actions, n8n, etc.).
- [ ] Onde ficam os logs das trocas.

## Exemplo pronto (pasta `redirect-rps/`)

| Arquivo        | O que faz                                                                 |
|----------------|---------------------------------------------------------------------------|
| `urls.json`    | Lista das URLs candidatas (`ativo: true` entra na disputa).               |
| `redirect.js`  | Redirecionador do site de entrada. `GET /` faz 302, `POST /redirect` troca o destino. |
| `bot.js`       | Consulta sua API de RPS a cada 30 min e troca o destino para a maior.     |
| `mock-api.js`  | API falsa de RPS para testar local. Troque pela sua API real.             |

### Contrato esperado da sua API de RPS

O bot envia:

```
POST {RPS_API_URL}
Authorization: Bearer {RPS_API_KEY}
{ "urls": ["https://meusite.com/artigo-01", "https://meusite.com/artigo-02"] }
```

E espera receber:

```json
[
  { "url": "https://meusite.com/artigo-01", "rps": 100 },
  { "url": "https://meusite.com/artigo-02", "rps": 130 }
]
```

Se sua API usa outro formato, ajuste só a função `consultarRps` em `bot.js`.

### Rodando local

```bash
# terminal 1: API falsa de RPS
node redirect-rps/mock-api.js

# terminal 2: redirecionador (porta 4000)
REDIRECT_TOKEN=meu-token node redirect-rps/redirect.js

# terminal 3: bot
RPS_API_URL=http://localhost:5000 REDIRECT_URL=http://localhost:4000 REDIRECT_TOKEN=meu-token node redirect-rps/bot.js
```

Saída do bot:

```
[2026-10-16T15:14:15Z] RPS:
    187.47  https://meusite.com/artigo-08
    160.98  https://meusite.com/artigo-03
    127.00  https://meusite.com/artigo-05
[2026-10-16T15:14:15Z] TROCA: https://meusite.com/artigo-09 -> https://meusite.com/artigo-08 (RPS 187.47)
```

Conferindo o redirecionador:

```bash
curl -I http://localhost:4000/
# HTTP/1.1 302 Found
# Location: https://meusite.com/artigo-08
```

### Em produção

- `redirect.js` roda no domínio de entrada (ex.: chatvito.com).
- `bot.js` roda em qualquer servidor com as variáveis `RPS_API_URL`, `RPS_API_KEY`, `REDIRECT_URL` e `REDIRECT_TOKEN`.
- Como alternativa ao `setInterval`, rode o bot uma vez por execução via cron a cada 30 min.
