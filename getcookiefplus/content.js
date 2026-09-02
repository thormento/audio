// Content script: roda em facebook.com/pages/creation.
// Se houver um pedido pendente (feito pelo popup), executa a automação uma vez:
// nome aleatório de mulher em inglês -> categoria por letra aleatória -> Criar Página.

(function () {
  "use strict";

  const TIMEOUT = 15000;
  // Pausa após preencher o nome, antes de mexer na categoria (o usuário pediu >= 2s).
  const PAUSA_APOS_NOME = 2200;
  // Quanto tempo observar, após clicar em Criar, se a página foi realmente criada.
  const VERIFICA_CRIACAO_MS = 20000;
  let stepAtual = null;

  // ---------------- Nomes aleatórios (mulher americana, 2 palavras) ----------------
  // Apenas primeiros nomes claramente femininos e comuns nos EUA — evitando os que
  // também são palavra comum (Nova, Genesis, Willow, Hazel, Violet, Aurora, Luna...).
  const PRIMEIROS = [
    "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Charlotte", "Amelia",
    "Harper", "Evelyn", "Abigail", "Emily", "Ella", "Elizabeth", "Avery", "Scarlett",
    "Madison", "Victoria", "Chloe", "Penelope", "Eleanor", "Nora", "Hannah", "Lucy",
    "Natalie", "Zoe", "Leah", "Hailey", "Audrey", "Savannah", "Claire", "Caroline",
    "Samantha", "Anna", "Kennedy", "Ellie", "Aubrey", "Addison", "Sarah", "Katherine",
    "Allison", "Alexis", "Julia", "Alexandra", "Madeline", "Rebecca", "Rachel",
    "Jessica", "Ashley", "Amanda", "Nicole", "Stephanie", "Lauren", "Danielle",
    "Vanessa", "Brianna", "Kaitlyn", "Paige", "Molly", "Erin", "Haley", "Sydney",
  ];
  // Sobrenomes americanos comuns — evitando os que são substantivo comum
  // (Green, King, Price, Baker, Foster, Bell, Hill, Gray, Young, White...).
  const SOBRENOMES = [
    "Johnson", "Williams", "Miller", "Davis", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Thompson", "Harris", "Robinson",
    "Walker", "Allen", "Scott", "Adams", "Nelson", "Carter", "Mitchell", "Roberts",
    "Turner", "Phillips", "Evans", "Edwards", "Collins", "Murphy", "Bennett",
    "Hughes", "Peterson", "Richardson", "Watson", "Brooks", "Sanders", "Bryant",
    "Russell", "Griffin", "Hayes", "Myers", "Hamilton", "Graham", "Sullivan",
    "Wallace", "Simpson", "Stevens", "Tucker", "Porter", "Crawford", "Mason",
    "Warren", "Dixon", "Gordon", "Holmes", "Robertson", "Reynolds", "Ferguson",
    "Spencer", "Matthews", "Franklin", "Lawson", "Bishop", "Harrison", "Fisher",
  ];

  // Palavras que o Facebook costuma recusar em nomes de página.
  // Edite esta lista (em minúsculas): qualquer nome que contenha uma delas é descartado.
  const PALAVRAS_BLOQUEADAS = [
    // exemplos — adicione as que você encontrar:
    // "official", "free", "real",
  ];

  function nomeBloqueado(nome) {
    const n = nome.toLowerCase();
    return PALAVRAS_BLOQUEADAS.some((p) => p && n.includes(p.toLowerCase()));
  }

  function nomeAleatorio() {
    for (let i = 0; i < 80; i++) {
      const a = PRIMEIROS[Math.floor(Math.random() * PRIMEIROS.length)];
      const b = SOBRENOMES[Math.floor(Math.random() * SOBRENOMES.length)];
      const nome = `${a} ${b}`;
      if (!nomeBloqueado(nome)) return nome;
    }
    return `${PRIMEIROS[0]} ${SOBRENOMES[0]}`;
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

  // Clique "real" pelas coordenadas do elemento: atinge a camada que está por cima
  // (o FB coloca uma div transparente sobre o botão para capturar o clique).
  function clicarReal(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch (_) {}
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const alvo = document.elementFromPoint(x, y) || el;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
    };
    const seq = [
      ["pointerover", PointerEvent],
      ["pointerenter", PointerEvent],
      ["pointerdown", PointerEvent],
      ["mousedown", MouseEvent],
      ["pointerup", PointerEvent],
      ["mouseup", MouseEvent],
      ["click", MouseEvent],
    ];
    for (const [type, Ctor] of seq) {
      alvo.dispatchEvent(new Ctor(type, opts));
    }
    if (typeof el.click === "function") {
      try {
        el.click();
      } catch (_) {}
    }
  }

  // Dispara uma tecla especial (ex.: ArrowDown, Enter) com keyCode para o FB reconhecer.
  function teclar(el, key, code, keyCode) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      if (type === "keypress" && key !== "Enter") continue;
      const e = new KeyboardEvent(type, {
        key,
        code,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(e, "keyCode", { get: () => keyCode });
      Object.defineProperty(e, "which", { get: () => keyCode });
      el.dispatchEvent(e);
    }
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
  async function preencherNome(campos, nome) {
    clicar(campos.nomeInput);
    campos.nomeInput.focus();
    // Digita caractere a caractere (o React do FB registra melhor) e reforça.
    await digitar(campos.nomeInput, nome);
    definirValor(campos.nomeInput, nome);
    campos.nomeInput.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // Seleciona uma categoria (letra aleatória -> primeira opção).
  // Devolve o nome da categoria escolhida ou null se não conseguiu.
  async function selecionarCategoria(campos) {
    clicar(campos.catLabel);
    const catInput = await esperar(
      () => [...campos.catLabel.querySelectorAll("input")].find(visivel) || null,
      { timeout: 6000 }
    );
    if (!catInput) return null;
    clicar(catInput);
    catInput.focus();
    await dormir(300);
    definirValor(catInput, "");

    const letra = letraAleatoria();
    await digitar(catInput, letra);

    const opcao = await esperar(() => primeiraOpcao(), { timeout: 9000 });
    if (!opcao) return null;
    const nomeCategoria = txt(opcao) || "(categoria)";

    // 1) teclado: seta para baixo + Enter
    await dormir(300);
    teclar(catInput, "ArrowDown", "ArrowDown", 40);
    await dormir(300);
    teclar(catInput, "Enter", "Enter", 13);
    await dormir(700);
    // 2) lista ainda aberta? clique real na primeira opção
    if (primeiraOpcao()) {
      clicarReal(primeiraOpcao());
      await dormir(600);
    }
    // 3) ainda aberta? clique sintético
    if (primeiraOpcao()) {
      const op = primeiraOpcao();
      if (op) clicar(op);
      await dormir(500);
    }
    return nomeCategoria;
  }

  function botaoCriarHabilitado() {
    const b = acharBotaoCriar();
    return b && !estaDesabilitado(b) ? b : null;
  }

  async function executar() {
    toast("Iniciando…", "trabalhando");

    const campos = await esperar(() => {
      const c = acharCampos();
      return c.nomeInput && c.catLabel ? c : null;
    });
    if (!campos) {
      toast("Erro: campos de nome/categoria não encontrados.", "erro");
      return { criada: false };
    }

    // 1) Nome (mulher, inglês)
    const nome = nomeAleatorio();
    await preencherNome(campos, nome);
    toast(`Nome: ${nome} — aguardando…`, "trabalhando");
    await dormir(PAUSA_APOS_NOME);

    // 2) Categoria
    let nomeCategoria = await selecionarCategoria(campos);
    if (!nomeCategoria) {
      toast("Erro: não consegui selecionar a categoria.", "erro");
      return { criada: false };
    }
    toast(`Categoria: ${nomeCategoria} — aguardando 2s…`, "trabalhando");
    await dormir(2000);

    // 3) Botão Criar Página: espera existir e HABILITAR. Se continuar
    //    desabilitado, reforça nome + categoria e espera de novo (até 2x).
    const botao = await esperar(() => acharBotaoCriar());
    if (!botao) {
      toast("Erro: botão Criar Página não foi encontrado.", "erro");
      return { criada: false };
    }
    let habil = await esperar(() => botaoCriarHabilitado(), { timeout: 12000 });
    for (let r = 0; r < 2 && !habil; r++) {
      toast(`Botão desabilitado — reforçando campos (${r + 1}/2)…`, "trabalhando");
      const c2 = acharCampos();
      if (c2.nomeInput) await preencherNome(c2, nome);
      await dormir(800);
      if (c2.catLabel) {
        const nc = await selecionarCategoria(c2);
        if (nc) nomeCategoria = nc;
      }
      await dormir(1500);
      habil = await esperar(() => botaoCriarHabilitado(), { timeout: 8000 });
    }

    avisarClique(); // a partir daqui, sinal de sucesso = página criada
    toast(`Criando: "${nome}" · ${nomeCategoria}…`, "trabalhando");

    // 4) Clica e verifica. Só clica DE NOVO se o botão continuar presente e
    //    habilitado (o clique não "pegou"); se sumiu/desabilitou, está
    //    processando — não reclicar para não duplicar.
    let criada = false;
    for (let tent = 0; tent < 3 && !criada; tent++) {
      const b = botaoCriarHabilitado() || acharBotaoCriar();
      if (!b) break;
      clicarReal(b);
      try {
        if (typeof b.click === "function") b.click();
      } catch (_) {}
      criada = await verificarCriacao(7000);
      if (criada || temErroCriacao()) break;
      if (!botaoCriarHabilitado()) break; // processando
      toast(`Clique não pegou — tentando de novo (${tent + 2}/3)…`, "trabalhando");
      await dormir(800);
    }
    if (!criada && !temErroCriacao()) criada = await verificarCriacao(VERIFICA_CRIACAO_MS);

    toast(
      criada ? `✓ Página criada: "${nome}"` : `✗ Não criou: "${nome}"`,
      criada ? "ok" : "erro"
    );
    return { criada };
  }

  // ---------------- Verificação do resultado ----------------
  // O FB costuma FICAR na mesma URL e mostrar, por exemplo:
  // "Sydney Watson was created. You can now add images or go to your Page…"
  const FRASES_SUCESSO = [
    "was created",
    "you can now add images",
    "go to your page",
    "foi criada",
    "agora você pode adicionar",
    "agora voce pode adicionar",
    "ir para sua página",
    "ir para sua pagina",
    "ir para a página",
    "page created",
    "página criada",
    "pagina criada",
  ];
  const FRASES_ERRO = [
    "error occurred while creating",
    "ocorreu um erro ao criar",
    "não foi possível criar",
    "nao foi possivel criar",
    "erro ao criar",
    "something went wrong",
    "algo deu errado",
  ];

  function textoPagina() {
    return ((document.body && document.body.innerText) || "").toLowerCase();
  }
  function temSucessoCriacao() {
    const t = textoPagina();
    return FRASES_SUCESSO.some((f) => t.includes(f));
  }
  function temErroCriacao() {
    const t = textoPagina();
    return FRASES_ERRO.some((f) => t.includes(f));
  }
  function saiuDoFormulario() {
    const u = location.href.toLowerCase();
    if (u.indexOf("/pages/creation") > -1) return false;
    if (u.indexOf("/login") > -1 || u.indexOf("checkpoint") > -1) return false;
    return true;
  }

  async function verificarCriacao(ms) {
    const limite = Date.now() + (ms || VERIFICA_CRIACAO_MS);
    while (Date.now() < limite) {
      if (temSucessoCriacao() || saiuDoFormulario()) return true;
      if (temErroCriacao()) return false;
      await dormir(300);
    }
    return false;
  }

  function avisarClique() {
    try {
      chrome.runtime.sendMessage({ action: "clicouCriar", stepId: stepAtual });
    } catch (e) {}
  }

  // ---------------- Disparo: só roda se houver pedido pendente ----------------
  function iniciar() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.get(["pendingCreate", "pendingStep"], (data) => {
      if (!data || !data.pendingCreate) return;
      const stepId = data.pendingStep;
      stepAtual = stepId;
      chrome.storage.local.set({ pendingCreate: false }, () => {
        executar()
          .then((r) => concluir(true, stepId, !!(r && r.criada)))
          .catch((e) => {
            toast("Erro: " + (e?.message || e), "erro");
            concluir(false, stepId, false);
          });
      });
    });
  }

  function concluir(ok, stepId, criada) {
    try {
      chrome.runtime.sendMessage({
        action: "criacaoConcluida",
        ok: ok,
        stepId: stepId,
        criada: !!criada,
      });
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
