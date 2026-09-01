// Content script: roda em facebook.com/pages/creation.
// Se houver um pedido pendente (feito pelo popup), executa a automação uma vez:
// nome aleatório de mulher em inglês -> categoria por letra aleatória -> Criar Página.

(function () {
  "use strict";

  const TIMEOUT = 15000;
  // Pausa após preencher o nome, antes de mexer na categoria (o usuário pediu >= 2s).
  const PAUSA_APOS_NOME = 2200;

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

  const txt = (el) => (el?.textContent || "").trim().toLowerCase();

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
      await dormir(90);
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

  // ---------------- Localização dos campos pelo RÓTULO ----------------
  // O formulário do FB envolve cada campo num <label> que contém o texto do rótulo.
  // Isso evita confundir com a barra de busca do topo (outro combobox da página).
  function labelPorTexto(alvos) {
    const labels = [...document.querySelectorAll("label")].filter(visivel);
    // Prefere o label mais "curto" (o do próprio campo, não um container gigante).
    let melhor = null;
    let melhorTam = Infinity;
    for (const lb of labels) {
      const t = txt(lb);
      if (!t) continue;
      if (!alvos.some((a) => t.includes(a))) continue;
      if (t.length < melhorTam) {
        melhor = lb;
        melhorTam = t.length;
      }
    }
    return melhor;
  }

  const ROTULOS_NOME = ["page name", "nome da página", "nome da pagina"];
  const ROTULOS_CATEGORIA = ["category", "categoria"];

  function acharCampos() {
    const nomeLabel = labelPorTexto(ROTULOS_NOME);
    const catLabel = labelPorTexto(ROTULOS_CATEGORIA);
    const nomeInput = nomeLabel
      ? [...nomeLabel.querySelectorAll("input, textarea")].find(visivel)
      : null;
    return { nomeInput, catLabel };
  }

  function primeiraOpcao() {
    const listbox = document.querySelector('[role="listbox"]');
    const escopo = listbox || document;
    const opcoes = [...escopo.querySelectorAll('[role="option"]')].filter(
      visivel
    );
    return opcoes[0] || null;
  }

  const ALVOS_BOTAO = ["create page", "criar página", "criar pagina"];

  function acharBotaoCriar() {
    // 1) Acha o elemento cujo texto é exatamente "Create Page"/"Criar Página"
    //    (o <span> interno) e sobe até o ancestral clicável (role="button").
    const todos = document.querySelectorAll("span, div, button, a");
    for (const el of todos) {
      if (!visivel(el)) continue;
      if (!ALVOS_BOTAO.includes(txt(el))) continue;
      let cur = el;
      for (let i = 0; i < 8 && cur; i++) {
        const role = cur.getAttribute && cur.getAttribute("role");
        if (role === "button" || cur.tagName === "BUTTON" || cur.tagName === "A") {
          return cur;
        }
        cur = cur.parentElement;
      }
      return el; // sem ancestral clicável explícito: clica no próprio texto
    }
    // 2) Fallback: qualquer clicável que contenha o texto.
    for (const el of document.querySelectorAll(
      '[role="button"], button, div[tabindex]'
    )) {
      if (ALVOS_BOTAO.some((a) => txt(el).includes(a)) && visivel(el)) return el;
    }
    return null;
  }

  // O aria-disabled costuma ficar num ancestral, não no próprio texto.
  function estaDesabilitado(el) {
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
      if (cur.getAttribute && cur.getAttribute("aria-disabled") === "true")
        return true;
      if (cur.disabled === true) return true;
      cur = cur.parentElement;
    }
    return false;
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
        maxWidth: "300px",
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
      return c.nomeInput && c.catLabel ? c : null;
    });
    if (!campos) {
      toast("Erro: campos de nome/categoria não encontrados.", "erro");
      return;
    }

    // 1) Nome (mulher, inglês)
    const nome = nomeAleatorio();
    clicar(campos.nomeInput);
    campos.nomeInput.focus();
    definirValor(campos.nomeInput, nome);
    campos.nomeInput.dispatchEvent(new Event("blur", { bubbles: true }));
    toast(`Nome: ${nome} — aguardando…`, "trabalhando");

    // Pausa pedida antes de ir para a categoria (>= 2s).
    await dormir(PAUSA_APOS_NOME);

    // 2) Categoria: clica DENTRO do campo de categoria, digita uma letra
    //    e seleciona a primeira opção.
    clicar(campos.catLabel);
    // O input real da categoria fica dentro do próprio <label> do campo.
    const catInput = await esperar(
      () => {
        const i = [...campos.catLabel.querySelectorAll("input")].find(visivel);
        return i || null;
      },
      { timeout: 6000 }
    );
    if (!catInput) {
      toast("Erro: campo de categoria não abriu.", "erro");
      return;
    }
    clicar(catInput);
    catInput.focus();
    await dormir(300);

    const letra = letraAleatoria();
    await digitar(catInput, letra);

    const opcao = await esperar(() => primeiraOpcao(), { timeout: 9000 });
    if (!opcao) {
      toast(`Erro: nenhuma categoria apareceu para "${letra}".`, "erro");
      return;
    }
    const nomeCategoria = txt(opcao) || "(categoria)";
    clicar(opcao);
    toast(`Categoria: ${nomeCategoria}`, "trabalhando");
    await dormir(600);

    // 3) Botão Criar Página: acha o botão e espera ele habilitar; clica.
    const botao = await esperar(() => acharBotaoCriar());
    if (!botao) {
      toast("Erro: botão Criar Página não foi encontrado.", "erro");
      return;
    }
    // Espera ficar habilitado (até 6s), mas segue e clica de qualquer forma.
    await esperar(() => (estaDesabilitado(botao) ? null : true), {
      timeout: 6000,
    });
    clicar(botao);
    await dormir(400);
    // Reforço: se o botão ainda estiver na tela, tenta clicar mais uma vez.
    const aindaBotao = acharBotaoCriar();
    if (aindaBotao) clicar(aindaBotao);
    toast(`✓ Criando: "${nome}" · ${nomeCategoria}`, "ok");
  }

  // ---------------- Disparo: só roda se houver pedido pendente ----------------
  function iniciar() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get("pendingCreate", (data) => {
      if (!data || !data.pendingCreate) return;
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
