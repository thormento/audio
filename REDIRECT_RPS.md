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
