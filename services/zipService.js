// Serviço de ZIP: monta um único arquivo com os resultados concluídos
// (pastas /images e /videos + metadata.txt) e envia por stream na resposta.
// Nada é gravado em disco permanentemente.
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { FILES_DIR } from "./cloudinaryService.js";

export const zipService = {
  nomeZip() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `generation-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}.zip`;
  },

  // generations: registros com status completed. res: resposta HTTP.
  async streamZip(generations, res) {
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${this.nomeZip()}"`,
    });
    const zip = new ZipArchive({ zlib: { level: 1 } }); // mídia já é comprimida
    zip.pipe(res);

    const meta = [];
    for (const g of generations) {
      const ext = g.fileExt || (g.type === "video" ? "mp4" : "jpg");
      const nome = `${g.fileBase}.${ext}`;
      const pasta = g.type === "video" ? "videos" : "images";
      try {
        if (g.outputUrl.startsWith("/files/")) {
          zip.file(path.join(FILES_DIR, path.basename(g.outputUrl)), { name: `${pasta}/${nome}` });
        } else {
          const r = await fetch(g.outputUrl);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          zip.append(Readable.fromWeb(r.body), { name: `${pasta}/${nome}` });
        }
        meta.push([
          `arquivo: ${pasta}/${nome}`,
          `prompt: ${g.prompt}`,
          `modelo: ${g.modelNome}`,
          `formato: ${g.format}`,
          g.duration ? `duração: ${g.duration}s` : null,
          `data: ${g.createdAt}`,
        ].filter(Boolean).join("\n"));
      } catch (e) {
        meta.push(`arquivo: ${pasta}/${nome}\nERRO ao incluir no ZIP: ${e.message}`);
      }
    }
    zip.append(meta.join("\n\n---\n\n") + "\n", { name: "metadata.txt" });
    await zip.finalize();
  },
};
