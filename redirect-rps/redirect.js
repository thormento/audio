// Redirecionador do site de entrada (ex.: chatvito.com).
// GET /            -> 302 para o destino atual
// GET /status      -> destino atual (JSON)
// POST /redirect   -> troca o destino (precisa do token)
import http from "node:http";
import fs from "node:fs";

const PORT = process.env.PORT || 4000;
const TOKEN = process.env.REDIRECT_TOKEN || "troque-este-token";
const ARQUIVO = new URL("./destino.json", import.meta.url);

function lerDestino() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, "utf8")); }
  catch { return { destino: "https://meusite.com/artigo-01", atualizadoEm: null }; }
}

function salvarDestino(destino) {
  const dados = { destino, atualizadoEm: new Date().toISOString() };
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados, null, 2));
  return dados;
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(lerDestino()));
  }

  if (req.method === "POST" && req.url === "/redirect") {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401); return res.end("nao autorizado");
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { destino } = JSON.parse(body);
        if (!/^https?:\/\//.test(destino)) throw new Error("destino invalido");
        const dados = salvarDestino(destino);
        console.log(`[redirect] destino trocado para ${destino}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(dados));
      } catch (e) {
        res.writeHead(400); res.end(e.message);
      }
    });
    return;
  }

  // Qualquer outra rota: redireciona o visitante
  const { destino } = lerDestino();
  res.writeHead(302, { Location: destino, "Cache-Control": "no-store" });
  res.end();
}).listen(PORT, () => console.log(`Redirecionador em http://localhost:${PORT}`));
