# Gerador Interno de Imagens e Vídeos

Ferramenta interna (sem login/planos/créditos) para gerar imagens e vídeos em lote com IA, com narração, legenda, referências, download em ZIP e histórico. Tela única: painel de configuração à esquerda, resultados à direita.

## Requisitos

- Node.js 18+
- **ffmpeg** instalado no sistema (necessário para narração, legenda, thumbnail local e vídeo como referência)

## Instalação e configuração

```bash
npm install
export FAL_KEY=sua_chave_fal                               # obrigatória — só no backend
export CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD_NAME   # ou as 3 variáveis abaixo
# CLOUDINARY_CLOUD_NAME= / CLOUDINARY_API_KEY= / CLOUDINARY_API_SECRET=
npm start   # http://localhost:3000
```

Sem Cloudinary o sistema funciona com armazenamento local em `data/files` (servido em `/files`). Com Cloudinary, os arquivos vão para `generated/{images,videos,audio}` e `references/{images,videos}`, com thumbnails por transformação de URL. Nenhuma chave chega ao frontend.

## Funcionalidades

- **Geração em lote** com `batchId`: cada item é um job independente com status próprio (`queued → generating → processing → completed | error`) e "Tentar novamente" individual; um erro não cancela o restante.
- **Modelos** vêm da configuração central `models.config.js` (formatos, durações, referências e opções avançadas por modelo — a interface só mostra o que o modelo suporta). Para adicionar modelo, edite só esse arquivo, conferindo o schema em `https://fal.ai/models/<endpoint>/api`.
- **Referência**: upload de imagem ou vídeo, ou reutilizar uma geração (sem novo upload). Image→Image, Image→Video; vídeo como referência extrai automaticamente um frame representativo (Video→Image / estratégia compatível para Video→Video).
- **Narração** (vídeo): texto, voz, idioma e velocidade via `services/voiceService.js` (TTS na fal.ai). Áudio é combinado ao vídeo com ffmpeg e o vídeo final é o exibido/baixado.
- **Legenda** (vídeo): texto da narração ou personalizado; posição inferior/centro; estilo padrão/destaque; sincroniza por timestamps quando a API de voz fornecer, senão distribui uniformemente pela duração.
- **Downloads**: individual (`/api/download/:id`, arquivo final com nome correto), BAIXAR TODOS e BAIXAR SELECIONADOS (checkbox por card) — um único ZIP `generation-YYYY-MM-DD-HH-mm.zip` com `/images`, `/videos` e `metadata.txt`, montado por stream sem armazenamento permanente.
- **Reaproveitar**: GERAR NOVAMENTE (mesmos parâmetros), GERAR MAIS NESTE MODELO (copia tudo para o formulário e você define a quantidade), USAR COMO REFERÊNCIA P/ IMAGEM ou P/ VÍDEO.
- **Histórico**: últimas gerações em `data/generations.json` (banco simples em JSON), com nomes de arquivo sequenciais por dia: `image-2026-09-02-001.jpg`, `video-2026-09-02-001.mp4`.
- Arquivos temporários de composição/frames ficam em `data/tmp` e são apagados ao fim de cada operação.

## Arquitetura

```
server.js                     rotas HTTP + estáticos (sem lógica de negócio)
models.config.js              catálogo central de modelos
services/
  generationService.js        fila, lotes, pipeline e status
  providers/falProvider.js    interface padrão de provider (generateImage/generateVideo/tts)
  voiceService.js             narração (TTS) — vozes/idiomas/velocidade configuráveis
  subtitleService.js          geração de SRT + estilo da legenda
  mediaProcessingService.js   ffmpeg: áudio+vídeo, legenda, frames, thumbnails
  cloudinaryService.js        armazenamento (Cloudinary ou local)
  zipService.js               ZIP por stream
  db.js                       coleção generations em JSON
public/                       frontend estático (tela única)
```

Para trocar/adicionar provider de IA, implemente a mesma interface em `services/providers/` e registre em `providers`.

## Colocar online (deploy)

O repositório inclui um `Dockerfile` com Node + ffmpeg, pronto para Render, Railway ou Fly.io (qualquer host que rode Docker). Configure as variáveis de ambiente no painel do host:

```
FAL_KEY=...            # obrigatória
CLOUDINARY_URL=...     # recomendada em produção (o disco desses hosts é efêmero)
APP_PASSWORD=...       # RECOMENDADA: exige senha (Basic Auth) para acessar o app
```

Sem `APP_PASSWORD` o app fica aberto para qualquer pessoa com a URL — que poderá gastar seus créditos da fal.ai. Em hosts com disco efêmero, o histórico (`data/generations.json`) zera a cada deploy; com Cloudinary ativo os arquivos gerados permanecem.

## CLI de geração em massa (imagens)

Edite `prompts.txt` (um prompt por linha) e o bloco de configuração no topo de `index.js`, então `npm run cli`. Saída numerada em `./saida`.
