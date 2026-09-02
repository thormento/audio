# Gerador Interno de Imagens e Vídeos (fal.ai + Cloudinary)

MVP web para gerar imagens e vídeos em lote com a fal.ai, com fila, status por item, histórico e armazenamento no Cloudinary. Inclui também uma CLI de geração em massa por arquivo de prompts.

## Requisitos

- Node.js 18 ou superior

## Instalação

```bash
npm install
```

## Configuração (variáveis de ambiente)

```bash
export FAL_KEY=sua_chave_fal            # obrigatória (nunca no código)
export CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD_NAME   # opcional
```

Sem `CLOUDINARY_URL` o app funciona usando as URLs temporárias da fal.ai (sem armazenamento próprio, CDN ou thumbnails). Com Cloudinary, os arquivos vão para as pastas `images/`, `videos/` e `references/`, com thumbnails gerados por transformação.

## Rodar o app web

```bash
npm start
# abre http://localhost:3000
```

### Funcionalidades

- **Tipo**: imagem ou vídeo; **modelos**: FLUX Schnell (rápido) e FLUX Dev (qualidade) para imagem, Kling 1.6 Standard/Pro para vídeo.
- **Lote**: quantidade de 1 a 20; cada item entra na fila com status próprio (Na fila → Gerando → Processando → Concluído/Erro) e botão "Tentar novamente".
- **Formato**: 1:1, 4:5, 9:16, 16:9 (imagem) / 9:16, 16:9, 1:1 (vídeo). **Duração**: apenas as aceitas pelo modelo (Kling: 5s e 10s).
- **Referência**: upload opcional para image-to-image / image-to-video (FLUX Schnell não suporta).
- **Configurações avançadas** (recolhidas): seed, steps, guidance, CFG e prompt negativo — só aparecem as compatíveis com o modelo escolhido.
- **Cards de resultado**: preview/play, download, gerar novamente, copiar prompt, excluir.
- **Histórico**: últimas 100 gerações em `data/history.json`.
- **Melhorar prompt**: aprimoramento local simples (acrescenta descritores de qualidade), sem custo de API.

## Editar os modelos

O catálogo fica em `models.js` (endpoints, formatos, durações e opções avançadas de cada modelo). Antes de adicionar/trocar um modelo, confira o schema real em `https://fal.ai/models/<endpoint>/api`.

## CLI de geração em massa (imagens)

Alternativa por linha de comando: edite `prompts.txt` (um prompt por linha) e o bloco de configuração no topo de `index.js`, então:

```bash
npm run cli
```

As imagens saem numeradas em `./saida` (001.jpg, 002.jpg, ...). Erros por item não interrompem os demais.
