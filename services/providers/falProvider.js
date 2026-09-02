// Provider fal.ai — implementa a interface padrão de providers:
//   generateImage({ endpoint, input }) -> { url }
//   generateVideo({ endpoint, input }) -> { url }
//   tts({ endpoint, input }) -> { url, timestamps|null }
// fal.subscribe já cuida do fluxo assíncrono (POST -> fila -> poll -> resultado),
// então o polling de status fica encapsulado aqui. TIMEOUT protege jobs travados.
import { fal } from "@fal-ai/client";

const TIMEOUT_MS = 15 * 60 * 1000;

function comTimeout(promessa, ms = TIMEOUT_MS) {
  let t;
  return Promise.race([
    promessa.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error("tempo limite de geração excedido")), ms); }),
  ]);
}

async function chamar(endpoint, input) {
  const result = await comTimeout(fal.subscribe(endpoint, { input }));
  return result?.data;
}

export const falProvider = {
  async generateImage({ endpoint, input }) {
    const data = await chamar(endpoint, input);
    const img = data?.images?.[0];
    if (!img?.url) throw new Error("resposta da API sem imagem");
    return { url: img.url };
  },

  async generateVideo({ endpoint, input }) {
    const data = await chamar(endpoint, input);
    const video = data?.video;
    if (!video?.url) throw new Error("resposta da API sem vídeo");
    return { url: video.url };
  },

  async tts({ endpoint, input }) {
    const data = await chamar(endpoint, input);
    const url = data?.audio?.url || data?.audio_url || data?.url;
    if (!url) throw new Error("resposta da API de voz sem áudio");
    return { url, timestamps: data?.timestamps || null };
  },

  // Upload de arquivo para o storage da fal (fallback quando não há Cloudinary)
  async uploadBlob(buffer, mime) {
    const blob = new Blob([buffer], { type: mime });
    return await fal.storage.upload(blob);
  },
};

export const providers = { fal: falProvider };
