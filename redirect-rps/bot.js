// Bot: a cada 30 minutos consulta o RPS das URLs e troca o redirect
// para a URL com maior RPS.
//
// Variáveis de ambiente:
//   RPS_API_URL     - endpoint da sua API de RPS (ex.: https://api.meusite.com/rps)
//   RPS_API_KEY     - chave da sua API (opcional)
//   REDIRECT_URL    - base do redirecionador (ex.: https://chatvito.com)
//   REDIRECT_TOKEN  - token aceito pelo POST /redirect
//   INTERVALO_MIN   - intervalo em minutos (padrão 30)
import fs from "node:fs";

const RPS_API_URL = process.env.RPS_API_URL || "https://api.meusite.com/rps";
const RPS_API_KEY = process.env.RPS_API_KEY || "";
const REDIRECT_URL = process.env.REDIRECT_URL || "http://localhost:4000";
const REDIRECT_TOKEN = process.env.REDIRECT_TOKEN || "troque-este-token";
const INTERVALO_MS = (Number(process.env.INTERVALO_MIN) || 30) * 60 * 1000;

function lerUrls() {
  const lista = JSON.parse(fs.readFileSync(new URL("./urls.json", import.meta.url), "utf8"));
  return lista.filter((u) => u.ativo).map((u) => u.url);
}

// Chama a SUA API. Ajuste aqui o formato da requisição e da resposta.
// Esperado: [{ url, rps }, ...]
async function consultarRps(urls) {
  const r = await fetch(RPS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RPS_API_KEY}` },
    body: JSON.stringify({ urls }),
  });
  if (!r.ok) throw new Error(`API de RPS respondeu ${r.status}`);
  return r.json();
}

async function destinoAtual() {
  const r = await fetch(`${REDIRECT_URL}/status`);
  return (await r.json()).destino;
}

async function trocarDestino(destino) {
  const r = await fetch(`${REDIRECT_URL}/redirect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${REDIRECT_TOKEN}` },
    body: JSON.stringify({ destino }),
  });
  if (!r.ok) throw new Error(`redirecionador respondeu ${r.status}`);
}

async function ciclo() {
  const hora = new Date().toISOString();
  try {
    const urls = lerUrls();
    const resultados = await consultarRps(urls);

    // Ordena do maior para o menor RPS
    resultados.sort((a, b) => b.rps - a.rps);
    const vencedora = resultados[0];
    const atual = await destinoAtual();

    console.log(`[${hora}] RPS:`);
    for (const r of resultados) console.log(`  ${r.rps.toFixed(2).padStart(8)}  ${r.url}`);

    const rpsAtual = resultados.find((r) => r.url === atual)?.rps ?? -1;

    // Empate com o destino atual: mantém. Só troca se a vencedora for maior.
    if (vencedora.url !== atual && vencedora.rps > rpsAtual) {
      await trocarDestino(vencedora.url);
      console.log(`[${hora}] TROCA: ${atual} -> ${vencedora.url} (RPS ${vencedora.rps})`);
    } else {
      console.log(`[${hora}] mantém ${atual} (RPS ${rpsAtual})`);
    }
  } catch (e) {
    // Em caso de erro, não troca nada: o destino atual continua valendo.
    console.error(`[${hora}] erro, destino mantido: ${e.message}`);
  }
}

ciclo();
setInterval(ciclo, INTERVALO_MS);
