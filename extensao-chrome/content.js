// Content script: roda em facebook.com/pages/creation.
// Se houver um pedido pendente (feito pelo popup), executa a automação uma vez:
// nome aleatório de mulher em inglês -> categoria por letra aleatória -> Criar Página.

(function () {
  "use strict";

  const TIMEOUT = 15000;

  // ---------------- Nomes aleatórios (mulher, inglês) ----------------
  const PRIMEIROS = [
    "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Charlotte", "Amelia",
    "Harper", "Evelyn", "Abigail", "Emily", "Ella", "Elizabeth", "Camila", "Luna",
    "Sofia", "Avery", "Mila", "Aria", "Scarlett", "Penelope", "Layla", "Chloe",
    "Victoria", "Madison", "Eleanor", "Grace", "Nora", "Riley", "Zoey", "Hannah",
    "Hazel", "Lily", "Ellie", "Violet", "Lucy", "Stella", "Aurora", "Natalie",
    "Zoe", "Leah", "Hailey", "Audrey", "Savannah", "Brooklyn", "Bella", "Claire",
    "Skylar", "Lucia", "Paisley", "Everly", "Anna", "Caroline", "Nova", "Genesis",
    "Emilia", "Kennedy", "Samantha", "Maya", "Willow", "Kinsley", "Naomi", "Aaliyah",
  ];
  const SOBRENOMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Hill", "Green", "Adams",
    "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
    "Turner", "Phillips", "Parker", "Evans", "Edwards", "Collins", "Morgan", "Murphy",
    "Cooper", "Bailey", "Bell", "Bennett", "Gray", "Hughes", "Price", "Foster",
  ];

  function nomeAleatorio() {
    const a = PRIMEIROS[Math.floor(Math.random() * PRIMEIROS.length)];
    const b = SOBRENOMES[Math.floor(Math.random() * SOBRENOMES.length)];
    return `${a} ${b}`;
  }

  function letraAleatoria() {
    const letras = "abcdefghijklmnopqrstuvwxyz";
    return letras[Math.floor(Math.random() * letras.length)];
  }

  // ---------------- Utilidades ----------------
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  async function esperar(fn, { timeout = TIMEOUT, intervalo = 120 } = {}) {
    const limite = Date.now() + timeout;
    for (;;) {
      let valor;
      try {
        valor = fn();
      } catch (_) {
        valor = null;
      }
      if (valor) return valor;
      if (Date.now() > limite) return null;
      await dormir(intervalo);
    }
  }

  const visivel = (el) =>
    el && el.offsetParent !== null && el.getClientRects().length > 0;

  function definirValor(el, valor) {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function digitar(el, texto) {
    el.focus();
    let acumulado = "";
    for (const ch of texto) {
      acumulado += ch;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      definirValor(el, acumulado);
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      await dormir(70);
    }
  }

  function clicar(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  const txt = (el) => (el?.textContent || "").trim().toLowerCase();

  function acharBotaoCriar() {
    const alvos = ["create page", "criar página", "criar pagina"];
    const candidatos = document.querySelectorAll(
      '[role="button"], button, div[tabindex]'
    );
    for (const el of candidatos) {
      const t = txt(el);
      if (alvos.some((a) => t === a || t.includes(a)) && visivel(el)) return el;
    }
    return null;
  }

  function acharCampos() {
    const combos = [
      ...document.querySelectorAll('input[role="combobox"]'),
    ].filter(visivel);
    const categoria = combos[0] || null;

    const inputs = [...document.querySelectorAll("input")].filter((el) => {
      if (!visivel(el)) return false;
      if (el.getAttribute("role") === "combobox") return false;
      const tipo = (el.type || "text").toLowerCase();
      if (!["text", "search", ""].includes(tipo)) return false;
      const rotulo = (
        (el.getAttribute("aria-label") || "") +
        " " +
        (el.getAttribute("placeholder") || "")
      ).toLowerCase();
      if (
        rotulo.includes("search") ||
        rotulo.includes("pesquis") ||
        rotulo.includes("buscar")
      )
        return false;
      return true;
    });

    const nome =
      inputs.find((el) => {
        const rotulo = (el.getAttribute("aria-label") || "").toLowerCase();
        return rotulo.includes("name") || rotulo.includes("nome");
      }) ||
      inputs[0] ||
      null;

    return { nome, categoria };
  }

  function primeiraOpcao() {
    const listbox = document.querySelector('[role="listbox"]');
    const escopo = listbox || document;
    const opcoes = [...escopo.querySelectorAll('[role="option"]')].filter(
      visivel
    );
    return opcoes[0] || null;
  }

  // ---------------- Aviso na tela ----------------
  let elToast;
  function toast(texto, tipo) {
    if (!elToast) {
      elToast = document.createElement("div");
      Object.assign(elToast.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        background: "#1c1e21",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "10px",
        boxShadow: "0 6px 20px rgba(0,0,0,.35)",
        font: "13px -apple-system, system-ui, sans-serif",
        maxWidth: "280px",
      });
      document.body.appendChild(elToast);
    }
    const cores = { trabalhando: "#f0a500", ok: "#22c55e", erro: "#ef4444" };
    elToast.style.borderLeft = `4px solid ${cores[tipo] || "#9ca3af"}`;
    elToast.textContent = texto;
  }

  // ---------------- Automação ----------------
  async function executar() {
    toast("Iniciando…", "trabalhando");

    const campos = await esperar(() => {
      const c = acharCampos();
      return c.nome && c.categoria ? c : null;
    });
    if (!campos) {
      toast("Erro: campos de nome/categoria não encontrados.", "erro");
      return;
    }

    // 1) Nome (mulher, inglês)
    const nome = nomeAleatorio();
    campos.nome.focus();
    definirValor(campos.nome, nome);
    campos.nome.dispatchEvent(new Event("blur", { bubbles: true }));
    toast(`Nome: ${nome}`, "trabalhando");
    await dormir(450);

    // 2) Categoria: letra aleatória + primeira opção
    const letra = letraAleatoria();
    clicar(campos.categoria);
    campos.categoria.focus();
    await dormir(220);
    await digitar(campos.categoria, letra);

    const opcao = await esperar(() => primeiraOpcao(), { timeout: 9000 });
    if (!opcao) {
      toast(`Erro: nenhuma categoria apareceu para "${letra}".`, "erro");
      return;
    }
    const nomeCategoria = txt(opcao) || "(categoria)";
    clicar(opcao);
    toast(`Categoria: ${nomeCategoria}`, "trabalhando");
    await dormir(550);

    // 3) Botão Criar Página (espera habilitar)
    const botao = await esperar(() => {
      const b = acharBotaoCriar();
      if (!b) return null;
      const desabilitado =
        b.getAttribute("aria-disabled") === "true" || b.disabled === true;
      return desabilitado ? null : b;
    });
    if (!botao) {
      toast("Erro: botão Criar Página não ficou disponível.", "erro");
      return;
    }
    clicar(botao);
    toast(`✓ Criando: "${nome}" · ${nomeCategoria}`, "ok");
  }

  // ---------------- Disparo: só roda se houver pedido pendente ----------------
  function iniciar() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get("pendingCreate", (data) => {
      if (!data || !data.pendingCreate) return;
      // Consome a flag imediatamente para não repetir.
      chrome.storage.local.set({ pendingCreate: false }, () => {
        executar().catch((e) => toast("Erro: " + (e?.message || e), "erro"));
      });
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
