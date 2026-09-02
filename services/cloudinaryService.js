// Camada de armazenamento: Cloudinary quando configurado, senão arquivos locais
// servidos em /files. Pastas no Cloudinary: generated/{images,videos,audio},
// references/{images,videos}; thumbnails são geradas por transformação de URL.
import fs from "node:fs";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";

export const FILES_DIR = "./data/files";
fs.mkdirSync(FILES_DIR, { recursive: true });

export const cloudinaryAtivo = !!(process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));

if (!process.env.CLOUDINARY_URL && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function baixarPara(origem, destino) {
  if (!/^https?:/.test(origem)) { fs.copyFileSync(origem, destino); return destino; }
  const r = await fetch(origem);
  if (!r.ok) throw new Error(`falha ao baixar arquivo (HTTP ${r.status})`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

export const cloudinaryService = {
  ativo: cloudinaryAtivo,

  // Sobe mídia final (URL remota ou caminho local). Retorna { url, thumb, publicId }.
  async storeFinal({ origem, type, fileBase, ext }) {
    if (cloudinaryAtivo) {
      const pasta = type === "video" ? "generated/videos" : "generated/images";
      const up = await cloudinary.uploader.upload(origem, {
        folder: pasta,
        public_id: fileBase,
        resource_type: type === "video" ? "video" : "image",
        overwrite: true,
      });
      const thumb = type === "video"
        ? cloudinary.url(up.public_id, { resource_type: "video", format: "jpg", transformation: [{ width: 480, crop: "scale" }] })
        : cloudinary.url(up.public_id, { format: up.format, transformation: [{ width: 480, crop: "scale" }] });
      return { url: up.secure_url, thumb, publicId: up.public_id };
    }
    // fallback local
    const nome = `${fileBase}.${ext}`;
    await baixarPara(origem, path.join(FILES_DIR, nome));
    return { url: `/files/${nome}`, thumb: null, publicId: null };
  },

  // Sobe uma referência (data URL ou caminho local). Retorna URL pública.
  async storeReference({ origem, type }) {
    if (cloudinaryAtivo) {
      const up = await cloudinary.uploader.upload(origem, {
        folder: type === "video" ? "references/videos" : "references/images",
        resource_type: type === "video" ? "video" : "image",
      });
      return up.secure_url;
    }
    return null; // sem Cloudinary o chamador usa fal.storage
  },

  // Sobe áudio de narração (arquivo local); usado só para arquivamento opcional
  async storeAudio(caminho, fileBase) {
    if (!cloudinaryAtivo) return null;
    const up = await cloudinary.uploader.upload(caminho, {
      folder: "generated/audio", public_id: fileBase, resource_type: "video", overwrite: true,
    });
    return up.secure_url;
  },

  // Sobe uma thumbnail local (frame extraído) quando não há Cloudinary — salva em /files
  salvarThumbLocal(caminhoFrame, fileBase) {
    const nome = `${fileBase}-thumb.jpg`;
    fs.copyFileSync(caminhoFrame, path.join(FILES_DIR, nome));
    return `/files/${nome}`;
  },
};
