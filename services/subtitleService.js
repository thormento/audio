// Serviço de legendas: gera arquivo SRT e o estilo de renderização.
// Com timestamps da API de voz, sincroniza por eles; sem timestamps,
// distribui o texto uniformemente pela duração do vídeo (MVP).

function fmtTempo(seg) {
  const h = String(Math.floor(seg / 3600)).padStart(2, "0");
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(seg % 60)).padStart(2, "0");
  const ms = String(Math.round((seg % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
}

export const subtitleService = {
  // Gera o conteúdo SRT. timestamps (opcional): [{ text, start, end }]
  gerarSrt({ texto, duracao, timestamps }) {
    let blocos;
    if (Array.isArray(timestamps) && timestamps.length) {
      blocos = timestamps.map((t) => ({ texto: t.text, ini: t.start, fim: t.end }));
    } else {
      // divide em trechos de ~6 palavras distribuídos pela duração
      const palavras = texto.trim().split(/\s+/);
      const trechos = [];
      for (let i = 0; i < palavras.length; i += 6) trechos.push(palavras.slice(i, i + 6).join(" "));
      const passo = duracao / trechos.length;
      blocos = trechos.map((t, i) => ({ texto: t, ini: i * passo, fim: (i + 1) * passo - 0.05 }));
    }
    return blocos
      .map((b, i) => `${i + 1}\n${fmtTempo(b.ini)} --> ${fmtTempo(b.fim)}\n${b.texto}\n`)
      .join("\n");
  },

  // Estilo ASS (force_style do filtro subtitles do ffmpeg)
  // posicao: "inferior" | "centro"; estilo: "padrao" | "destaque"
  estiloAss(posicao, estilo) {
    const partes = [`Alignment=${posicao === "centro" ? 10 : 2}`];
    if (estilo === "destaque") {
      partes.push("FontSize=26", "Bold=1", "PrimaryColour=&H0000FFFF", "OutlineColour=&H00000000", "Outline=2");
    } else {
      partes.push("FontSize=20", "Outline=1");
    }
    return partes.join(",");
  },
};
