// Estado da interface
let modelos = [];
let tipo = "image";
let formato = null;
let duracao = null;
let referenciaUrl = null;

const $ = (s) => document.querySelector(s);
const rotulos = { na_fila: "🕒 Na fila", gerando: "⏳ Gerando...", processando: "⚙️ Processando...", concluido: "✅ Concluído", erro: "❌ Erro" };

async function api(caminho, opcoes) {
  const r = await fetch(caminho, opcoes);
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `HTTP ${r.status}`);
  return dados;
}

// ------------------------- Montagem dos controles -------------------------
function modeloAtual() {
  return modelos.find((m) => m.id === $("#modelo").value);
}

function renderModelos() {
  const doTipo = modelos.filter((m) => m.type === tipo);
  $("#modelo").innerHTML = doTipo.map((m) => `<option value="${m.id}">${m.nome}</option>`).join("");
  renderOpcoes();
}

function renderOpcoes() {
  const m = modeloAtual();
  if (!m) return;
  // formatos
  if (!m.formats.includes(formato)) formato = m.formats[0];
  $("#formatos").innerHTML = m.formats
    .map((f) => `<button class="chip ${f === formato ? "ativo" : ""}" data-f="${f}">${f}</button>`).join("");
  // durações (só vídeo, só as aceitas pelo modelo)
  $("#bloco-duracao").hidden = m.type !== "video";
  if (m.type === "video") {
    if (!m.durations.includes(duracao)) duracao = m.durations[0];
    $("#duracoes").innerHTML = m.durations
      .map((d) => `<button class="chip ${d === duracao ? "ativo" : ""}" data-d="${d}">${d}s</button>`).join("");
  }
  // avançado: só campos compatíveis com o modelo
  const campos = [];
  if (m.advanced.includes("seed"))
    campos.push(`<label>Seed <span class="dica">(vazio = aleatória)</span></label><input type="number" id="adv-seed" />`);
  if (m.advanced.includes("steps"))
    campos.push(`<label>Steps <span class="dica">(máx ${m.stepsMax})</span></label><input type="number" id="adv-steps" value="${m.stepsDefault}" min="1" max="${m.stepsMax}" />`);
  if (m.advanced.includes("guidance"))
    campos.push(`<label>Guidance</label><input type="number" id="adv-guidance" value="${m.guidanceDefault}" step="0.5" />`);
  if (m.advanced.includes("cfg_scale"))
    campos.push(`<label>CFG scale</label><input type="number" id="adv-cfg" value="${m.cfgDefault}" step="0.1" min="0" max="1" />`);
  if (m.advanced.includes("negative_prompt"))
    campos.push(`<label>Prompt negativo</label><textarea id="adv-negativo" rows="2" placeholder="blurry, distorted hands, extra fingers, bad anatomy"></textarea>`);
  $("#avancado-campos").innerHTML = campos.join("");
}

// ------------------------------ Eventos -----------------------------------
$("#tipo").addEventListener("click", (e) => {
  if (!e.target.dataset.tipo) return;
  tipo = e.target.dataset.tipo;
  document.querySelectorAll("#tipo .chip").forEach((c) => c.classList.toggle("ativo", c.dataset.tipo === tipo));
  renderModelos();
});
$("#modelo").addEventListener("change", renderOpcoes);
$("#formatos").addEventListener("click", (e) => { if (e.target.dataset.f) { formato = e.target.dataset.f; renderOpcoes(); } });
$("#duracoes").addEventListener("click", (e) => { if (e.target.dataset.d) { duracao = Number(e.target.dataset.d); renderOpcoes(); } });

$("#qtd-menos").onclick = () => { const i = $("#quantidade"); i.value = Math.max(1, Number(i.value) - 1); };
$("#qtd-mais").onclick = () => { const i = $("#quantidade"); i.value = Math.min(20, Number(i.value) + 1); };

$("#btn-limpar").onclick = () => { $("#prompt").value = ""; };

$("#btn-melhorar").onclick = async () => {
  const prompt = $("#prompt").value.trim();
  if (!prompt) return;
  try {
    const r = await api("/api/enhance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, type: tipo }) });
    $("#prompt").value = r.prompt;
  } catch (e) { alert("Erro ao melhorar prompt: " + e.message); }
};

$("#btn-ref").onclick = () => $("#input-ref").click();
$("#input-ref").onchange = () => {
  const arq = $("#input-ref").files[0];
  if (!arq) return;
  const leitor = new FileReader();
  $("#ref-status").textContent = "Enviando...";
  leitor.onload = async () => {
    try {
      const r = await api("/api/reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: leitor.result }) });
      referenciaUrl = r.url;
      $("#ref-status").textContent = arq.name;
      $("#btn-ref-remover").hidden = false;
    } catch (e) {
      $("#ref-status").textContent = "Erro: " + e.message;
    }
  };
  leitor.readAsDataURL(arq);
};
$("#btn-ref-remover").onclick = () => {
  referenciaUrl = null;
  $("#input-ref").value = "";
  $("#ref-status").textContent = "";
  $("#btn-ref-remover").hidden = true;
};

function coletarAvancado() {
  return {
    seed: $("#adv-seed")?.value ?? "",
    steps: $("#adv-steps")?.value ?? "",
    guidance: $("#adv-guidance")?.value ?? "",
    cfg_scale: $("#adv-cfg")?.value ?? "",
    negative_prompt: $("#adv-negativo")?.value?.trim() ?? "",
  };
}

async function gerar(params) {
  try {
    $("#btn-gerar").disabled = true;
    await api("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
    atualizarJobs();
  } catch (e) { alert("Erro ao gerar: " + e.message); }
  finally { $("#btn-gerar").disabled = false; }
}

$("#btn-gerar").onclick = () => {
  const prompt = $("#prompt").value.trim();
  if (!prompt) return alert("Escreva um prompt primeiro.");
  gerar({
    modelId: $("#modelo").value, prompt, quantity: Number($("#quantidade").value) || 1,
    format: formato, duration: duracao, referenceUrl: referenciaUrl, advanced: coletarAvancado(),
  });
};

// ------------------------------ Cards / fila -------------------------------
function cardJob(j) {
  const nome = `${j.type === "video" ? "Vídeo" : "Imagem"} ${String(j.indice).padStart(2, "0")}`;
  let midia = `<div class="spinner"></div>`;
  if (j.status === "concluido") {
    midia = j.type === "video"
      ? `<video class="midia" src="${j.url}" poster="${j.thumb || ""}" controls preload="metadata"></video>`
      : `<img class="midia" src="${j.thumb || j.url}" loading="lazy" />`;
  } else if (j.status === "erro") {
    midia = `<div class="corpo erro-msg">${j.error || "erro desconhecido"}</div>`;
  }
  const acoes = [];
  if (j.status === "concluido") acoes.push(`<a class="secundario" href="${j.url}" target="_blank" download>Download</a>`);
  if (j.status === "erro") acoes.push(`<button class="secundario" data-acao="retry" data-id="${j.id}">Tentar novamente</button>`);
  if (["concluido", "erro"].includes(j.status)) {
    acoes.push(`<button class="secundario" data-acao="regen" data-id="${j.id}">Gerar novamente</button>`);
    acoes.push(`<button class="secundario" data-acao="copiar" data-id="${j.id}">Copiar prompt</button>`);
    acoes.push(`<button class="secundario" data-acao="excluir" data-id="${j.id}">Excluir</button>`);
  }
  return `<div class="card">${midia}<div class="corpo">
    <div class="status ${j.status}">${nome} — ${rotulos[j.status]}</div>
    <div class="prompt">${j.prompt}</div>
    <div class="acoes">${acoes.join("")}</div></div></div>`;
}

let jobsCache = [];
async function atualizarJobs() {
  try { jobsCache = await api("/api/jobs"); } catch { return; }
  $("#cards").innerHTML = jobsCache.slice().reverse().map(cardJob).join("") || `<span class="dica">Nenhuma geração ainda.</span>`;
  if (jobsCache.some((j) => ["na_fila", "gerando", "processando"].includes(j.status))) {
    clearTimeout(atualizarJobs._t);
    atualizarJobs._t = setTimeout(atualizarJobs, 2000);
  } else {
    atualizarHistorico();
  }
}

$("#cards").addEventListener("click", async (e) => {
  const { acao, id } = e.target.dataset;
  if (!acao) return;
  const j = jobsCache.find((x) => x.id === id);
  if (acao === "retry") { await api(`/api/jobs/${id}/retry`, { method: "POST" }); atualizarJobs(); }
  if (acao === "excluir") { await api(`/api/jobs/${id}`, { method: "DELETE" }); atualizarJobs(); }
  if (acao === "copiar" && j) navigator.clipboard.writeText(j.prompt);
  if (acao === "regen" && j) gerar({ ...j.params, quantity: 1 });
});

// ------------------------------ Histórico ----------------------------------
async function atualizarHistorico() {
  let hist = [];
  try { hist = await api("/api/history"); } catch { return; }
  $("#historico").innerHTML = hist.map((h) => `<div class="card">
    ${h.type === "video"
      ? `<video class="midia" src="${h.url}" poster="${h.thumb || ""}" controls preload="none"></video>`
      : `<img class="midia" src="${h.thumb || h.url}" loading="lazy" />`}
    <div class="corpo">
      <div class="prompt">${h.prompt}</div>
      <div class="dica">${h.modelo} · ${h.format}${h.duration ? " · " + h.duration + "s" : ""} · ${new Date(h.data).toLocaleString("pt-BR")}</div>
      <div class="acoes">
        <a class="secundario" href="${h.url}" target="_blank" download>Download</a>
        <button class="secundario" data-hist-del="${h.id}">Excluir</button>
      </div></div></div>`).join("") || `<span class="dica">Histórico vazio.</span>`;
}

$("#historico").addEventListener("click", async (e) => {
  const id = e.target.dataset.histDel;
  if (id) { await api(`/api/history/${id}`, { method: "DELETE" }); atualizarHistorico(); }
});

// ------------------------------- Início ------------------------------------
(async () => {
  modelos = await api("/api/models");
  renderModelos();
  atualizarJobs();
  atualizarHistorico();
})();
