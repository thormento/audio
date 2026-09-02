// Processamento de mídia com ffmpeg: combinar áudio + vídeo, queimar legenda,
// extrair frame representativo de vídeo e gerar thumbnail.
// Requer ffmpeg instalado no sistema. Arquivos temporários ficam em data/tmp
// e são apagados ao fim de cada operação.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const TMP_BASE = "./data/tmp";
fs.mkdirSync(TMP_BASE, { recursive: true });

let ffmpegOk = null;
export async function temFfmpeg() {
  if (ffmpegOk !== null) return ffmpegOk;
  try { await exec("ffmpeg", ["-version"]); ffmpegOk = true; }
  catch { ffmpegOk = false; }
  return ffmpegOk;
}

async function ffmpeg(args) {
  try { await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); }
  catch (e) { throw new Error(`ffmpeg falhou: ${(e.stderr || e.message || "").slice(0, 300)}`); }
}

async function baixar(url, destino) {
  if (!/^https?:/.test(url)) { fs.copyFileSync(url, destino); return destino; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`falha ao baixar mídia (HTTP ${r.status})`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

export const mediaProcessingService = {
  // Cria um diretório temporário exclusivo da operação
  criarTmp() {
    const dir = path.join(TMP_BASE, crypto.randomUUID());
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  },
  limparTmp(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
  },

  // Combina vídeo + narração e/ou queima legenda. Retorna caminho do mp4 final
  // (dentro de tmpDir — mova/suba antes de limpar o tmp).
  async comporVideo({ videoUrl, audioPath, srtPath, forceStyle, tmpDir }) {
    if (!(await temFfmpeg())) throw new Error("ffmpeg não está instalado no servidor (necessário para narração/legenda)");
    const entrada = await baixar(videoUrl, path.join(tmpDir, "video-in.mp4"));
    const saida = path.join(tmpDir, "video-final.mp4");
    const args = ["-i", entrada];
    if (audioPath) args.push("-i", audioPath, "-map", "0:v", "-map", "1:a", "-shortest");
    if (srtPath) {
      // filtro subtitles exige caminho escapado
      const srtEsc = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      args.push("-vf", `subtitles='${srtEsc}':force_style='${forceStyle}'`, "-c:v", "libx264", "-preset", "fast", "-crf", "20");
    } else {
      args.push("-c:v", "copy");
    }
    if (audioPath) args.push("-c:a", "aac");
    args.push(saida);
    await ffmpeg(args);
    return saida;
  },

  // Extrai um frame representativo de um vídeo (usado para video-to-image e
  // como referência visual em video-to-video quando o modelo só aceita imagem)
  async extrairFrame(videoUrl, tmpDir) {
    if (!(await temFfmpeg())) throw new Error("ffmpeg não está instalado no servidor (necessário para usar vídeo como referência)");
    const entrada = await baixar(videoUrl, path.join(tmpDir, "ref-in.mp4"));
    const frame = path.join(tmpDir, "frame.jpg");
    await ffmpeg(["-ss", "1", "-i", entrada, "-frames:v", "1", "-q:v", "2", frame]);
    if (!fs.existsSync(frame)) {
      // vídeo mais curto que 1s: pega o primeiro frame
      await ffmpeg(["-i", entrada, "-frames:v", "1", "-q:v", "2", frame]);
    }
    return frame;
  },

  // Gera thumbnail local de um vídeo (fallback quando não há Cloudinary)
  async thumbnailVideo(videoPathOuUrl, tmpDir) {
    return this.extrairFrame(videoPathOuUrl, tmpDir);
  },
};
