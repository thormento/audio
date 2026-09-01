// Service worker do Cookie Azul.
// - "criarUma": cria UMA página no perfil atualmente logado (isolado).
// - Ciclo "iniciarCicloTodos": para cada perfil salvo, troca o cookie da conta,
//   abre UMA NOVA ABA de criação e cria a página; ao terminar passa direto ao
//   próximo. Ao final espera 5s e fecha TODAS as abas abertas pelo ciclo.
// - Resultado por perfil: sempre conta +1 tentativa; se a página foi REALMENTE
//   criada, conta +1 página (PÁG). O sucesso é detectado de duas formas:
//   (a) o content.js observa se saiu do formulário / apareceu erro após o clique;
//   (b) o background vigia a URL da aba — se, depois do clique em "Criar", a aba
//       sair de /pages/creation, a página foi criada (cobre o caso em que a
//       navegação mata o content script antes de ele avisar).
// O estado fica em chrome.storage.local para sobreviver a reinícios do worker;
// um alarme "watchdog" avança caso um perfil trave. Cada passo tem um stepId
// para que uma conclusão atrasada não seja creditada ao passo errado.

const URL_CRIACAO = "https://www.facebook.com/pages/creation/";
const PASSO_TIMEOUT_MIN = 1.5; // tempo máx. por perfil antes de seguir em frente
const ESPERA_FINAL_MS = 5000; // espera antes de fechar as abas no fim do ciclo
const FOLGA_NAVEGACAO_MS = 4000; // folga após a aba sair do formulário

const DOMINIOS_FB = [
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://m.facebook.com",
  "https://mbasic.facebook.com",
  "https://business.facebook.com",
  "https://developers.facebook.com",
  "https://upload.facebook.com",
  "https://mobile.facebook.com",
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const getLocal = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
const setLocal = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));
const removeLocal = (keys) => new Promise((res) => chrome.storage.local.remove(keys, res));
const criarAba = (url) =>
  new Promise((res) => chrome.tabs.create({ url, active: true }, (t) => res(t && t.id)));
const cookieAtualUid = () =>
  new Promise((res) =>
    chrome.cookies.get({ url: "https://www.facebook.com", name: "c_user" }, (c) =>
      res(c && c.value ? c.value : null)
    )
  );

// URL que indica que a aba saiu do formulário para a página criada
// (login/checkpoint NÃO contam como sucesso).
function urlIndicaPaginaCriada(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  if (u.indexOf("/pages/creation") > -1) return false;
  if (u.indexOf("/login") > -1 || u.indexOf("checkpoint") > -1 || u.indexOf("/recover") > -1)
    return false;
  return u.indexOf("facebook.com") > -1;
}

// Se o cookie salvo veio no formato "a|b|c", usa o pedaço que contém c_user.
function normalizarCookie(cookie) {
  if (cookie && cookie.indexOf("|") > -1) {
    const arr = cookie.split("|");
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].indexOf("c_user") > -1) return arr[i];
    }
  }
  return cookie || "";
}

// ---------------- Troca de conta (cookies do Facebook) ----------------
function removerCookiesFacebook() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: "facebook.com" }, (cookies) => {
      let pend = (cookies || []).length;
      if (!pend) return resolve();
      (cookies || []).forEach((c) => {
        const url =
          "http" + (c.secure ? "s" : "") + "://" + c.domain.replace(/^\./, "") + c.path;
        chrome.cookies.remove({ url, name: c.name }, () => {
          if (--pend <= 0) resolve();
        });
      });
    });
  });
}

function aplicarCookieFacebook(cookieStr) {
  return removerCookiesFacebook().then(() => {
    const exp = Date.now() / 1000 + 31556926;
    const partes = normalizarCookie(cookieStr).split(";");
    const ops = [];
    partes.forEach((par) => {
      const idx = par.indexOf("=");
      if (idx < 0) return;
      const name = par.slice(0, idx).trim();
      const val = par.slice(idx + 1).trim();
      if (!name) return;
      DOMINIOS_FB.forEach((u) => {
        ops.push(
          new Promise((res) => {
            try {
              chrome.cookies.set(
                { url: u, name, value: val, expirationDate: exp },
                () => { void chrome.runtime.lastError; res(); }
              );
            } catch (e) {
              res();
            }
          })
        );
      });
    });
    return Promise.all(ops);
  });
}

// ---------------- Contadores pendentes (aplicados pelo popup) ----------------
async function registrarResultado(uid, criada) {
  if (!uid) return;
  const d = await getLocal(["pendingAutoTries", "pendingAutoPages"]);
  const tries = d.pendingAutoTries || {};
  const pages = d.pendingAutoPages || {};
  tries[uid] = (tries[uid] || 0) + 1;
  if (criada) pages[uid] = (pages[uid] || 0) + 1;
  await setLocal({ pendingAutoTries: tries, pendingAutoPages: pages });
}

// ---------------- Criar apenas 1 página (perfil atual) ----------------
async function criarUma() {
  await setLocal({ pendingCreate: true, pendingStep: 0 });
  await criarAba(URL_CRIACAO + "?ts=" + Date.now());
}

// ---------------- Ciclo em todos os perfis ----------------
async function iniciarCiclo(profiles) {
  const st0 = await getLocal(["cicloAtivo"]);
  if (st0 && st0.cicloAtivo) return; // já há um ciclo em andamento

  const estado = {
    profiles: profiles || [],
    index: 0,
    tabIds: [],
    awaiting: false,
    stepId: 0,
    clicou: false,
    criada: false,
    resultados: [],
  };
  await setLocal({
    cicloEstado: estado,
    cicloAtivo: true,
    cicloParar: false,
    cicloStatus: "Iniciando ciclo…",
  });
  processarPasso();
}

async function processarPasso() {
  const d = await getLocal(["cicloEstado", "cicloParar"]);
  const st = d.cicloEstado;
  if (!st) return;
  if (d.cicloParar) return finalizar("parado");
  if (st.index >= st.profiles.length) return finalizar("ok");

  const perfil = st.profiles[st.index];
  const rotulo = perfil.name || perfil.uid;
  const posicao = st.index + 1 + "/" + st.profiles.length;

  await setLocal({ cicloStatus: "Perfil " + posicao + ": " + rotulo + " — trocando conta…" });
  await aplicarCookieFacebook(perfil.cookie);
  await dormir(900);

  st.stepId = (st.stepId || 0) + 1;
  st.clicou = false;
  st.criada = false;
  await setLocal({
    pendingCreate: true,
    pendingStep: st.stepId,
    cicloStatus: "Perfil " + posicao + ": " + rotulo + " — criando página…",
  });

  // Abre UMA NOVA aba para este perfil e guarda o id (será fechada no fim).
  const novoId = await criarAba(URL_CRIACAO + "?ts=" + Date.now());
  if (!st.tabIds) st.tabIds = [];
  if (novoId) st.tabIds.push(novoId);
  st.tabAtual = novoId;
  st.awaiting = true;
  await setLocal({ cicloEstado: st });

  chrome.alarms.create("cicloWatchdog", { delayInMinutes: PASSO_TIMEOUT_MIN });
}

async function marcarClique(stepId) {
  const d = await getLocal(["cicloEstado"]);
  const st = d.cicloEstado;
  if (!st || !st.awaiting || stepId !== st.stepId) return;
  st.clicou = true;
  await setLocal({ cicloEstado: st });
}

async function avancar(stepId, criadaMsg) {
  const d = await getLocal(["cicloEstado", "cicloParar"]);
  const st = d.cicloEstado;
  if (!st || !st.awaiting) return; // evita avanço duplicado (mensagem + watchdog)
  // Ignora conclusão atrasada de um passo anterior (não credita ao passo errado).
  if (stepId != null && stepId !== st.stepId) return;

  chrome.alarms.clear("cicloWatchdog");

  const perfil = st.profiles[st.index];
  const criada = !!(st.criada || criadaMsg);
  if (perfil) {
    await registrarResultado(perfil.uid, criada);
    st.resultados = st.resultados || [];
    st.resultados.push({ uid: perfil.uid, name: perfil.name, criada });
  }

  st.awaiting = false;
  st.index += 1;
  const rotulo = perfil ? perfil.name || perfil.uid : "";
  await setLocal({
    cicloEstado: st,
    cicloStatus:
      "Perfil " + st.index + "/" + st.profiles.length + ": " + rotulo +
      (criada ? " — ✓ página criada" : " — ✗ não criou"),
  });

  if (d.cicloParar) return finalizar("parado");
  processarPasso();
}

async function finalizar(motivo) {
  chrome.alarms.clear("cicloWatchdog");
  const d = await getLocal(["cicloEstado"]);
  const st = d.cicloEstado || {};
  const ids = st.tabIds || [];
  const resultados = st.resultados || [];
  const criadas = resultados.filter((r) => r.criada).length;

  const resumo =
    motivo === "parado"
      ? "Criação interrompida."
      : "Ciclo concluído: " + criadas + " de " + resultados.length + " página(s) criada(s).";

  await removeLocal(["cicloEstado", "pendingCreate", "pendingStep"]);

  // No fim normal, espera 5s antes de fechar as abas.
  if (motivo !== "parado" && ids.length) {
    await setLocal({ cicloStatus: resumo + " Fechando abas em 5s…" });
    await dormir(ESPERA_FINAL_MS);
  }

  await setLocal({ cicloAtivo: false, cicloParar: false, cicloStatus: resumo });

  ids.forEach((id) => {
    try {
      chrome.tabs.remove(id, () => void chrome.runtime.lastError);
    } catch (e) {}
  });
}

// ---------------- Vigia a URL da aba do passo atual ----------------
// Se, DEPOIS do clique em "Criar", a aba sair de /pages/creation para uma página
// do Facebook, a página foi criada — mesmo que o content script tenha morrido.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo || !changeInfo.url) return;
  const d = await getLocal(["cicloEstado"]);
  const st = d.cicloEstado;
  if (!st || !st.awaiting || tabId !== st.tabAtual) return;
  if (!st.clicou || !urlIndicaPaginaCriada(changeInfo.url)) return;
  st.criada = true;
  await setLocal({ cicloEstado: st });
  const step = st.stepId;
  setTimeout(() => avancar(step, true), FOLGA_NAVEGACAO_MS);
});

// ---------------- Mensagens e alarme ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "criarUma") {
    criarUma();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "iniciarCicloTodos") {
    iniciarCiclo(msg.profiles || []);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "pararCiclo") {
    setLocal({ cicloParar: true }).then(() => finalizar("parado"));
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "clicouCriar") {
    marcarClique(msg.stepId);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "criacaoConcluida") {
    getLocal(["cicloEstado"]).then(async (d) => {
      if (d.cicloEstado) {
        avancar(msg.stepId, !!msg.criada);
      } else if (msg.criada) {
        // "Criar apenas 1 página": credita a página ao perfil logado agora.
        const uid = await cookieAtualUid();
        const p = (await getLocal(["pendingAutoPages"])).pendingAutoPages || {};
        if (uid) {
          p[uid] = (p[uid] || 0) + 1;
          await setLocal({ pendingAutoPages: p });
        }
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a && a.name === "cicloWatchdog") avancar();
});
