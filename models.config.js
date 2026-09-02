// ============================ CATÁLOGO DE MODELOS ============================
// Configuração central dos modelos — o frontend lê daqui via /api/models.
// Para adicionar um modelo, inclua um objeto na lista. Confira o schema real
// em https://fal.ai/models/<endpoint>/api antes de alterar parâmetros.
//
// Campos:
// - endpoints.text: endpoint texto -> mídia | endpoints.image: com referência (i2i/i2v)
// - formats / durations: opções mostradas na interface (durations só para vídeo)
// - ref: quais referências aceita. "video: true" aqui significa que a interface
//   aceita vídeo como referência; se o modelo em si não aceitar vídeo, o backend
//   extrai automaticamente um frame representativo e usa como referência visual.
// - audio: se o modelo gera áudio nativo (nenhum dos atuais gera)
// - advanced: opções avançadas compatíveis (a interface só mostra essas)
// - limits.maxQuantity: máximo de gerações por lote

export const MODELS = [
  {
    id: "flux-schnell",
    nome: "Imagem — Rápido (FLUX Schnell)",
    type: "image",
    provider: "fal",
    endpoints: { text: "fal-ai/flux/schnell", image: null },
    formats: ["1:1", "4:5", "9:16", "16:9"],
    durations: [],
    ref: { image: false, video: false },
    audio: false,
    advanced: ["seed", "steps"],
    defaults: { steps: 4 },
    limits: { maxQuantity: 20, stepsMax: 4 },
  },
  {
    id: "flux-dev",
    nome: "Imagem — Melhor qualidade (FLUX Dev)",
    type: "image",
    provider: "fal",
    endpoints: { text: "fal-ai/flux/dev", image: "fal-ai/flux/dev/image-to-image" },
    formats: ["1:1", "4:5", "9:16", "16:9"],
    durations: [],
    ref: { image: true, video: true }, // vídeo vira frame automaticamente (video-to-image)
    audio: false,
    advanced: ["seed", "steps", "guidance", "strength"],
    defaults: { steps: 28, guidance: 3.5, strength: 0.85 },
    limits: { maxQuantity: 20, stepsMax: 50 },
  },
  {
    id: "kling-standard",
    nome: "Vídeo — Rápido (Kling 1.6 Standard)",
    type: "video",
    provider: "fal",
    endpoints: {
      text: "fal-ai/kling-video/v1.6/standard/text-to-video",
      image: "fal-ai/kling-video/v1.6/standard/image-to-video",
    },
    formats: ["9:16", "16:9", "1:1"],
    durations: [5, 10],
    ref: { image: true, video: true }, // vídeo vira frame automaticamente (estratégia compatível)
    audio: false,
    advanced: ["negative_prompt", "cfg_scale"],
    defaults: { cfg_scale: 0.5 },
    limits: { maxQuantity: 20 },
  },
  {
    id: "kling-pro",
    nome: "Vídeo — Melhor qualidade (Kling 1.6 Pro)",
    type: "video",
    provider: "fal",
    endpoints: {
      text: "fal-ai/kling-video/v1.6/pro/text-to-video",
      image: "fal-ai/kling-video/v1.6/pro/image-to-video",
    },
    formats: ["9:16", "16:9", "1:1"],
    durations: [5, 10],
    ref: { image: true, video: true },
    audio: false,
    advanced: ["negative_prompt", "cfg_scale"],
    defaults: { cfg_scale: 0.5 },
    limits: { maxQuantity: 20 },
  },
];

// Mapeia a proporção escolhida para o parâmetro image_size dos modelos FLUX
export const IMAGE_SIZE_MAP = {
  "1:1": "square_hd",
  "4:5": { width: 1024, height: 1280 },
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
};
