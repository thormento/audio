# Gerador de Imagens em Massa — fal.ai FLUX Schnell

Ferramenta de linha de comando em Node.js que lê prompts de um arquivo de texto e gera uma imagem para cada linha usando o modelo FLUX Schnell da fal.ai.

## Requisitos

- Node.js 18 ou superior

## Instalação

```bash
npm install
```

## Configurar a chave da API

A chave vem sempre da variável de ambiente `FAL_KEY` (nunca escreva a chave no código):

```bash
export FAL_KEY=sua_chave_aqui
```

## Editar os prompts

Edite o arquivo `prompts.txt`: um prompt por linha. Linhas vazias são ignoradas.

## Editar a configuração

No topo do `index.js` há um bloco de configuração comentado onde você pode ajustar:

- `IMAGE_SIZE` — tamanho da imagem (square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9)
- `NUM_IMAGES` — quantas imagens por prompt (cada uma é cobrada)
- `OUTPUT_FORMAT` — jpeg ou png
- `NUM_INFERENCE_STEPS` — FLUX Schnell trabalha bem entre 1 e 4

## Rodar

```bash
node index.js
```

As imagens são salvas na pasta `./saida`, numeradas na ordem do `prompts.txt` (001.jpg, 002.jpg, ...). Se `NUM_IMAGES` for maior que 1, os arquivos saem como 001_1.jpg, 001_2.jpg, etc. Se um prompt falhar, o erro aparece no terminal e a ferramenta continua com os próximos.
