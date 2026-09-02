// ============================ CATÁLOGO DE MODELOS ============================
// Edite aqui para adicionar/trocar modelos. Confira os parâmetros exatos de
// cada modelo em https://fal.ai/models/<endpoint>/api antes de alterar.
//
// Campos:
// - endpoint: id usado no fal.subscribe (texto -> mídia)
// - refEndpoint: endpoint usado quando há imagem de referência (i2i / i2v); null = não suporta
// - formats: proporções aceitas na interface
// - durations: durações aceitas (somente vídeo), em segundos
// - advanced: opções avançadas compatíveis (a interface só mostra essas)

export const MODELS = [
  {
    id: "flux-schnell",
    nome: "Imagem — Rápido (FLUX Schnell)",
    type: "image",
    endpoint: "fal-ai/flux/schnell",
    refEndpoint: null,
    formats: ["1:1", "4:5", "9:16", "16:9"],
    durations: [],
    advanced: ["seed", "steps"],
    stepsDefault: 4,
    stepsMax: 4,
  },
  {
    id: "flux-dev",
    nome: "Imagem — Melhor qualidade (FLUX Dev)",
    type: "image",
    endpoint: "fal-ai/flux/dev",
    refEndpoint: "fal-ai/flux/dev/image-to-image",
    formats: ["1:1", "4:5", "9:16", "16:9"],
    durations: [],
    advanced: ["seed", "steps", "guidance"],
    stepsDefault: 28,
    stepsMax: 50,
    guidanceDefault: 3.5,
  },
  {
    id: "kling-standard",
    nome: "Vídeo — Rápido (Kling 1.6 Standard)",
    type: "video",
    endpoint: "fal-ai/kling-video/v1.6/standard/text-to-video",
    refEndpoint: "fal-ai/kling-video/v1.6/standard/image-to-video",
    formats: ["9:16", "16:9", "1:1"],
    durations: [5, 10],
    advanced: ["negative_prompt", "cfg_scale"],
    cfgDefault: 0.5,
  },
  {
    id: "kling-pro",
    nome: "Vídeo — Melhor qualidade (Kling 1.6 Pro)",
    type: "video",
    endpoint: "fal-ai/kling-video/v1.6/pro/text-to-video",
    refEndpoint: "fal-ai/kling-video/v1.6/pro/image-to-video",
    formats: ["9:16", "16:9", "1:1"],
    durations: [5, 10],
    advanced: ["negative_prompt", "cfg_scale"],
    cfgDefault: 0.5,
  },
];

// Mapeia a proporção escolhida para o parâmetro image_size dos modelos FLUX
export const IMAGE_SIZE_MAP = {
  "1:1": "square_hd",
  "4:5": { width: 1024, height: 1280 },
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
};
