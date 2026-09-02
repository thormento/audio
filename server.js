// Servidor HTTP: rotas da API + arquivos estáticos. Toda a lógica vive nos
// services (generationService, voiceService, zipService, ...). Chaves de API
// existem SOMENTE aqui no backend, via variáveis de ambiente.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { MODELS } from "./models.config.js";
import { db } from "./services/db.js";
import { generationService } from "./services/generationService.js";
import { cloudinaryService, FILES_DIR } from "./services/cloudinaryService.js";
import { voiceService } from "./services/voiceService.js";
import { zipService } from "./services/zipService.js";
import { providers } from "./services/providers/falProvider.js";
import { temFfmpeg } from "./services/mediaProcessingService.js";

const PORT = process.env.PORT || 3000;

if (!process.env.FAL_KEY) {
  console.error("Erro: a variável de ambiente FAL_KEY não está definida.");
  console.error("Configure com: export FAL_KEY=sua_chave_aqui");
  process.exit(1);
}
if (!cloudinaryService.ativo) {
  console.warn("Aviso: Cloudinary não configurado (CLOUDINARY_URL ou CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET). Usando armazenamento local em data/files.");
}

// Melhoria simples de prompt (heurística local, sem custo de API)
function melhorarPrompt(prompt, type) {
  const extra = type === "video"
    ? "smooth motion, cinematic lighting, high detail, stable camera"
    : "highly detailed, sharp focus, professional lighting, high resolution";
  return /detailed|cinematic|high resolution/i.test(prompt) ? prompt : `${prompt}, ${extra}`;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".webp": "image/webp" };

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req, limiteMB = 80) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => {
      dados += c;
      if (dados.length > limiteMB * 1024 * 1024) { reject(new Error("arquivo muito grande")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch { reject(new Error("JSON inválido")); } });
    req.on("error", reject);
  });
}

function servirArquivo(res, caminho) {
  res.writeHead(200, { "Content-Type": MIME[path.extname(caminho)] || "application/octet-stream" });
  fs.createReadStream(caminho).pipe(res);
}

// Proteção simples para exposição na internet: defina APP_PASSWORD para exigir
// senha (HTTP Basic Auth — o navegador pede usuário/senha; usuário é livre).
// Sem APP_PASSWORD o app fica aberto — use assim apenas em rede interna.
const APP_PASSWORD = process.env.APP_PASSWORD || null;
function autorizado(req) {
  if (!APP_PASSWORD) return true;
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const senha = Buffer.from(auth.slice(6), "base64").toString().split(":").slice(1).join(":");
  return senha === APP_PASSWORD;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rota = `${req.method} ${url.pathname}`;
  try {
    if (!autorizado(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Gerador"', "Content-Type": "text/plain" });
      return res.end("Acesso restrito");
    }
    if (rota === "GET /api/models") return json(res, 200, MODELS);

    if (rota === "GET /api/config") {
      return json(res, 200, {
        voices: voiceService.voices,
        languages: voiceService.languages,
        cloudinary: cloudinaryService.ativo,
        ffmpeg: await temFfmpeg(),
      });
    }

    if (rota === "GET /api/generations") return json(res, 200, db.all());

    if (rota === "POST /api/generate") {
      const p = await lerCorpo(req);
      return json(res, 200, generationService.criarLote(p));
    }

    if (url.pathname.match(/^\/api\/generations\/[\w-]+\/retry$/) && req.method === "POST") {
      generationService.retry(url.pathname.split("/")[3]);
      return json(res, 200, { ok: true });
    }

    if (url.pathname.match(/^\/api\/generations\/[\w-]+$/) && req.method === "DELETE") {
      db.remove(url.pathname.split("/")[3]);
      return json(res, 200, { ok: true });
    }

    // Upload de referência (imagem ou vídeo em data URL)
    if (rota === "POST /api/reference") {
      const { dataUrl } = await lerCorpo(req);
      const tipo = dataUrl?.startsWith("data:image/") ? "image" : dataUrl?.startsWith("data:video/") ? "video" : null;
      if (!tipo) return json(res, 400, { erro: "envie uma imagem ou um vídeo válido" });
      let urlRef = await cloudinaryService.storeReference({ origem: dataUrl, type: tipo });
      if (!urlRef) {
        const [meta, b64] = dataUrl.split(",");
        const mime = meta.match(/data:(.*?);/)?.[1] || "application/octet-stream";
        urlRef = await providers.fal.uploadBlob(Buffer.from(b64, "base64"), mime);
      }
      return json(res, 200, { url: urlRef, type: tipo });
    }

    if (rota === "POST /api/enhance") {
      const { prompt, type } = await lerCorpo(req);
      if (!prompt?.trim()) return json(res, 400, { erro: "prompt vazio" });
      return json(res, 200, { prompt: melhorarPrompt(prompt.trim(), type) });
    }

    // ZIP com os resultados concluídos: { ids: [...] } ou { batchId }
    if (rota === "POST /api/zip") {
      const { ids, batchId } = await lerCorpo(req);
      const prontos = db.all().filter((g) =>
        g.status === "completed" && g.outputUrl &&
        (ids?.length ? ids.includes(g.id) : batchId ? g.batchId === batchId : false));
      if (!prontos.length) return json(res, 400, { erro: "nenhum resultado concluído para baixar" });
      return zipService.streamZip(prontos, res);
    }

    // Download individual do arquivo final, com nome de arquivo correto
    if (url.pathname.match(/^\/api\/download\/[\w-]+$/) && req.method === "GET") {
      const g = db.get(url.pathname.split("/")[3]);
      if (!g || g.status !== "completed" || !g.outputUrl) return json(res, 404, { erro: "resultado não disponível" });
      const nome = `${g.fileBase}.${g.fileExt || (g.type === "video" ? "mp4" : "jpg")}`;
      if (g.outputUrl.startsWith("/files/")) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(nome)] || "application/octet-stream", "Content-Disposition": `attachment; filename="${nome}"` });
        return fs.createReadStream(path.join(FILES_DIR, path.basename(g.outputUrl))).pipe(res);
      }
      const r = await fetch(g.outputUrl);
      if (!r.ok) return json(res, 502, { erro: `falha ao buscar arquivo (HTTP ${r.status})` });
      res.writeHead(200, { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "Content-Disposition": `attachment; filename="${nome}"` });
      const { Readable } = await import("node:stream");
      return Readable.fromWeb(r.body).pipe(res);
    }

    // Arquivos locais (fallback sem Cloudinary)
    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      const caminho = path.join(FILES_DIR, path.basename(url.pathname));
      if (fs.existsSync(caminho)) return servirArquivo(res, caminho);
    }

    // Frontend estático
    if (req.method === "GET") {
      const arquivo = url.pathname === "/" ? "/index.html" : url.pathname;
      const caminho = path.join("./public", path.normalize(arquivo));
      if (caminho.startsWith("public") && fs.existsSync(caminho) && fs.statSync(caminho).isFile()) {
        return servirArquivo(res, caminho);
      }
    }

    json(res, 404, { erro: "não encontrado" });
  } catch (erro) {
    if (!res.headersSent) json(res, erro.message?.includes("inválido") || erro.message?.includes("vazio") || erro.message?.includes("aceita") || erro.message?.includes("sem texto") ? 400 : 500, { erro: String(erro?.message || erro) });
    else res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Gerador rodando em http://localhost:${PORT}`);
  console.log(`Cloudinary: ${cloudinaryService.ativo ? "ativo" : "desativado (armazenamento local em data/files)"}`);
  console.log(`ffmpeg: ${(await temFfmpeg()) ? "disponível" : "NÃO instalado — narração, legenda e vídeo como referência ficarão indisponíveis"}`);
});
