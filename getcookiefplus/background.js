// Service worker do Cookie Azul.
// Orquestra o CICLO de criação de página em todos os perfis salvos:
//   troca o cookie para o perfil -> abre a aba de criação -> content.js cria a
//   página -> avisa "concluída" -> passa para o próximo perfil, e assim por diante.
// O estado do ciclo fica em chrome.storage.local para sobreviver a reinícios do
// service worker; um alarme "watchdog" garante que um passo travado não pare tudo.

const URL_CRIACAO = "https://www.facebook.com/pages/creation/";
const PASSO_TIMEOUT_MIN = 1.2; // tempo máx. por perfil antes de seguir em frente

// Domínios do Facebook onde o cookie do perfil é aplicado (igual ao import do popup).
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
    const partes = (cookieStr || "").split(";");
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
                () => res()
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

// ---------------- Aba de criação ----------------
function abrirOuAtualizar(tabId, url) {
  return new Promise((resolve) => {
    if (tabId) {
      chrome.tabs.update(tabId, { url, active: true }, (t) => {
        if (chrome.runtime.lastError || !t) {
          chrome.tabs.create({ url }, (nt) => resolve(nt && nt.id));
        } else {
          resolve(tabId);
        }
      });
    } else {
      chrome.tabs.create({ url }, (nt) => resolve(nt && nt.id));
    }
  });
}

// ---------------- Ciclo ----------------
async function iniciarCiclo(profiles) {
  const anterior = (await getLocal("pendingAutoTries")).pendingAutoTries || {};
  const estado = { profiles: profiles || [], index: 0, tabId: null, awaiting: false };
  await setLocal({
    cicloEstado: estado,
    cicloAtivo: true,
    cicloParar: false,
    cicloStatus: "Iniciando ciclo…",
    pendingAutoTries: anterior,
  });
  processarPasso();
}

async function processarPasso() {
  const d = await getLocal(["cicloEstado", "cicloParar"]);
  const st = d.cicloEstado;
  if (!st) return;
  if (d.cicloParar || st.index >= st.profiles.length) return finalizar();

  const perfil = st.profiles[st.index];
  const rotulo = perfil.name || perfil.uid;
  const posicao = st.index + 1 + "/" + st.profiles.length;

  await setLocal({ cicloStatus: "Perfil " + posicao + ": " + rotulo + " — trocando conta…" });
  await aplicarCookieFacebook(perfil.cookie);
  await dormir(900);

  await setLocal({
    pendingCreate: true,
    cicloStatus: "Perfil " + posicao + ": " + rotulo + " — criando página…",
  });

  const alvo = URL_CRIACAO + "?ts=" + Date.now();
  st.tabId = await abrirOuAtualizar(st.tabId, alvo);
  st.awaiting = true;
  await setLocal({ cicloEstado: st });

  chrome.alarms.create("cicloWatchdog", { delayInMinutes: PASSO_TIMEOUT_MIN });
}

async function avancar() {
  chrome.alarms.clear("cicloWatchdog");
  const d = await getLocal(["cicloEstado", "pendingAutoTries", "cicloParar"]);
  const st = d.cicloEstado;
  if (!st || !st.awaiting) return; // evita avanço duplicado (mensagem + watchdog)

  // Marca +1 tentativa para o perfil que acabou de rodar.
  const perfil = st.profiles[st.index];
  const pend = d.pendingAutoTries || {};
  if (perfil) pend[perfil.uid] = (pend[perfil.uid] || 0) + 1;

  st.awaiting = false;
  st.index += 1;
  await setLocal({ cicloEstado: st, pendingAutoTries: pend });

  if (d.cicloParar) return finalizar();
  await dormir(1500);
  processarPasso();
}

async function finalizar() {
  chrome.alarms.clear("cicloWatchdog");
  await removeLocal(["cicloEstado", "pendingCreate"]);
  await setLocal({ cicloAtivo: false, cicloParar: false, cicloStatus: "Ciclo concluído." });
}

// ---------------- Mensagens e alarme ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "iniciarCicloTodos") {
    iniciarCiclo(msg.profiles || []);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "pararCiclo") {
    setLocal({ cicloParar: true }).then(() => finalizar());
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === "criacaoConcluida") {
    avancar();
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a && a.name === "cicloWatchdog") avancar();
});
