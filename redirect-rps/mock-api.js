// API falsa de RPS só para testar localmente. Responde valores aleatórios.
// Troque pela sua API real ajustando RPS_API_URL no bot.
import http from "node:http";

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { urls = [] } = JSON.parse(body || "{}");
    const dados = urls.map((url) => ({ url, rps: Math.round(Math.random() * 200 * 100) / 100 }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(dados));
  });
}).listen(5000, () => console.log("API falsa de RPS em http://localhost:5000"));
