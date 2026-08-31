import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";

// ============================ CONFIGURAÇÃO ============================
// Edite os valores abaixo conforme sua necessidade.

// Tamanho da imagem. Opções válidas:
// square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9
const IMAGE_SIZE = "square_hd";

// Quantas imagens gerar por prompt (atenção: cada imagem é cobrada)
const NUM_IMAGES = 1;

// Formato de saída: "jpeg" ou "png"
const OUTPUT_FORMAT = "jpeg";

// Passos de inferência. FLUX Schnell trabalha bem entre 1 e 4 (mais barato e rápido)
const NUM_INFERENCE_STEPS = 4;
// ======================================================================

const PASTA_SAIDA = "./saida";
const ARQUIVO_PROMPTS = "prompts.txt";

// Validações iniciais
if (!process.env.FAL_KEY) {
  console.error("Erro: a variável de ambiente FAL_KEY não está definida.");
  console.error("Configure com: export FAL_KEY=sua_chave_aqui");
  process.exit(1);
}

if (!fs.existsSync(ARQUIVO_PROMPTS)) {
  console.error(`Erro: arquivo ${ARQUIVO_PROMPTS} não encontrado nesta pasta.`);
  console.error("Crie o arquivo com um prompt por linha.");
  process.exit(1);
}

// Lê os prompts: um por linha, ignorando linhas vazias e espaços nas pontas
const prompts = fs
  .readFileSync(ARQUIVO_PROMPTS, "utf8")
  .split(/\r?\n/)
  .map((linha) => linha.trim())
  .filter((linha) => linha.length > 0);

if (prompts.length === 0) {
  console.error(`Erro: ${ARQUIVO_PROMPTS} não contém nenhum prompt válido.`);
  process.exit(1);
}

fs.mkdirSync(PASTA_SAIDA, { recursive: true });

const extensao = OUTPUT_FORMAT === "png" ? "png" : "jpg";
let sucessos = 0;
let falhas = 0;

console.log(`Gerando ${prompts.length} item(ns) com FLUX Schnell...`);

for (let i = 0; i < prompts.length; i++) {
  const numero = String(i + 1).padStart(3, "0");
  try {
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: prompts[i],
        image_size: IMAGE_SIZE,
        num_images: NUM_IMAGES,
        output_format: OUTPUT_FORMAT,
        num_inference_steps: NUM_INFERENCE_STEPS,
      },
    });

    const imagens = result?.data?.images;
    if (!Array.isArray(imagens) || imagens.length === 0) {
      throw new Error("resposta da API sem imagens");
    }

    const nomesSalvos = [];
    for (let j = 0; j < imagens.length; j++) {
      const nome =
        imagens.length > 1 ? `${numero}_${j + 1}.${extensao}` : `${numero}.${extensao}`;
      const resposta = await fetch(imagens[j].url);
      if (!resposta.ok) {
        throw new Error(`falha ao baixar imagem (HTTP ${resposta.status})`);
      }
      const dados = Buffer.from(await resposta.arrayBuffer());
      fs.writeFileSync(path.join(PASTA_SAIDA, nome), dados);
      nomesSalvos.push(nome);
    }

    sucessos++;
    console.log(`${i + 1}/${prompts.length} ok -> ${nomesSalvos.join(", ")}`);
  } catch (erro) {
    falhas++;
    console.error(`${i + 1}/${prompts.length} ERRO -> ${erro?.message || erro}`);
  }
}

console.log(`Concluído: ${sucessos} com sucesso, ${falhas} com erro. Arquivos em ${PASTA_SAIDA}`);
