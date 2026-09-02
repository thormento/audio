// Banco simples em JSON: coleção "generations" em data/generations.json
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "./data";
const ARQ = path.join(DATA_DIR, "generations.json");
const MAX_REGISTROS = 200; // registros antigos saem do histórico (arquivos finais não são apagados)

fs.mkdirSync(DATA_DIR, { recursive: true });

let generations = [];
try { generations = JSON.parse(fs.readFileSync(ARQ, "utf8")); } catch { generations = []; }

let salvarAgendado = null;
function persistir() {
  clearTimeout(salvarAgendado);
  salvarAgendado = setTimeout(() => {
    fs.writeFileSync(ARQ, JSON.stringify(generations.slice(0, MAX_REGISTROS), null, 2));
  }, 200);
}

export const db = {
  all: () => generations,
  get: (id) => generations.find((g) => g.id === id),
  insert(gen) {
    generations.unshift(gen);
    persistir();
    return gen;
  },
  update(id, patch) {
    const g = this.get(id);
    if (g) { Object.assign(g, patch, { updatedAt: new Date().toISOString() }); persistir(); }
    return g;
  },
  remove(id) {
    generations = generations.filter((g) => g.id !== id);
    persistir();
  },
  // Sequência diária para nomes de arquivo: image-2026-09-02-001, video-...
  nextSeq(type, dataStr) {
    const prefixo = `${type}-${dataStr}-`;
    const usados = generations
      .filter((g) => g.fileBase?.startsWith(prefixo))
      .map((g) => Number(g.fileBase.slice(prefixo.length)) || 0);
    return (usados.length ? Math.max(...usados) : 0) + 1;
  },
};
