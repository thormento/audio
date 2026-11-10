// Central Curioso — frontend (página única, rotas por hash)
//   #/                       painel geral
//   #/rede/:id[/:projeto]    clientes da rede, com filtro por projeto
//   #/projeto/:id            todos os clientes rodando aquele projeto
//   #/cliente/:id            ficha do cliente (status por canal, ofertas, copys)
let D = null;
const app = document.getElementById("app");
const trilha = document.getElementById("trilha");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const STATUS = { rodando: "Rodando", parado: "Parou", nao_verificado: "Não verificado" };
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = d => d ? d.split("-").reverse().join("/") : "—";

async function api(metodo, rota, body) {
  const r = await fetch("/api" + rota, { method: metodo, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.erro || "Erro"); return j;
}
async function carregar() { D = await api("GET", ""); }
function toast(msg) {
  let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800);
}
const projeto = id => D.projetos.find(p => p.id === id);
const rede = id => D.redes.find(r => r.id === id);
const clientesDaRede = id => D.clientes.filter(c => c.redeId === id);
const st = (c, p) => c.projetos?.[p]?.status || "nao_verificado";
const roda = (c, p) => st(c, p) === "rodando";
const hostDe = s => { try { return new URL(s).host.replace(/^www\./, ""); } catch { return s || "sem site"; } };
const icone = p => `<span class="icone-canal" style="background:${p.cor}">${esc(p.icone)}</span>`;
const chip = (c, p) => { const s = st(c, p.id); return `<span class="chip ${s}" title="${STATUS[s]}"><span class="ponto" style="background:currentColor"></span>${esc(p.nome)}</span>`; };
const chipsCanais = c => `<div class="linha-canais">${D.projetos.map(p => chip(c, p)).join("")}</div>`;

// ---------- Menu lateral ----------
function menu(rota) {
  document.querySelector('[data-rota="home"]').classList.toggle("ativo", rota.tipo === "home");
  document.getElementById("menuRedes").innerHTML = D.redes.map(r =>
    `<a class="item-lateral ${rota.tipo === "rede" && rota.id === r.id ? "ativo" : ""}" href="#/rede/${r.id}"><span>${esc(r.nome)}</span><span class="n">${clientesDaRede(r.id).length}</span></a>`).join("");
  document.getElementById("menuProjetos").innerHTML = D.projetos.map(p =>
    `<a class="item-lateral ${rota.tipo === "projeto" && rota.id === p.id ? "ativo" : ""}" href="#/projeto/${p.id}"><span><span class="ponto" style="background:${p.cor}"></span>${esc(p.nome)}</span><span class="n">${D.clientes.filter(c => roda(c, p.id)).length}</span></a>`).join("");
}
document.getElementById("bNovaRede").onclick = async () => {
  const nome = prompt("Nome da nova rede:"); if (!nome?.trim()) return;
  const r = await api("POST", "/redes", { nome }); await carregar(); toast("Rede criada"); location.hash = "#/rede/" + r.id;
};

// ---------- Tabela de clientes ----------
function tabelaClientes(lista, mostrarRede = false) {
  if (!lista.length) return `<div class="vazio">Nenhum cliente aqui ainda.</div>`;
  return `<table class="tabela"><thead><tr>
    <th>Cliente</th>${mostrarRede ? "<th>Rede</th>" : ""}
    ${D.projetos.map(p => `<th class="canal">${esc(p.nome)}</th>`).join("")}
    <th>Ofertas</th><th>Última verificação</th><th></th></tr></thead><tbody>
    ${lista.map(c => {
      const ofertas = D.projetos.reduce((n, p) => n + (c.projetos[p.id]?.ofertas?.length || 0), 0);
      const ult = D.projetos.map(p => c.projetos[p.id]?.ultimaVerificacao || "").filter(Boolean).sort().pop();
      return `<tr>
        <td><div class="nome">${esc(c.nome)}</div><div class="site">${esc(hostDe(c.site))}</div></td>
        ${mostrarRede ? `<td><a href="#/rede/${c.redeId}">${esc(rede(c.redeId)?.nome || "")}</a></td>` : ""}
        ${D.projetos.map(p => { const s = st(c, p.id); return `<td class="canal"><span class="chip ${s}"><span class="ponto" style="background:currentColor"></span>${STATUS[s]}</span></td>`; }).join("")}
        <td>${ofertas}</td><td>${fmtData(ult)}</td>
        <td><a class="abrir" href="#/cliente/${c.id}">Abrir →</a></td></tr>`; }).join("")}
  </tbody></table>`;
}

// ---------- Telas ----------
function telaPainel() {
  trilha.innerHTML = `<b>Painel</b>`;
  const total = D.clientes.length;
  const investindo = D.clientes.filter(c => D.projetos.some(p => roda(c, p.id))).length;
  const ofertas = D.clientes.flatMap(c => D.projetos.flatMap(p => (c.projetos[p.id]?.ofertas || []).map(o => ({ ...o, cliente: c, projeto: p })))).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const pendentes = D.clientes.filter(c => D.projetos.every(p => st(c, p.id) === "nao_verificado")).length;
  app.innerHTML = `
    <div class="cabecalho"><div><h1>Painel</h1><div class="sub">Onde cada concorrente está investindo e quais ofertas está rodando.</div></div></div>
    <div class="kpis">
      <div class="kpi"><div class="rotulo">Redes</div><div class="valor">${D.redes.length}</div><div class="detalhe">${total} clientes no total</div></div>
      <div class="kpi"><div class="rotulo">Investindo em algum canal</div><div class="valor">${investindo}</div><div class="detalhe">${pendentes} ainda sem verificação</div></div>
      ${D.projetos.map(p => `<div class="kpi"><div class="rotulo" style="display:flex;align-items:center;gap:8px"><span class="ponto" style="background:${p.cor}"></span>${esc(p.nome)}</div><div class="valor">${D.clientes.filter(c => roda(c, p.id)).length}</div><div class="detalhe">clientes rodando</div></div>`).join("")}
    </div>
    <h2>Redes</h2>
    <div class="grade">${D.redes.map(r => { const cs = clientesDaRede(r.id); return `<a class="card" href="#/rede/${r.id}">
      <div class="titulo">${esc(r.nome)}</div><div class="sub">${cs.length} cliente${cs.length === 1 ? "" : "s"}</div>
      <div class="linha-canais">${D.projetos.map(p => { const n = cs.filter(c => roda(c, p.id)).length; return `<span class="chip ${n ? "rodando" : "nao_verificado"}"><span class="ponto" style="background:${p.cor}"></span>${esc(p.nome)} ${n}</span>`; }).join("")}</div></a>`; }).join("")}</div>
    <h2>Ofertas encontradas recentemente</h2>
    <div class="lista-ofertas-recentes">${ofertas.length ? `<ul class="ofertas">${ofertas.slice(0, 6).map(o => `<li class="oferta"><div>
      <div class="quem"><a href="#/cliente/${o.cliente.id}"><b>${esc(o.cliente.nome)}</b></a> · ${esc(rede(o.cliente.redeId)?.nome || "")} · <span style="color:${o.projeto.cor}">${esc(o.projeto.nome)}</span></div>
      <div class="t">${esc(o.titulo)}</div><div class="d">${esc(o.descricao)}</div></div><div class="m">${fmtData(o.data)}</div></li>`).join("")}</ul>` : `<div class="vazio">Nenhuma oferta cadastrada ainda.</div>`}</div>`;
}

function telaRede(id, proj) {
  const r = rede(id); if (!r) return (app.innerHTML = `<div class="vazio">Rede não encontrada.</div>`);
  const p = proj ? projeto(proj) : null;
  trilha.innerHTML = `<a href="#/">Painel</a> › <a href="#/rede/${r.id}">${esc(r.nome)}</a>${p ? ` › <b>${esc(p.nome)}</b>` : ""}`;
  const todos = clientesDaRede(r.id);
  const lista = p ? todos.filter(c => roda(c, p.id)) : todos;
  app.innerHTML = `
    <div class="cabecalho"><div><h1>Rede ${esc(r.nome)}</h1><div class="sub">${todos.length} clientes · ${todos.filter(c => D.projetos.some(x => roda(c, x.id))).length} investindo em algum canal</div></div>
      <div style="display:flex;gap:8px"><button class="btn sec" id="bRenomear">Renomear</button><button class="btn perigo" id="bApagarRede">Apagar rede</button></div></div>
    <div class="abas">
      <a class="aba ${!p ? "ativa" : ""}" href="#/rede/${r.id}">Todos <span class="n">${todos.length}</span></a>
      ${D.projetos.map(x => `<a class="aba ${p?.id === x.id ? "ativa" : ""}" href="#/rede/${r.id}/${x.id}"><span class="ponto" style="background:${x.cor};margin:0"></span>${esc(x.nome)} <span class="n">${todos.filter(c => roda(c, x.id)).length}</span></a>`).join("")}
    </div>
    ${p ? `<div class="dica"><b>Como verificar ${esc(p.nome)}:</b> ${esc(p.comoAchar)}</div>` : ""}
    <form class="linha" id="fCliente" style="margin-bottom:16px"><input type="text" name="nome" placeholder="Nome do cliente" required><input type="url" name="site" placeholder="https://site-do-cliente.com"><button class="btn">+ Adicionar cliente</button></form>
    ${tabelaClientes(lista)}`;
  app.querySelector("#fCliente").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const novo = { nome: f.nome.value.trim(), site: f.site.value.trim(), redeId: r.id };
    if (p) novo.projetos = { [p.id]: { status: "rodando", ultimaVerificacao: hoje() } };
    const c = await api("POST", "/clientes", novo); await carregar(); toast("Cliente criado"); location.hash = "#/cliente/" + c.id;
  };
  app.querySelector("#bRenomear").onclick = async () => {
    const nome = prompt("Novo nome da rede:", r.nome); if (!nome?.trim()) return;
    await api("PUT", "/redes/" + r.id, { nome }); await carregar(); toast("Rede renomeada"); rotear();
  };
  app.querySelector("#bApagarRede").onclick = async () => {
    if (!confirm(`Apagar a rede "${r.nome}" e todos os clientes dela?`)) return;
    await api("DELETE", "/redes/" + r.id); await carregar(); location.hash = "#/";
  };
}

function telaProjeto(id) {
  const p = projeto(id); if (!p) return (app.innerHTML = `<div class="vazio">Projeto não encontrado.</div>`);
  trilha.innerHTML = `<a href="#/">Painel</a> › <b>${esc(p.nome)}</b>`;
  const lista = D.clientes.filter(c => roda(c, p.id));
  app.innerHTML = `
    <div class="cabecalho"><div><h1 style="display:flex;align-items:center;gap:10px">${icone(p)} ${esc(p.nome)}</h1><div class="sub">${lista.length} clientes rodando ${esc(p.nome)} em todas as redes</div></div></div>
    <div class="dica"><b>Como verificar:</b> ${esc(p.comoAchar)}</div>
    ${tabelaClientes(lista, true)}`;
}

function telaCliente(id) {
  const c = D.clientes.find(x => x.id === id); if (!c) return (app.innerHTML = `<div class="vazio">Cliente não encontrado.</div>`);
  const r = rede(c.redeId);
  trilha.innerHTML = `<a href="#/">Painel</a> › <a href="#/rede/${c.redeId}">${esc(r?.nome || "")}</a> › <b>${esc(c.nome)}</b>`;
  app.innerHTML = `
    <div class="cabecalho"><div><h1>${esc(c.nome)}</h1><div class="sub">${c.site ? `<a href="${esc(c.site)}" target="_blank" rel="noopener" style="color:var(--acento)">${esc(hostDe(c.site))} ↗</a> · ` : ""}Rede ${esc(r?.nome || "")}</div></div>${chipsCanais(c)}</div>
    <div class="painel"><header><strong>Dados do cliente</strong></header><div class="corpo">
      <div class="colunas">
        <div class="campo"><label>Nome</label><input type="text" id="cNome" value="${esc(c.nome)}"></div>
        <div class="campo"><label>Site</label><input type="url" id="cSite" value="${esc(c.site)}"></div>
        <div class="campo"><label>Rede</label><select id="cRede">${D.redes.map(x => `<option value="${x.id}" ${x.id === c.redeId ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
      </div>
      <div class="campo"><label>Notas gerais</label><textarea id="cNotas">${esc(c.notas)}</textarea></div>
    </div></div>
    ${D.projetos.map(p => { const pc = c.projetos[p.id] || {}; const s = pc.status || "nao_verificado"; return `
    <div class="painel" data-proj="${p.id}">
      <header><strong>${icone(p)} ${esc(p.nome)}</strong>
        <div class="seletor-status">${Object.entries(STATUS).map(([k, v]) => `<label><input type="radio" name="st-${p.id}" value="${k}" ${s === k ? "checked" : ""}><span class="${k}">${v}</span></label>`).join("")}</div>
      </header>
      <div class="corpo">
        <div class="dica">${esc(p.comoAchar)}</div>
        <div class="colunas">
          <div class="campo"><label>Última verificação</label><input type="date" class="pData" value="${esc(pc.ultimaVerificacao || "")}"></div>
          ${p.id !== "chatbot" ? `<div class="campo"><label>Link da biblioteca / anúncio encontrado</label><input type="url" class="pLink" value="${esc(pc.link || "")}"></div>` : `<div></div>`}
        </div>
        <div class="campo"><label>Observações</label><textarea class="pObs">${esc(pc.obs || "")}</textarea></div>
        <label style="font-size:12px;font-weight:500;color:var(--fraco)">Ofertas encontradas (${(pc.ofertas || []).length})</label>
        <ul class="ofertas" style="margin-top:6px">${(pc.ofertas || []).map((o, i) => `<li class="oferta"><div><div class="t">${esc(o.titulo)}</div><div class="d">${esc(o.descricao)}</div><div class="m">${fmtData(o.data)}${o.link ? ` · <a href="${esc(o.link)}" target="_blank" rel="noopener">ver anúncio ↗</a>` : ""}</div></div><button class="btn sec pequeno rmOferta" data-i="${i}">Remover</button></li>`).join("")}</ul>
        <form class="form-oferta fOferta"><input type="text" name="titulo" placeholder="Título da oferta" required><input type="text" name="descricao" placeholder="Descrição / copy / preço / CTA"><input type="url" name="link" placeholder="Link"><button class="btn sec">+ Oferta</button></form>
        ${p.id === "chatbot" ? `
        <label style="font-size:12px;font-weight:500;color:var(--fraco);display:block;margin-top:16px">Copys por página (${(pc.copys || []).length})</label>
        <ul class="ofertas" style="margin-top:6px">${(pc.copys || []).map((k, i) => `<li class="oferta"><div><div class="t">${esc(k.pagina)}</div><div class="d">${esc(k.texto)}</div></div><button class="btn sec pequeno rmCopy" data-i="${i}">Remover</button></li>`).join("")}</ul>
        <form class="form-oferta fCopy" style="grid-template-columns:1fr 3fr auto"><input type="text" name="pagina" placeholder="Página (ex: /oferta)" required><input type="text" name="texto" placeholder="Copy usada pelo chatbot" required><button class="btn sec">+ Copy</button></form>` : ""}
      </div>
    </div>`; }).join("")}
    <div class="barra-salvar"><button class="btn perigo" id="bApagar">Apagar cliente</button><button class="btn" id="bSalvar">Salvar alterações</button></div>`;

  const coletar = () => {
    const projetos = {};
    app.querySelectorAll(".painel[data-proj]").forEach(b => {
      const pid = b.dataset.proj;
      projetos[pid] = { ...(c.projetos[pid] || {}), status: b.querySelector(`input[name="st-${pid}"]:checked`).value, ultimaVerificacao: b.querySelector(".pData").value, obs: b.querySelector(".pObs").value, link: b.querySelector(".pLink")?.value || "" };
    });
    return { nome: app.querySelector("#cNome").value.trim(), site: app.querySelector("#cSite").value.trim(), redeId: app.querySelector("#cRede").value, notas: app.querySelector("#cNotas").value, projetos };
  };
  const salvar = async (mod) => {
    const dados = coletar(); if (mod) mod(dados.projetos);
    await api("PUT", "/clientes/" + c.id, dados); await carregar(); toast("Salvo"); rotear();
  };
  app.querySelector("#bSalvar").onclick = () => salvar();
  app.querySelector("#bApagar").onclick = async () => {
    if (!confirm(`Apagar o cliente "${c.nome}"?`)) return;
    await api("DELETE", "/clientes/" + c.id); await carregar(); location.hash = "#/rede/" + c.redeId;
  };
  app.querySelectorAll(".painel[data-proj]").forEach(b => {
    const pid = b.dataset.proj;
    b.querySelector(".fOferta").onsubmit = e => { e.preventDefault(); const f = e.target;
      salvar(pr => { pr[pid].ofertas = [...(pr[pid].ofertas || []), { titulo: f.titulo.value.trim(), descricao: f.descricao.value.trim(), link: f.link.value.trim(), data: hoje() }]; if (pr[pid].status === "nao_verificado") pr[pid].status = "rodando"; if (!pr[pid].ultimaVerificacao) pr[pid].ultimaVerificacao = hoje(); }); };
    b.querySelectorAll(".rmOferta").forEach(x => x.onclick = () => salvar(pr => { pr[pid].ofertas = (pr[pid].ofertas || []).filter((_, i) => i !== +x.dataset.i); }));
    b.querySelector(".fCopy")?.addEventListener("submit", e => { e.preventDefault(); const f = e.target;
      salvar(pr => { pr[pid].copys = [...(pr[pid].copys || []), { pagina: f.pagina.value.trim(), texto: f.texto.value.trim() }]; }); });
    b.querySelectorAll(".rmCopy").forEach(x => x.onclick = () => salvar(pr => { pr[pid].copys = (pr[pid].copys || []).filter((_, i) => i !== +x.dataset.i); }));
  });
}

function telaBusca(q) {
  trilha.innerHTML = `<a href="#/">Painel</a> › <b>Busca</b>`;
  const t = q.toLowerCase();
  const rs = D.redes.filter(r => r.nome.toLowerCase().includes(t));
  const cs = D.clientes.filter(c => c.nome.toLowerCase().includes(t) || (c.site || "").toLowerCase().includes(t));
  app.innerHTML = `<div class="cabecalho"><div><h1>Busca</h1><div class="sub">Resultados para "${esc(q)}"</div></div></div>
    ${rs.length ? `<h2>Redes</h2><div class="grade">${rs.map(r => `<a class="card" href="#/rede/${r.id}"><div class="titulo">${esc(r.nome)}</div><div class="sub">${clientesDaRede(r.id).length} clientes</div></a>`).join("")}</div>` : ""}
    <h2>Clientes</h2>${tabelaClientes(cs, true)}`;
}

// ---------- Roteador ----------
function rotear() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let rota = { tipo: "home" };
  if (partes[0] === "rede" && partes[1]) rota = { tipo: "rede", id: partes[1] };
  if (partes[0] === "projeto" && partes[1]) rota = { tipo: "projeto", id: partes[1] };
  if (partes[0] === "cliente" && partes[1]) rota = { tipo: "cliente", id: partes[1] };
  if (partes[0] === "busca" && partes[1]) rota = { tipo: "busca" };
  menu(rota);
  if (rota.tipo === "rede") return telaRede(rota.id, partes[2]);
  if (rota.tipo === "projeto") return telaProjeto(rota.id);
  if (rota.tipo === "cliente") return telaCliente(rota.id);
  if (rota.tipo === "busca") return telaBusca(decodeURIComponent(partes[1]));
  telaPainel();
}
document.getElementById("busca").addEventListener("input", e => { const q = e.target.value.trim(); location.hash = q ? "#/busca/" + encodeURIComponent(q) : "#/"; });
window.addEventListener("hashchange", rotear);
carregar().then(rotear);
