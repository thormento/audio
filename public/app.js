// Frontend do Gerador — tela única. Estado do formulário + polling dos jobs.
let modelos = [];
let config = { voices: [], languages: [], ffmpeg: true };
let tipo = "image";
let formato = null;
let duracao = null;
let referencia = null; // { url, type }
let narracaoOn = false;
let narracaoVel = "normal";
let legendaOn = false;
let legendaFonte = "narration";
let legendaPos = "inferior";
let legendaEstilo = "padrao";
let lotesDaSessao = new Set(JSON.parse(sessionStorage.getItem("lotes") || "[]"));
let ultimoLoteParams = null;
let geracoes = [];
let selecionados = new Set();

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const rotulos = { queued: "🕒 NA FILA", generating: "⏳ GERANDO…", processing: "⚙️ PROCESSANDO…", completed: "✅ CONCLUÍDO", error: "❌ ERRO" };

async function api(caminho, opcoes) {
  const r = await fetch(caminho, opcoes);
  const ct = r.headers.get("content-type") || "";
  const dados = ct.includes("json") ? await r.json().catch(() => ({})) : null;
  if (!r.ok) throw new Error(dados?.erro || `HTTP ${r.status}`);
  return dados ?? r;
}
const post = (p, corpo) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

// ------------------------- Formulário -------------------------
function modeloAtual() { return modelos.find((m) => m.id === $("#modelo").value); }

function chipsAtivos(sel, attr, valor) {
  $$(sel + " .chip").forEach((c) => c.classList.toggle("ativo", c.dataset[attr] == valor));
}

function renderModelos() {
  const doTipo = modelos.filter((m) => m.type === tipo);
  $("#modelo").innerHTML = doTipo.map((m) => `<option value="${m.id}">${m.nome}</option>`).join("");
  renderOpcoes();
}

function renderOpcoes() {
  const m = modeloAtual();
  if (!m) return;
  if (!m.formats.includes(formato)) formato = m.formats[0];
  $("#formatos").innerHTML = m.formats.map((f) => `<button class="chip ${f === formato ? "ativo" : ""}" data-f="${f}">${f}</button>`).join("");

  const ehVideo = m.type === "video";
  $("#bloco-duracao").hidden = !ehVideo;
  $("#bloco-narracao").hidden = !ehVideo;
  $("#bloco-legenda").hidden = !ehVideo;
  if (ehVideo) {
    if (!m.durations.includes(duracao)) duracao = m.durations[0];
    $("#duracoes").innerHTML = m.durations.map((d) => `<button class="chip ${d === duracao ? "ativo" : ""}" data-d="${d}">${d}s</button>`).join("");
  }

  // referência: aviso de compatibilidade
  const aceita = [];
  if (m.ref.image) aceita.push("imagem");
  if (m.ref.video) aceita.push("vídeo (usa um frame como referência visual)");
  $("#ref-aviso").textContent = aceita.length ? `Este modelo aceita referência de: ${aceita.join(", ")}.` : "Este modelo não aceita referência.";
  if (referencia && ((referencia.type === "image" && !m.ref.image) || (referencia.type === "video" && !m.ref.video))) {
    $("#ref-aviso").textContent += " A referência atual será ignorada por incompatibilidade.";
  }

  // avançado: só o que o modelo suporta
  const c = [];
  const d = m.defaults || {};
  if (m.advanced.includes("seed")) c.push(`<label>Seed <span class="dica">(vazio = aleatória; em lote incrementa por item)</span></label><input type="number" id="adv-seed" />`);
  if (m.advanced.includes("steps")) c.push(`<label>Steps <span class="dica">(máx ${m.limits.stepsMax})</span></label><input type="number" id="adv-steps" value="${d.steps}" min="1" max="${m.limits.stepsMax}" />`);
  if (m.advanced.includes("guidance")) c.push(`<label>Guidance</label><input type="number" id="adv-guidance" value="${d.guidance}" step="0.5" />`);
  if (m.advanced.includes("strength")) c.push(`<label>Strength da referência <span class="dica">(0 a 1)</span></label><input type="number" id="adv-strength" value="${d.strength}" step="0.05" min="0" max="1" />`);
  if (m.advanced.includes("cfg_scale")) c.push(`<label>CFG scale</label><input type="number" id="adv-cfg" value="${d.cfg_scale}" step="0.1" min="0" max="1" />`);
  if (m.advanced.includes("negative_prompt")) c.push(`<label>Prompt negativo</label><textarea id="adv-negativo" rows="2" placeholder="blurry, distorted hands, extra fingers, bad anatomy"></textarea>`);
  $("#avancado-campos").innerHTML = c.join("");
}

function setTipo(novo) {
  tipo = novo;
  chipsAtivos("#tipo", "tipo", tipo);
  renderModelos();
}

$("#tipo").addEventListener("click", (e) => { if (e.target.dataset.tipo) setTipo(e.target.dataset.tipo); });
$("#modelo").addEventListener("change", renderOpcoes);
$("#formatos").addEventListener("click", (e) => { if (e.target.dataset.f) { formato = e.target.dataset.f; renderOpcoes(); } });
$("#duracoes").addEventListener("click", (e) => { if (e.target.dataset.d) { duracao = Number(e.target.dataset.d); renderOpcoes(); } });

$("#qtd-menos").onclick = () => { const i = $("#quantidade"); i.value = Math.max(1, Number(i.value) - 1); };
$("#qtd-mais").onclick = () => { const i = $("#quantidade"); i.value = Math.min(20, Number(i.value) + 1); };

$("#btn-limpar").onclick = () => { $("#prompt").value = ""; };
$("#btn-copiar").onclick = () => navigator.clipboard.writeText($("#prompt").value);
$("#btn-melhorar").onclick = async () => {
  const prompt = $("#prompt").value.trim();
  if (!prompt) return;
  try { $("#prompt").value = (await post("/api/enhance", { prompt, type: tipo })).prompt; }
  catch (e) { alert("Erro ao melhorar prompt: " + e.message); }
};

// narração / legenda
$("#narracao-toggle").addEventListener("click", (e) => {
  if (e.target.dataset.narr === undefined) return;
  narracaoOn = e.target.dataset.narr === "1";
  chipsAtivos("#narracao-toggle", "narr", narracaoOn ? "1" : "0");
  $("#narracao-campos").hidden = !narracaoOn;
});
$("#narracao-vel").addEventListener("click", (e) => { if (e.target.dataset.vel) { narracaoVel = e.target.dataset.vel; chipsAtivos("#narracao-vel", "vel", narracaoVel); } });
$("#legenda-toggle").addEventListener("click", (e) => {
  if (e.target.dataset.leg === undefined) return;
  legendaOn = e.target.dataset.leg === "1";
  chipsAtivos("#legenda-toggle", "leg", legendaOn ? "1" : "0");
  $("#legenda-campos").hidden = !legendaOn;
});
$("#legenda-fonte").addEventListener("click", (e) => {
  if (!e.target.dataset.fonte) return;
  legendaFonte = e.target.dataset.fonte;
  chipsAtivos("#legenda-fonte", "fonte", legendaFonte);
  $("#legenda-texto").hidden = legendaFonte !== "custom";
});
$("#legenda-pos").addEventListener("click", (e) => { if (e.target.dataset.pos) { legendaPos = e.target.dataset.pos; chipsAtivos("#legenda-pos", "pos", legendaPos); } });
$("#legenda-estilo").addEventListener("click", (e) => { if (e.target.dataset.estilo) { legendaEstilo = e.target.dataset.estilo; chipsAtivos("#legenda-estilo", "estilo", legendaEstilo); } });

// referência
function mostrarReferencia() {
  const tem = !!referencia;
  $("#ref-preview").hidden = !tem;
  $("#btn-ref-remover").hidden = !tem;
  $("#ref-img").hidden = !(tem && referencia.type === "image");
  $("#ref-video").hidden = !(tem && referencia.type === "video");
  if (tem && referencia.type === "image") $("#ref-img").src = referencia.url;
  if (tem && referencia.type === "video") $("#ref-video").src = referencia.url;
  renderOpcoes();
}
$("#btn-ref").onclick = () => $("#input-ref").click();
$("#input-ref").onchange = () => {
  const arq = $("#input-ref").files[0];
  if (!arq) return;
  const leitor = new FileReader();
  $("#btn-ref").textContent = "Enviando…";
  leitor.onload = async () => {
    try {
      const r = await post("/api/reference", { dataUrl: leitor.result });
      referencia = { url: r.url, type: r.type };
      mostrarReferencia();
    } catch (e) { alert("Erro no upload da referência: " + e.message); }
    finally { $("#btn-ref").textContent = "ADICIONAR REFERÊNCIA"; }
  };
  leitor.readAsDataURL(arq);
};
$("#btn-ref-remover").onclick = () => { referencia = null; $("#input-ref").value = ""; mostrarReferencia(); };

// ------------------------- Gerar -------------------------
function coletarAvancado() {
  return {
    seed: $("#adv-seed")?.value ?? "",
    steps: $("#adv-steps")?.value ?? "",
    guidance: $("#adv-guidance")?.value ?? "",
    strength: $("#adv-strength")?.value ?? "",
    cfg_scale: $("#adv-cfg")?.value ?? "",
    negative_prompt: $("#adv-negativo")?.value?.trim() ?? "",
  };
}

function paramsDoFormulario() {
  const m = modeloAtual();
  const refCompativel = referencia && ((referencia.type === "image" && m.ref.image) || (referencia.type === "video" && m.ref.video));
  return {
    modelId: m.id,
    prompt: $("#prompt").value.trim(),
    quantity: Number($("#quantidade").value) || 1,
    format: formato,
    duration: duracao,
    reference: refCompativel ? referencia : null,
    narration: { enabled: narracaoOn, text: $("#narracao-texto").value, voice: $("#narracao-voz").value, language: $("#narracao-idioma").value, speed: narracaoVel },
    subtitle: { enabled: legendaOn, source: legendaFonte, text: $("#legenda-texto").value, position: legendaPos, style: legendaEstilo },
    advanced: coletarAvancado(),
  };
}

async function dispararLote(params) {
  try {
    const r = await post("/api/generate", params);
    lotesDaSessao.add(r.batchId);
    sessionStorage.setItem("lotes", JSON.stringify([...lotesDaSessao]));
    ultimoLoteParams = params;
    atualizar();
  } catch (e) { alert("Erro ao gerar: " + e.message); }
}

$("#btn-gerar").onclick = () => {
  const params = paramsDoFormulario();
  if (!params.prompt) return alert("Escreva um prompt primeiro.");
  if (params.narration.enabled && !params.narration.text.trim()) return alert("Preencha o texto da narração.");
  if (params.subtitle.enabled && params.subtitle.source === "custom" && !params.subtitle.text.trim()) return alert("Preencha o texto da legenda.");
  if (params.subtitle.enabled && params.subtitle.source === "narration" && !params.narration.enabled) return alert("A legenda usa o texto da narração — ative a narração ou use texto personalizado.");
  dispararLote(params);
};

// ------------------------- Preencher formulário a partir de uma geração -------------------------
function preencherFormulario(g, { manterRef = true } = {}) {
  setTipo(g.type);
  $("#modelo").value = g.model;
  renderOpcoes();
  $("#prompt").value = g.prompt;
  formato = g.format;
  duracao = g.duration;
  narracaoOn = !!g.narrationEnabled;
  chipsAtivos("#narracao-toggle", "narr", narracaoOn ? "1" : "0");
  $("#narracao-campos").hidden = !narracaoOn;
  if (g.narrationText) $("#narracao-texto").value = g.narrationText;
  if (g.voice) $("#narracao-voz").value = g.voice;
  if (g.language) $("#narracao-idioma").value = g.language;
  if (g.speed) { narracaoVel = g.speed; chipsAtivos("#narracao-vel", "vel", narracaoVel); }
  legendaOn = !!g.subtitleEnabled;
  chipsAtivos("#legenda-toggle", "leg", legendaOn ? "1" : "0");
  $("#legenda-campos").hidden = !legendaOn;
  legendaFonte = g.subtitleSource || "narration";
  chipsAtivos("#legenda-fonte", "fonte", legendaFonte);
  $("#legenda-texto").hidden = legendaFonte !== "custom";
  if (g.subtitleText) $("#legenda-texto").value = g.subtitleText;
  legendaPos = g.subtitlePosition || "inferior";
  legendaEstilo = g.subtitleStyle || "padrao";
  chipsAtivos("#legenda-pos", "pos", legendaPos);
  chipsAtivos("#legenda-estilo", "estilo", legendaEstilo);
  if (manterRef && g.referenceUrl) referencia = { url: g.referenceUrl, type: g.referenceType };
  renderOpcoes();
  // reaplica valores avançados salvos
  const a = g.advanced || {};
  if ($("#adv-seed") && a.seed) $("#adv-seed").value = a.seed;
  if ($("#adv-steps") && a.steps) $("#adv-steps").value = a.steps;
  if ($("#adv-guidance") && a.guidance) $("#adv-guidance").value = a.guidance;
  if ($("#adv-strength") && a.strength) $("#adv-strength").value = a.strength;
  if ($("#adv-cfg") && a.cfg_scale) $("#adv-cfg").value = a.cfg_scale;
  if ($("#adv-negativo") && a.negative_prompt) $("#adv-negativo").value = a.negative_prompt;
  mostrarReferencia();
  document.querySelector(".painel").scrollTo({ top: 0 });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function usarComoReferencia(g, alvo) {
  referencia = { url: g.outputUrl, type: g.type }; // reutiliza a URL já armazenada (sem novo upload)
  setTipo(alvo);
  // escolhe o primeiro modelo do tipo que aceite essa referência
  const compativel = modelos.find((m) => m.type === alvo && (g.type === "image" ? m.ref.image : m.ref.video));
  if (compativel) { $("#modelo").value = compativel.id; renderOpcoes(); }
  mostrarReferencia();
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#prompt").focus();
}

// ------------------------- Cards -------------------------
function midiaCard(g) {
  if (g.status === "completed") {
    return g.type === "video"
      ? `<video class="midia" src="${g.outputUrl}" poster="${g.thumbnailUrl || ""}" controls preload="none"></video>`
      : `<img class="midia" src="${g.thumbnailUrl || g.outputUrl}" loading="lazy" />`;
  }
  if (g.status === "error") return `<div class="erro-msg">ERRO NA GERAÇÃO<br>${g.error || ""}</div>`;
  return `<div class="spinner"></div>`;
}

function cardHtml(g, { comCheckbox }) {
  const nome = `${g.type === "video" ? "Vídeo" : "Imagem"} ${String(g.indice || 0).padStart(2, "0")}`;
  const meta = [
    g.modelNome, g.format,
    g.duration ? g.duration + "s" : null,
    g.type === "video" ? `narração ${g.narrationEnabled ? "SIM" : "NÃO"}` : null,
    g.type === "video" ? `legenda ${g.subtitleEnabled ? "SIM" : "NÃO"}` : null,
    new Date(g.createdAt).toLocaleString("pt-BR"),
  ].filter(Boolean).join(" · ");
  const a = [];
  if (g.status === "completed") a.push(`<a class="sec" href="/api/download/${g.id}">DOWNLOAD</a>`);
  if (g.status === "error") a.push(`<button class="sec" data-acao="retry" data-id="${g.id}">TENTAR NOVAMENTE</button>`);
  if (["completed", "error"].includes(g.status)) {
    a.push(`<button class="sec" data-acao="regen" data-id="${g.id}">GERAR NOVAMENTE</button>`);
    a.push(`<button class="sec" data-acao="mais" data-id="${g.id}">GERAR MAIS NESTE MODELO</button>`);
    if (g.status === "completed") {
      a.push(`<button class="sec" data-acao="ref-img" data-id="${g.id}">USAR COMO REFERÊNCIA P/ IMAGEM</button>`);
      a.push(`<button class="sec" data-acao="ref-vid" data-id="${g.id}">USAR COMO REFERÊNCIA P/ VÍDEO</button>`);
    }
    a.push(`<button class="sec" data-acao="excluir" data-id="${g.id}">EXCLUIR</button>`);
  }
  const check = comCheckbox && g.status === "completed"
    ? `<input type="checkbox" class="marcar" data-sel="${g.id}" ${selecionados.has(g.id) ? "checked" : ""} />` : "";
  return `<div class="card">${check}${midiaCard(g)}<div class="corpo">
    <div class="status ${g.status}">${nome} — ${rotulos[g.status]}</div>
    <div class="prompt">${g.prompt}</div>
    <div class="meta">${meta}</div>
    <div class="acoes">${a.join("")}</div></div></div>`;
}

let pollTimer = null;
async function atualizar() {
  try { geracoes = await api("/api/generations"); } catch { return; }
  const daSessao = geracoes.filter((g) => lotesDaSessao.has(g.batchId));
  $("#cards").innerHTML = daSessao.map((g) => cardHtml(g, { comCheckbox: true })).join("") || `<span class="dica">Nenhuma geração nesta sessão. Clique em GERAR.</span>`;
  const recentes = geracoes.filter((g) => g.status === "completed");
  $("#historico").innerHTML = recentes.map((g) => cardHtml(g, { comCheckbox: false })).join("") || `<span class="dica">Histórico vazio.</span>`;

  const ativo = geracoes.some((g) => ["queued", "generating", "processing"].includes(g.status));
  $("#btn-gerar").textContent = ativo ? "GERANDO…" : "GERAR";
  clearTimeout(pollTimer);
  if (ativo) pollTimer = setTimeout(atualizar, 2500);
}

document.body.addEventListener("click", async (e) => {
  const { acao, id, sel } = e.target.dataset;
  if (sel !== undefined) { e.target.checked ? selecionados.add(sel) : selecionados.delete(sel); return; }
  if (!acao) return;
  const g = geracoes.find((x) => x.id === id);
  try {
    if (acao === "retry") { await post(`/api/generations/${id}/retry`); atualizar(); }
    if (acao === "excluir") { await api(`/api/generations/${id}`, { method: "DELETE" }); selecionados.delete(id); atualizar(); }
    if (acao === "regen" && g) dispararLote({ ...paramsDeGeracao(g), quantity: 1 });
    if (acao === "mais" && g) { preencherFormulario(g); $("#quantidade").focus(); $("#quantidade").select(); }
    if (acao === "ref-img" && g) usarComoReferencia(g, "image");
    if (acao === "ref-vid" && g) usarComoReferencia(g, "video");
  } catch (err) { alert("Erro: " + err.message); }
});

// Reconstrói os params de /api/generate a partir de um registro salvo (repete tudo)
function paramsDeGeracao(g) {
  return {
    modelId: g.model, prompt: g.prompt, quantity: 1, format: g.format, duration: g.duration,
    reference: g.referenceUrl ? { url: g.referenceUrl, type: g.referenceType } : null,
    narration: { enabled: g.narrationEnabled, text: g.narrationText, voice: g.voice, language: g.language, speed: g.speed },
    subtitle: { enabled: g.subtitleEnabled, source: g.subtitleSource, text: g.subtitleText, position: g.subtitlePosition, style: g.subtitleStyle },
    advanced: g.advanced || {},
  };
}

// ------------------------- Barra do lote -------------------------
async function baixarZip(corpo) {
  try {
    const r = await fetch("/api/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `HTTP ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (r.headers.get("content-disposition")?.match(/filename="(.+)"/) || [])[1] || "generation.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { alert("Erro no download: " + e.message); }
}

$("#btn-zip-todos").onclick = () => {
  const ids = geracoes.filter((g) => lotesDaSessao.has(g.batchId) && g.status === "completed").map((g) => g.id);
  if (!ids.length) return alert("Nenhum resultado concluído nesta sessão.");
  baixarZip({ ids });
};
$("#btn-zip-sel").onclick = () => {
  if (!selecionados.size) return alert("Selecione ao menos um resultado (checkbox no card).");
  baixarZip({ ids: [...selecionados] });
};
$("#btn-sel-todos").onclick = () => {
  geracoes.filter((g) => lotesDaSessao.has(g.batchId) && g.status === "completed").forEach((g) => selecionados.add(g.id));
  atualizar();
};
$("#btn-sel-nenhum").onclick = () => { selecionados.clear(); atualizar(); };
$("#btn-limpar-res").onclick = () => { lotesDaSessao.clear(); selecionados.clear(); sessionStorage.removeItem("lotes"); atualizar(); };
$("#btn-gerar-mais").onclick = () => {
  if (!ultimoLoteParams) return alert("Nenhum lote gerado ainda nesta sessão.");
  $("#quantidade").focus(); $("#quantidade").select();
  window.scrollTo({ top: 0, behavior: "smooth" });
  dispararLote({ ...ultimoLoteParams, quantity: Number($("#quantidade").value) || ultimoLoteParams.quantity });
};

// ------------------------- Início -------------------------
(async () => {
  [modelos, config] = await Promise.all([api("/api/models"), api("/api/config")]);
  $("#narracao-voz").innerHTML = config.voices.map((v) => `<option value="${v.id}">${v.nome}</option>`).join("");
  $("#narracao-idioma").innerHTML = config.languages.map((l) => `<option value="${l.id}">${l.nome}</option>`).join("");
  if (!config.ffmpeg) $("#aviso-servidor").textContent = "Aviso: ffmpeg não está instalado no servidor — narração, legenda e vídeo como referência ficarão indisponíveis.";
  renderModelos();
  atualizar();
})();
