// Central Curioso — frontend. Rotas por hash:
//   #/                      lista de redes
//   #/rede/:id[/:projeto]   clientes da rede, filtrados por projeto (facebook|google|chatbot)
//   #/cliente/:id           ficha do cliente (editar, marcar projetos, copys)
let D = null;
const app = document.getElementById("app");
const trilha = document.getElementById("trilha");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

async function api(metodo, rota, body) {
  const r = await fetch("/api" + rota, { method: metodo, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || "Erro");
  return j;
}
async function carregar() { D = await api("GET", ""); }
function toast(msg) {
  let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800);
}
const projeto = id => D.projetos.find(p => p.id === id);
const rede = id => D.redes.find(r => r.id === id);
const clientesDaRede = id => D.clientes.filter(c => c.redeId === id);
const roda = (c, p) => !!c.projetos?.[p]?.ativo;
const tagsProjetos = c => `<div class="tags">${D.projetos.map(p =>
  `<span class="tag ${roda(c, p.id) ? "on" : ""}" ${roda(c, p.id) ? `style="background:${p.cor}"` : ""}>${esc(p.nome)}</span>`).join("")}</div>`;

// ---------- Telas ----------
function telaRedes() {
  trilha.innerHTML = `<a href="#/">Redes</a>`;
  app.innerHTML = `
    <h1>Redes</h1>
    <form class="linha" id="fRede"><input type="text" name="nome" placeholder="Nova rede" required><button>Adicionar rede</button></form>
    <div class="grade">${D.redes.map(r => {
      const cs = clientesDaRede(r.id);
      return `<a class="card" href="#/rede/${r.id}">
        <div class="titulo">${esc(r.nome)}</div>
        <div class="sub">${cs.length} cliente${cs.length === 1 ? "" : "s"}</div>
        <div class="tags">${D.projetos.map(p => { const n = cs.filter(c => roda(c, p.id)).length; return n ? `<span class="tag on" style="background:${p.cor}">${esc(p.nome)} ${n}</span>` : ""; }).join("")}</div>
      </a>`; }).join("")}
    </div>
    ${D.redes.length ? "" : `<p class="vazio">Nenhuma rede ainda.</p>`}
    <h2>Projetos</h2>
    <div class="grade">${D.projetos.map(p => {
      const n = D.clientes.filter(c => roda(c, p.id)).length;
      return `<div class="card"><div class="titulo" style="color:${p.cor}">${esc(p.nome)}</div><div class="sub">${n} cliente${n === 1 ? "" : "s"} rodando</div><div class="sub" style="margin-top:8px">${esc(p.comoAchar)}</div></div>`; }).join("")}
    </div>`;
  app.querySelector("#fRede").onsubmit = async e => {
    e.preventDefault(); const nome = e.target.nome.value.trim(); if (!nome) return;
    await api("POST", "/redes", { nome }); await carregar(); toast("Rede criada"); rotear();
  };
}

function telaRede(id, proj) {
  const r = rede(id); if (!r) return (app.innerHTML = `<p class="vazio">Rede não encontrada.</p>`);
  const p = proj ? projeto(proj) : null;
  trilha.innerHTML = `<a href="#/">Redes</a> › <a href="#/rede/${r.id}">${esc(r.nome)}</a>${p ? ` › ${esc(p.nome)}` : ""}`;
  let lista = clientesDaRede(r.id);
  if (p) lista = lista.filter(c => roda(c, p.id));
  app.innerHTML = `
    <h1>Rede ${esc(r.nome)}</h1>
    <div class="abas">
      <a class="aba ${!p ? "ativa" : ""}" href="#/rede/${r.id}">Todos (${clientesDaRede(r.id).length})</a>
      ${D.projetos.map(x => `<a class="aba ${p?.id === x.id ? "ativa" : ""}" href="#/rede/${r.id}/${x.id}" ${p?.id === x.id ? `style="background:${x.cor};border-color:${x.cor}"` : ""}>${esc(x.nome)} (${clientesDaRede(r.id).filter(c => roda(c, x.id)).length})</a>`).join("")}
    </div>
    ${p ? `<div class="dica"><b>Como achar ${esc(p.nome)}:</b> ${esc(p.comoAchar)}</div>` : ""}
    <form class="linha" id="fCliente"><input type="text" name="nome" placeholder="Novo cliente nesta rede" required><input type="url" name="site" placeholder="https://site.com (opcional)"><button>Adicionar cliente</button></form>
    <div class="grade">${lista.map(c => `<a class="card" href="#/cliente/${c.id}">
      <div class="titulo">${esc(c.nome)}</div>
      <div class="sub">${esc(c.site) || "sem site"}</div>
      ${tagsProjetos(c)}
    </a>`).join("")}</div>
    ${lista.length ? "" : `<p class="vazio">${p ? `Nenhum cliente rodando ${esc(p.nome)} nesta rede.` : "Nenhum cliente nesta rede."}</p>`}
    <div class="acoes"><button class="perigo" id="bApagarRede">Apagar rede</button></div>`;
  app.querySelector("#fCliente").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const novo = { nome: f.nome.value.trim(), site: f.site.value.trim(), redeId: r.id };
    if (p) novo.projetos = { [p.id]: { ativo: true } };
    await api("POST", "/clientes", novo); await carregar(); toast("Cliente criado"); rotear();
  };
  app.querySelector("#bApagarRede").onclick = async () => {
    if (!confirm(`Apagar a rede "${r.nome}" e todos os clientes dela?`)) return;
    await api("DELETE", "/redes/" + r.id); await carregar(); location.hash = "#/";
  };
}

function telaCliente(id) {
  const c = D.clientes.find(x => x.id === id); if (!c) return (app.innerHTML = `<p class="vazio">Cliente não encontrado.</p>`);
  const r = rede(c.redeId);
  trilha.innerHTML = `<a href="#/">Redes</a> › <a href="#/rede/${c.redeId}">${esc(r?.nome || c.redeId)}</a> › ${esc(c.nome)}`;
  app.innerHTML = `
    <h1>${esc(c.nome)}</h1>
    <div class="ficha">
      <div class="bloco">
        <header><strong>Dados</strong></header>
        <div class="campo"><label>Nome</label><input type="text" id="cNome" value="${esc(c.nome)}"></div>
        <div class="campo"><label>Site</label><input type="url" id="cSite" value="${esc(c.site)}"></div>
        <div class="campo"><label>Rede</label><select id="cRede">${D.redes.map(x => `<option value="${x.id}" ${x.id === c.redeId ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
        <div class="campo"><label>Notas gerais</label><textarea id="cNotas">${esc(c.notas)}</textarea></div>
      </div>
      ${D.projetos.map(p => { const pc = c.projetos[p.id] || {}; return `
      <div class="bloco" data-proj="${p.id}">
        <header><strong style="color:${p.cor}">${esc(p.nome)}</strong>
          <label class="chk"><input type="checkbox" class="pAtivo" ${pc.ativo ? "checked" : ""}> Rodando ${esc(p.nome)}</label></header>
        <div class="dica">${esc(p.comoAchar)}</div>
        ${p.id !== "chatbot" ? `<div class="campo"><label>Link (biblioteca de anúncios / anúncio encontrado)</label><input type="url" class="pLink" value="${esc(pc.link)}"></div>` : ""}
        <div class="campo"><label>Observações</label><textarea class="pObs">${esc(pc.obs)}</textarea></div>
        ${p.id === "chatbot" ? `
          <label style="font-size:13px;color:var(--fraco)">Copys por página</label>
          <ul class="copys" style="list-style:none;padding:0;margin:6px 0">${(pc.copys || []).map((k, i) => `<li><span><b>${esc(k.pagina)}</b><br>${esc(k.texto)}</span><button class="sec rmCopy" data-i="${i}">✕</button></li>`).join("")}</ul>
          <form class="linha fCopy"><input type="text" name="pagina" placeholder="Página (ex: /oferta)" required><input type="text" name="texto" placeholder="Copy usada" required style="flex:1"><button class="sec">Adicionar copy</button></form>` : ""}
      </div>`; }).join("")}
    </div>
    <div class="acoes"><button class="perigo" id="bApagar">Apagar cliente</button><button id="bSalvar">Salvar</button></div>`;

  const coletar = () => {
    const projetos = {};
    app.querySelectorAll(".bloco[data-proj]").forEach(b => {
      const pid = b.dataset.proj;
      projetos[pid] = { ...(c.projetos[pid] || {}), ativo: b.querySelector(".pAtivo").checked, obs: b.querySelector(".pObs").value, link: b.querySelector(".pLink")?.value || "" };
    });
    return { nome: app.querySelector("#cNome").value.trim(), site: app.querySelector("#cSite").value.trim(), redeId: app.querySelector("#cRede").value, notas: app.querySelector("#cNotas").value, projetos };
  };
  const salvar = async (extra = {}) => {
    const dados = coletar();
    if (extra.copys) dados.projetos.chatbot.copys = extra.copys;
    await api("PUT", "/clientes/" + c.id, dados); await carregar(); toast("Salvo"); rotear();
  };
  app.querySelector("#bSalvar").onclick = () => salvar();
  app.querySelector("#bApagar").onclick = async () => {
    if (!confirm(`Apagar o cliente "${c.nome}"?`)) return;
    await api("DELETE", "/clientes/" + c.id); await carregar(); location.hash = "#/rede/" + c.redeId;
  };
  app.querySelector(".fCopy")?.addEventListener("submit", e => {
    e.preventDefault();
    const copys = [...(c.projetos.chatbot?.copys || []), { pagina: e.target.pagina.value.trim(), texto: e.target.texto.value.trim() }];
    salvar({ copys });
  });
  app.querySelectorAll(".rmCopy").forEach(b => b.onclick = () => {
    const copys = (c.projetos.chatbot?.copys || []).filter((_, i) => i !== +b.dataset.i); salvar({ copys });
  });
}

function telaBusca(q) {
  trilha.innerHTML = `<a href="#/">Redes</a> › Busca`;
  const t = q.toLowerCase();
  const rs = D.redes.filter(r => r.nome.toLowerCase().includes(t));
  const cs = D.clientes.filter(c => c.nome.toLowerCase().includes(t) || (c.site || "").toLowerCase().includes(t));
  app.innerHTML = `<h1>Busca: "${esc(q)}"</h1>
    <h2>Redes (${rs.length})</h2><div class="grade">${rs.map(r => `<a class="card" href="#/rede/${r.id}"><div class="titulo">${esc(r.nome)}</div></a>`).join("")}</div>
    <h2>Clientes (${cs.length})</h2><div class="grade">${cs.map(c => `<a class="card" href="#/cliente/${c.id}"><div class="titulo">${esc(c.nome)}</div><div class="sub">Rede ${esc(rede(c.redeId)?.nome || "")}</div>${tagsProjetos(c)}</a>`).join("")}</div>`;
}

// ---------- Roteador ----------
function rotear() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (partes[0] === "rede" && partes[1]) return telaRede(partes[1], partes[2]);
  if (partes[0] === "cliente" && partes[1]) return telaCliente(partes[1]);
  if (partes[0] === "busca" && partes[1]) return telaBusca(decodeURIComponent(partes[1]));
  telaRedes();
}
document.getElementById("busca").addEventListener("input", e => {
  const q = e.target.value.trim(); location.hash = q ? "#/busca/" + encodeURIComponent(q) : "#/";
});
window.addEventListener("hashchange", rotear);
carregar().then(rotear);
