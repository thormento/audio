// Serviço de narração (TTS) — camada separada da interface.
// Usa a API de voz hospedada na fal.ai (mesma FAL_KEY, só no backend).
// IMPORTANTE: confira o schema do endpoint em
// https://fal.ai/models/fal-ai/elevenlabs/tts/turbo-v2.5/api e ajuste
// TTS_ENDPOINT/montarInput se necessário — este é o único lugar a editar.
import fs from "node:fs";
import path from "node:path";
import { providers } from "./providers/falProvider.js";

// ======================= CONFIGURAÇÃO DA NARRAÇÃO =======================
const TTS_ENDPOINT = "fal-ai/elevenlabs/tts/turbo-v2.5";

export const VOICES = [
  { id: "Rachel", nome: "Rachel (feminina)" },
  { id: "Aria", nome: "Aria (feminina)" },
  { id: "Sarah", nome: "Sarah (feminina)" },
  { id: "Roger", nome: "Roger (masculina)" },
  { id: "Brian", nome: "Brian (masculina)" },
];

export const LANGUAGES = [
  { id: "pt", nome: "Português" },
  { id: "en", nome: "Inglês" },
  { id: "es", nome: "Espanhol" },
];

// Velocidade da fala mapeada para o parâmetro da API
const SPEED_MAP = { lenta: 0.8, normal: 1.0, rapida: 1.15 };
// ========================================================================

export const voiceService = {
  voices: VOICES,
  languages: LANGUAGES,

  // Gera o áudio da narração e salva em arquivo local temporário.
  // Retorna { caminho, timestamps } (timestamps = null se a API não fornecer).
  async gerarNarracao({ texto, voz, idioma, velocidade, tmpDir }) {
    const input = {
      text: texto,
      voice: voz || VOICES[0].id,
      speed: SPEED_MAP[velocidade] ?? 1.0,
    };
    // O modelo é multilíngue e detecta o idioma pelo texto; language_code é
    // apenas uma dica quando suportado pela API.
    if (idioma) input.language_code = idioma;

    const { url, timestamps } = await providers.fal.tts({ endpoint: TTS_ENDPOINT, input });

    const r = await fetch(url);
    if (!r.ok) throw new Error(`falha ao baixar áudio da narração (HTTP ${r.status})`);
    const caminho = path.join(tmpDir, `narracao-${Date.now()}.mp3`);
    fs.writeFileSync(caminho, Buffer.from(await r.arrayBuffer()));
    return { caminho, timestamps };
  },
};
