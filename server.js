import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fal } from "@fal-ai/client";
import { v2 as cloudinary } from "cloudinary";
import { MODELS, IMAGE_SIZE_MAP } from "./models.js";

// ============================ CONFIGURAÇÃO ============================
const PORT = process.env.PORT || 3000;          // porta do servidor
const CONCORRENCIA = 2;                          // gerações simultâneas na fila
const HISTORICO_MAX = 100;                       // quantas gerações guardar no histórico
// ======================================================================

if (!process.env.FAL_KEY) {
  console.error("Erro: a variável de ambiente FAL_KEY não está definida.");
  console.error("Configure com: export FAL_KEY=sua_chave_aqui");
  process.exit(1);
}

// Cloudinary é opcional: sem CLOUDINARY_URL o app usa as URLs temporárias da fal.ai
const usaCloudinary = !!process.env.CLOUDINARY_URL;
if (!usaCloudinary) {
  console.warn("Aviso: CLOUDINARY_URL não definida. Arquivos NÃO serão armazenados no Cloudinary (usando URLs temporárias da fal.ai).");
}

const DATA_DIR = "./data";
const HISTORICO_ARQ = path.join(DATA_DIR, "history.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ----------------------------- Histórico ------------------------------
function lerHistorico() {
  try { return JSON.parse(fs.readFileSync(HISTORICO_ARQ, "utf8")); } catch { return []; }
}
function salvarHistorico(lista) {
  fs.writeFileSync(HISTORICO_ARQ, JSON.stringify(lista.slice(0, HISTORICO_MAX), null, 2));
}
function addHistorico(job) {
  const lista = lerHistorico();
  lista.unshift({
    id: job.id, type: job.type, prompt: job.prompt, modelo: job.modelNome,
    format: job.format, duration: job.duration || null,
    url: job.url, thumb: job.thumb, data: new Date().toISOString(),
  });
  salvarHistorico(lista);
}

// ------------------------------- Fila ---------------------------------
const jobs = new Map();
let rodando = 0;

function enfileirar(job) {
  jobs.set(job.id, job);
  bombear();
}

function bombear() {
  while (rodando < CONCORRENCIA) {
    const prox = [...jobs.values()].find((j) => j.status === "na_fila");
    if (!prox) break;
    executar(prox);
  }
}

async function executar(job) {
  rodando++;
  job.status = "gerando";
  try {
    const result = await fal.subscribe(job.endpoint, { input: job.input });
    const midia = job.type === "image" ? result?.data?.images?.[0] : result?.data?.video;
    if (!midia?.url) throw new Error("resposta da API sem mídia");

    job.status = "processando";
    const { url, thumb } = await armazenar(midia.url, job);
    job.url = url;
    job.thumb = thumb;
    job.status = "concluido";
    addHistorico(job);
  } catch (erro) {
    job.status = "erro";
    job.error = String(erro?.message || erro);
  } finally {
    rodando--;
    bombear();
  }
}

// Sobe o resultado para o Cloudinary (pastas /images, /videos) e gera thumbnail.
// Sem Cloudinary, devolve a própria URL da fal.ai.
async function armazenar(urlOrigem, job) {
  if (!usaCloudinary) return { url: urlOrigem, thumb: urlOrigem };
  const ehVideo = job.type === "video";
  const up = await cloudinary.uploader.upload(urlOrigem, {
    folder: ehVideo ? "videos" : "images",
    resource_type: ehVideo ? "video" : "image",
  });
  const thumb = ehVideo
    ? cloudinary.url(up.public_id, { resource_type: "video", format: "jpg", transformation: [{ width: 480, crop: "scale" }] })
    : cloudinary.url(up.public_id, { format: up.format, transformation: [{ width: 480, crop: "scale" }] });
  return { url: up.secure_url, thumb };
}

// Sobe a imagem de referência: Cloudinary (/references) ou storage da fal.ai
async function subirReferencia(dataUrl) {
  if (usaCloudinary) {
    const up = await cloudinary.uploader.upload(dataUrl, { folder: "references", resource_type: "image" });
    return up.secure_url;
  }
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] || "image/png";
  const blob = new Blob([Buffer.from(b64, "base64")], { type: mime });
  return await fal.storage.upload(blob);
}

// -------------------- Montagem do input por modelo --------------------
function montarInput(modelo, p) {
  const adv = p.advanced || {};
  if (modelo.type === "image") {
    const input = {
      prompt: p.prompt,
      image_size: IMAGE_SIZE_MAP[p.format] || "square_hd",
      num_images: 1,
      num_inference_steps: Math.min(Number(adv.steps) || modelo.stepsDefault, modelo.stepsMax),
    };
    if (adv.seed !== undefined && adv.seed !== "") input.seed = Number(adv.seed);
    if (modelo.advanced.includes("guidance") && adv.guidance) input.guidance_scale = Number(adv.guidance);
    if (p.referenceUrl && modelo.refEndpoint) {
      input.image_url = p.referenceUrl;
      delete input.image_size; // image-to-image segue o tamanho da referência
    }
    return input;
  }
  // vídeo (Kling)
  const input = {
    prompt: p.prompt,
    duration: String(p.duration || modelo.durations[0]),
    aspect_ratio: p.format,
  };
  if (adv.negative_prompt) input.negative_prompt = adv.negative_prompt;
  if (adv.cfg_scale !== undefined && adv.cfg_scale !== "") input.cfg_scale = Number(adv.cfg_scale);
  if (p.referenceUrl && modelo.refEndpoint) {
    input.image_url = p.referenceUrl;
    delete input.aspect_ratio; // image-to-video segue a proporção da referência
  }
  return input;
}

// Melhoria simples de prompt (heurística local, sem custo de API)
function melhorarPrompt(prompt, type) {
  const extraImg = "highly detailed, sharp focus, professional lighting, high resolution";
  const extraVid = "smooth motion, cinematic lighting, high detail, stable camera";
  const extra = type === "video" ? extraVid : extraImg;
  return /detailed|cinematic|high resolution/i.test(prompt) ? prompt : `${prompt}, ${extra}`;
}

// ------------------------------ HTTP ----------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => {
      dados += c;
      if (dados.length > 30 * 1024 * 1024) { reject(new Error("corpo muito grande")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch { reject(new Error("JSON inválido")); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    // --- API ---
    if (url.pathname === "/api/models" && req.method === "GET") return json(res, 200, MODELS);

    if (url.pathname === "/api/jobs" && req.method === "GET") return json(res, 200, [...jobs.values()]);

    if (url.pathname === "/api/generate" && req.method === "POST") {
      const p = await lerCorpo(req);
      const modelo = MODELS.find((m) => m.id === p.modelId);
      if (!modelo) return json(res, 400, { erro: "modelo inválido" });
      if (!p.prompt?.trim()) return json(res, 400, { erro: "prompt vazio" });
      if (p.referenceUrl && !modelo.refEndpoint) return json(res, 400, { erro: "este modelo não aceita imagem de referência" });
      const qtd = Math.max(1, Math.min(Number(p.quantity) || 1, 20));
      const criados = [];
      for (let i = 0; i < qtd; i++) {
        const params = { ...p, prompt: p.prompt.trim() };
        // seeds diferentes por item quando o usuário fixa uma seed em lote
        if (params.advanced?.seed !== undefined && params.advanced.seed !== "" && i > 0) {
          params.advanced = { ...params.advanced, seed: Number(params.advanced.seed) + i };
        }
        const job = {
          id: crypto.randomUUID(), indice: i + 1, total: qtd,
          type: modelo.type, modelId: modelo.id, modelNome: modelo.nome,
          endpoint: p.referenceUrl && modelo.refEndpoint ? modelo.refEndpoint : modelo.endpoint,
          prompt: params.prompt, format: p.format, duration: p.duration || null,
          referenceUrl: p.referenceUrl || null, params,
          input: montarInput(modelo, params),
          status: "na_fila", url: null, thumb: null, error: null,
          criadoEm: new Date().toISOString(),
        };
        enfileirar(job);
        criados.push(job.id);
      }
      return json(res, 200, { jobs: criados });
    }

    if (url.pathname.match(/^\/api\/jobs\/[\w-]+\/retry$/) && req.method === "POST") {
      const id = url.pathname.split("/")[3];
      const job = jobs.get(id);
      if (!job) return json(res, 404, { erro: "job não encontrado" });
      if (job.status !== "erro") return json(res, 400, { erro: "só é possível repetir jobs com erro" });
      job.status = "na_fila";
      job.error = null;
      bombear();
      return json(res, 200, { ok: true });
    }

    if (url.pathname.match(/^\/api\/jobs\/[\w-]+$/) && req.method === "DELETE") {
      jobs.delete(url.pathname.split("/")[3]);
      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/api/reference" && req.method === "POST") {
      const { dataUrl } = await lerCorpo(req);
      if (!dataUrl?.startsWith("data:image/")) return json(res, 400, { erro: "envie uma imagem válida" });
      const urlRef = await subirReferencia(dataUrl);
      return json(res, 200, { url: urlRef });
    }

    if (url.pathname === "/api/enhance" && req.method === "POST") {
      const { prompt, type } = await lerCorpo(req);
      if (!prompt?.trim()) return json(res, 400, { erro: "prompt vazio" });
      return json(res, 200, { prompt: melhorarPrompt(prompt.trim(), type) });
    }

    if (url.pathname === "/api/history" && req.method === "GET") return json(res, 200, lerHistorico());

    if (url.pathname.match(/^\/api\/history\/[\w-]+$/) && req.method === "DELETE") {
      salvarHistorico(lerHistorico().filter((h) => h.id !== url.pathname.split("/")[3]));
      return json(res, 200, { ok: true });
    }

    // --- Arquivos estáticos ---
    if (req.method === "GET") {
      const arquivo = url.pathname === "/" ? "/index.html" : url.pathname;
      const caminho = path.join("./public", path.normalize(arquivo));
      if (caminho.startsWith("public") && fs.existsSync(caminho) && fs.statSync(caminho).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(caminho)] || "application/octet-stream" });
        return fs.createReadStream(caminho).pipe(res);
      }
    }

    json(res, 404, { erro: "não encontrado" });
  } catch (erro) {
    json(res, 500, { erro: String(erro?.message || erro) });
  }
});

server.listen(PORT, () => {
  console.log(`Gerador rodando em http://localhost:${PORT}`);
  console.log(`Cloudinary: ${usaCloudinary ? "ativo" : "desativado (defina CLOUDINARY_URL)"}`);
});
