# Central Curioso

Site interno para estudo de concorrentes, organizado por **rede** (categoria) e por **projeto** (Facebook, Google, Chatbot).

## Rodar

```bash
cd central-curioso
node server.js      # http://localhost:3100
```

Sem dependências (Node 18+). Os dados ficam em `data/central.json`.

## Como funciona

- **Redes** (`#/`): lista de redes (Active, Join, Sites, ...). Clique numa rede para ver todos os clientes dela.
- **Rede › Projeto** (`#/rede/active/facebook`): mostra só quem está rodando aquele projeto dentro da rede. As abas Facebook / Google / Chatbot filtram.
- **Cliente** (`#/cliente/4adsa`): ficha com site, rede, notas e, por projeto, se está rodando, link do anúncio encontrado e observações. No Chatbot você cadastra as copys por página.
- **Busca** no topo: encontra rede ou cliente pelo nome/site.

Cada cliente tem, por projeto, um status (Rodando, Parou, Não verificado), data da última verificação, link do anúncio, observações e a lista de **ofertas encontradas**. O painel mostra onde cada concorrente está investindo e as ofertas mais recentes.

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api` | tudo (projetos, redes, clientes) |
| POST | `/api/redes` | cria rede `{nome}` |
| PUT/DELETE | `/api/redes/:id` | renomeia / apaga rede (e seus clientes) |
| POST | `/api/clientes` | cria cliente `{nome, site, redeId, projetos?}` |
| PUT/DELETE | `/api/clientes/:id` | atualiza / apaga cliente |
