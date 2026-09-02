// Orquestrador das gerações: cria lotes (batchId), mantém a fila com status
// individual (queued -> generating -> processing -> completed | error),
// resolve referências (inclusive vídeo -> frame), executa o pipeline de
// narração/legenda e armazena o resultado final.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MODELS, IMAGE_SIZE_MAP } from "../models.config.js";
import { db } from "./db.js";
import { providers } from "./providers/falProvider.js";
import { cloudinaryService } from "./cloudinaryService.js";
import { voiceService } from "./voiceService.js";
import { subtitleService } from "./subtitleService.js";
import { mediaProcessingService as mp } from "./mediaProcessingService.js";

const CONCORRENCIA = 2;
let rodando = 0;

// Cache de frames extraídos de vídeos de referência (não repete o trabalho
// nem duplica uploads quando a mesma referência é reutilizada)
const frameCache = new Map();

function montarInput(modelo, g) {
  const adv = g.advanced || {};
  const comRef = !!g.refImageUrl;
  if (modelo.type === "image") {
    const input = {
      prompt: g.prompt,
      num_images: 1,
      num_inference_steps: Math.min(Number(adv.steps) || modelo.defaults.steps, modelo.limits.stepsMax),
    };
    if (adv.seed !== undefined && adv.seed !== "") input.seed = Number(adv.seed);
    if (modelo.advanced.includes("guidance") && adv.guidance) input.guidance_scale = Number(adv.guidance);
    if (comRef) {
      input.image_url = g.refImageUrl;
      if (modelo.advanced.includes("strength")) input.strength = Number(adv.strength) || modelo.defaults.strength;
    } else {
      input.image_size = IMAGE_SIZE_MAP[g.format] || "square_hd";
    }
    return input;
  }
  const input = { prompt: g.prompt, duration: String(g.duration || modelo.durations[0]) };
  if (adv.negative_prompt) input.negative_prompt = adv.negative_prompt;
  if (adv.cfg_scale !== undefined && adv.cfg_scale !== "") input.cfg_scale = Number(adv.cfg_scale);
  if (comRef) input.image_url = g.refImageUrl;
  else input.aspect_ratio = g.format;
  return input;
}

export const generationService = {
  // Cria um lote de gerações. Retorna { batchId, ids } ou lança erro de validação.
  criarLote(p) {
    const modelo = MODELS.find((m) => m.id === p.modelId);
    if (!modelo) throw new Error("modelo inválido");
    if (!p.prompt?.trim()) throw new Error("prompt vazio");
    const ref = p.reference || null;
    if (ref?.url) {
      if (ref.type === "image" && !modelo.ref.image) throw new Error("este modelo não aceita imagem de referência");
      if (ref.type === "video" && !modelo.ref.video) throw new Error("este modelo não aceita vídeo de referência");
    }
    const qtd = Math.max(1, Math.min(Number(p.quantity) || 1, modelo.limits.maxQuantity));
    const batchId = crypto.randomUUID().slice(0, 8);
    const dataStr = new Date().toISOString().slice(0, 10);
    let seq = db.nextSeq(modelo.type, dataStr);
    const ids = [];

    for (let i = 0; i < qtd; i++) {
      const advanced = { ...(p.advanced || {}) };
      if (advanced.seed !== undefined && advanced.seed !== "" && i > 0) advanced.seed = Number(advanced.seed) + i;
      const g = {
        id: crypto.randomUUID(),
        batchId,
        indice: i + 1,
        total: qtd,
        type: modelo.type,
        prompt: p.prompt.trim(),
        model: modelo.id,
        modelNome: modelo.nome,
        provider: modelo.provider,
        format: p.format || modelo.formats[0],
        duration: modelo.type === "video" ? Number(p.duration) || modelo.durations[0] : null,
        status: "queued",
        referenceUrl: ref?.url || null,
        referenceType: ref?.type || null,
        outputUrl: null,
        thumbnailUrl: null,
        narrationEnabled: !!(modelo.type === "video" && p.narration?.enabled),
        narrationText: p.narration?.text?.trim() || null,
        voice: p.narration?.voice || null,
        language: p.narration?.language || null,
        speed: p.narration?.speed || null,
        subtitleEnabled: !!(modelo.type === "video" && p.subtitle?.enabled),
        subtitleSource: p.subtitle?.source || "narration",
        subtitleText: p.subtitle?.text?.trim() || null,
        subtitlePosition: p.subtitle?.position || "inferior",
        subtitleStyle: p.subtitle?.style || "padrao",
        advanced,
        fileBase: `${modelo.type}-${dataStr}-${String(seq++).padStart(3, "0")}`,
        fileExt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
      };
      if (g.narrationEnabled && !g.narrationText) throw new Error("narração ativada sem texto de narração");
      if (g.subtitleEnabled && g.subtitleSource === "custom" && !g.subtitleText) throw new Error("legenda personalizada sem texto");
      if (g.subtitleEnabled && g.subtitleSource === "narration" && !g.narrationText) throw new Error("legenda usa o texto da narração, mas a narração está vazia");
      db.insert(g);
      ids.push(g.id);
    }
    this.bombear();
    return { batchId, ids };
  },

  retry(id) {
    const g = db.get(id);
    if (!g) throw new Error("geração não encontrada");
    if (g.status !== "error") throw new Error("só é possível repetir gerações com erro");
    db.update(id, { status: "queued", error: null });
    this.bombear();
  },

  bombear() {
    while (rodando < CONCORRENCIA) {
      const prox = [...db.all()].reverse().find((g) => g.status === "queued");
      if (!prox) break;
      this.executar(prox).catch(() => {});
    }
  },

  async executar(g) {
    rodando++;
    const tmp = mp.criarTmp();
    try {
      db.update(g.id, { status: "generating" });
      const modelo = MODELS.find((m) => m.id === g.model);
      const provider = providers[g.provider];

      // resolve referência: vídeo vira frame quando o modelo só aceita imagem
      if (g.referenceUrl) {
        g.refImageUrl = g.referenceType === "video"
          ? await this.frameDeVideo(g.referenceUrl, tmp)
          : g.referenceUrl;
      }

      const endpoint = g.refImageUrl && modelo.endpoints.image ? modelo.endpoints.image : modelo.endpoints.text;
      const input = montarInput(modelo, g);

      const bruto = modelo.type === "image"
        ? await provider.generateImage({ endpoint, input })
        : await provider.generateVideo({ endpoint, input });

      db.update(g.id, { status: "processing" });
      let origemFinal = bruto.url;
      let ext = modelo.type === "video" ? "mp4" : "jpg";

      // pipeline de narração + legenda (somente vídeo)
      if (g.narrationEnabled || g.subtitleEnabled) {
        let audioPath = null;
        let timestamps = null;
        if (g.narrationEnabled) {
          const narr = await voiceService.gerarNarracao({
            texto: g.narrationText, voz: g.voice, idioma: g.language, velocidade: g.speed, tmpDir: tmp,
          });
          audioPath = narr.caminho;
          timestamps = narr.timestamps;
        }
        let srtPath = null;
        let forceStyle = null;
        if (g.subtitleEnabled) {
          const texto = g.subtitleSource === "custom" ? g.subtitleText : g.narrationText;
          const srt = subtitleService.gerarSrt({ texto, duracao: g.duration, timestamps });
          srtPath = path.join(tmp, "legenda.srt");
          fs.writeFileSync(srtPath, srt);
          forceStyle = subtitleService.estiloAss(g.subtitlePosition, g.subtitleStyle);
        }
        origemFinal = await mp.comporVideo({ videoUrl: bruto.url, audioPath, srtPath, forceStyle, tmpDir: tmp });
      }

      const armazenado = await cloudinaryService.storeFinal({ origem: origemFinal, type: g.type, fileBase: g.fileBase, ext });
      let thumb = armazenado.thumb;
      if (!thumb && g.type === "video") {
        try { thumb = cloudinaryService.salvarThumbLocal(await mp.thumbnailVideo(origemFinal, tmp), g.fileBase); }
        catch { thumb = null; }
      }
      db.update(g.id, { status: "completed", outputUrl: armazenado.url, thumbnailUrl: thumb || armazenado.url, fileExt: ext });
    } catch (erro) {
      db.update(g.id, { status: "error", error: String(erro?.message || erro) });
    } finally {
      mp.limparTmp(tmp);
      rodando--;
      this.bombear();
    }
  },

  // Extrai (com cache) um frame de um vídeo de referência e devolve uma URL utilizável
  async frameDeVideo(videoUrl, tmp) {
    if (frameCache.has(videoUrl)) return frameCache.get(videoUrl);
    const framePath = await mp.extrairFrame(videoUrl, tmp);
    let url = await cloudinaryService.storeReference({ origem: framePath, type: "image" });
    if (!url) url = await providers.fal.uploadBlob(fs.readFileSync(framePath), "image/jpeg");
    frameCache.set(videoUrl, url);
    return url;
  },
};
