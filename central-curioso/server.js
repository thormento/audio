// Central Curioso — servidor simples: arquivos estáticos + API JSON.
// Sem dependências. Dados ficam em data/central.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "central.json");
const PORT = process.env.PORT || 3100;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function lerDados() { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
function salvarDados(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
function corpo(req) {
  return new Promise((ok, erro) => {
    let b = ""; req.on("data", c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { erro(e); } });
    req.on("error", erro);
  });
}
function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
function idUnico(lista, base) { let id = slug(base), n = 2; while (lista.some(x => x.id === id)) id = `${slug(base)}-${n++}`; return id; }
function clienteVazio(d, c) {
  const projetos = {};
  for (const p of d.projetos) projetos[p.id] = { ativo: false, status: "nao_verificado", ultimaVerificacao: "", obs: "", link: "", ofertas: [], copys: [], ...(c.projetos?.[p.id] || {}) };
  for (const pc of Object.values(projetos)) pc.ativo = pc.status === "rodando";
  return { id: c.id, nome: c.nome || "", site: c.site || "", redeId: c.redeId || "", notas: c.notas || "", projetos };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const partes = url.pathname.split("/").filter(Boolean);
  try {
    if (partes[0] === "api") {
      const d = lerDados();
      const [, recurso, id] = partes;

      if (req.method === "GET" && !recurso) return json(res, 200, d);

      if (recurso === "redes") {
        if (req.method === "POST") {
          const b = await corpo(req);
          if (!b.nome?.trim()) return json(res, 400, { erro: "Nome obrigatório" });
          const rede = { id: idUnico(d.redes, b.nome), nome: b.nome.trim() };
          d.redes.push(rede); salvarDados(d); return json(res, 201, rede);
        }
        if (req.method === "PUT" && id) {
          const r = d.redes.find(x => x.id === id); if (!r) return json(res, 404, { erro: "Rede não encontrada" });
          const b = await corpo(req); if (b.nome?.trim()) r.nome = b.nome.trim(); salvarDados(d); return json(res, 200, r);
        }
        if (req.method === "DELETE" && id) {
          d.redes = d.redes.filter(x => x.id !== id);
          d.clientes = d.clientes.filter(c => c.redeId !== id);
          salvarDados(d); return json(res, 200, { ok: true });
        }
      }

      if (recurso === "clientes") {
        if (req.method === "POST") {
          const b = await corpo(req);
          if (!b.nome?.trim()) return json(res, 400, { erro: "Nome obrigatório" });
          if (!d.redes.some(r => r.id === b.redeId)) return json(res, 400, { erro: "Rede inválida" });
          const c = clienteVazio(d, { ...b, id: idUnico(d.clientes, b.nome), nome: b.nome.trim() });
          d.clientes.push(c); salvarDados(d); return json(res, 201, c);
        }
        if (req.method === "PUT" && id) {
          const i = d.clientes.findIndex(x => x.id === id); if (i < 0) return json(res, 404, { erro: "Cliente não encontrado" });
          const b = await corpo(req);
          d.clientes[i] = clienteVazio(d, { ...d.clientes[i], ...b, id, projetos: { ...d.clientes[i].projetos, ...(b.projetos || {}) } });
          salvarDados(d); return json(res, 200, d.clientes[i]);
        }
        if (req.method === "DELETE" && id) {
          d.clientes = d.clientes.filter(x => x.id !== id); salvarDados(d); return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { erro: "Rota não encontrada" });
    }

    // Estáticos (SPA: qualquer rota cai no index.html)
    let arq = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(PUBLIC, "index.html");
    res.writeHead(200, { "Content-Type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  } catch (e) {
    json(res, 500, { erro: e.message });
  }
});

server.listen(PORT, () => console.log(`Central Curioso em http://localhost:${PORT}`));
