// ==UserScript==
// @name         Criador de Páginas do Facebook
// @namespace    https://github.com/thormento/audio
// @version      1.0.0
// @description  Macro para criar Páginas no Facebook: gera um nome aleatório, escolhe uma categoria aleatória (digita uma letra e pega a primeira opção) e clica em Criar.
// @author       fabio
// @match        https://www.facebook.com/pages/creation*
// @match        https://facebook.com/pages/creation*
// @match        https://m.facebook.com/pages/creation*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ============================ CONFIGURAÇÃO ============================
  // Atalho de teclado para disparar a macro (além do botão flutuante).
  // Padrão: Alt + C
  const TECLA_ATALHO = { alt: true, ctrl: false, shift: false, key: "c" };

  // Se true, dispara a macro sozinha assim que a página de criação carrega.
  // Deixe false para acionar manualmente (botão ou atalho).
  const AUTO_EXECUTAR = false;

  // Tempo máximo de espera (ms) para cada elemento aparecer na tela.
  const TIMEOUT = 12000;
  // ======================================================================

  // ----- Geração de nome aleatório de página -----
  const PREFIXOS = [
    "alem", "novo", "mundo", "portal", "central", "top", "info", "hub", "vida",
    "click", "mega", "prime", "eco", "nova", "flow", "zen", "urban", "aura",
    "brisa", "raiz", "onda", "luz", "sol", "lua", "mar", "vale", "monte", "rio",
  ];
  const SUFIXOS = [
    "portal", "news", "store", "media", "digital", "online", "brasil", "oficial",
    "express", "market", "studio", "space", "world", "zone", "point", "lab",
    "hub", "trends", "shop", "club", "spot", "group", "vibe", "co",
  ];

  function nomeAleatorio() {
    const a = PREFIXOS[Math.floor(Math.random() * PREFIXOS.length)];
    const b = SUFIXOS[Math.floor(Math.random() * SUFIXOS.length)];
    return `${a} ${b}`;
  }

  function letraAleatoria() {
    const letras = "abcdefghijklmnopqrstuvwxyz";
    return letras[Math.floor(Math.random() * letras.length)];
  }

  // ----- Utilidades -----
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  // Espera uma condição virar verdadeira (retornando o valor) ou estoura o timeout.
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

  // Define o valor de um input/textarea disparando os eventos que o React escuta.
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

  // Simula digitar caractere por caractere (necessário para o typeahead da categoria).
  async function digitar(el, texto) {
    el.focus();
    let acumulado = "";
    for (const ch of texto) {
      acumulado += ch;
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      definirValor(el, acumulado);
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      await dormir(60);
    }
  }

  // Clique "de verdade": alguns componentes do FB só reagem à sequência de eventos de ponteiro.
  function clicar(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  // Texto de um elemento em minúsculas (para casar rótulos em pt/en).
  const txt = (el) => (el?.textContent || "").trim().toLowerCase();

  // Localiza o container do formulário a partir do botão "Criar Página" / "Create Page".
  function acharBotaoCriar() {
    const alvos = ["create page", "criar página", "criar pagina"];
    const candidatos = document.querySelectorAll(
      '[role="button"], button, div[tabindex]'
    );
    for (const el of candidatos) {
      const t = txt(el);
      if (alvos.some((a) => t === a || t.includes(a))) {
        if (visivel(el)) return el;
      }
    }
    return null;
  }

  // Acha os inputs do formulário: nome (textbox) e categoria (combobox).
  function acharCampos() {
    // A categoria é sempre um combobox.
    const combos = [...document.querySelectorAll('input[role="combobox"]')].filter(
      visivel
    );
    const categoria = combos[0] || null;

    // O nome é o input de texto do formulário que não é a busca do topo nem o combobox.
    let nome = null;
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
      // Descarta a barra de busca do topo do Facebook.
      if (rotulo.includes("search") || rotulo.includes("pesquis") || rotulo.includes("buscar"))
        return false;
      return true;
    });

    // Preferência: rótulo que menciona "name"/"nome".
    nome =
      inputs.find((el) => {
        const rotulo = (el.getAttribute("aria-label") || "").toLowerCase();
        return rotulo.includes("name") || rotulo.includes("nome");
      }) || inputs[0] || null;

    return { nome, categoria };
  }

  function primeiraOpcao() {
    const listbox = document.querySelector('[role="listbox"]');
    const escopo = listbox || document;
    const opcoes = [...escopo.querySelectorAll('[role="option"]')].filter(visivel);
    return opcoes[0] || null;
  }

  let rodando = false;

  async function executar() {
    if (rodando) return;
    rodando = true;
    definirStatus("Iniciando…", "trabalhando");
    try {
      // 1) Localiza os campos
      const campos = await esperar(() => {
        const c = acharCampos();
        return c.nome && c.categoria ? c : null;
      });
      if (!campos) throw new Error("não encontrei os campos de nome/categoria");

      // 2) Nome aleatório
      const nome = nomeAleatorio();
      campos.nome.focus();
      definirValor(campos.nome, nome);
      campos.nome.dispatchEvent(new Event("blur", { bubbles: true }));
      definirStatus(`Nome: ${nome}`, "trabalhando");
      await dormir(400);

      // 3) Categoria: digita uma letra e pega a primeira opção
      const letra = letraAleatoria();
      clicar(campos.categoria);
      campos.categoria.focus();
      await dormir(200);
      await digitar(campos.categoria, letra);

      const opcao = await esperar(() => primeiraOpcao(), { timeout: 8000 });
      if (!opcao) throw new Error(`nenhuma categoria apareceu para a letra "${letra}"`);
      const nomeCategoria = txt(opcao) || "(categoria)";
      clicar(opcao);
      definirStatus(`Categoria: ${nomeCategoria}`, "trabalhando");
      await dormir(500);

      // 4) Espera o botão ficar habilitado e clica em Criar
      const botao = await esperar(() => {
        const b = acharBotaoCriar();
        if (!b) return null;
        const desabilitado =
          b.getAttribute("aria-disabled") === "true" || b.disabled === true;
        return desabilitado ? null : b;
      });
      if (!botao) throw new Error("o botão Criar Página não ficou disponível");
      clicar(botao);

      definirStatus(`✓ Criando: "${nome}" · ${nomeCategoria}`, "ok");
    } catch (erro) {
      console.error("[Criador de Páginas]", erro);
      definirStatus(`Erro: ${erro.message || erro}`, "erro");
    } finally {
      rodando = false;
    }
  }

  // ----- Interface: botão flutuante + status -----
  let elStatus;

  function definirStatus(texto, tipo) {
    if (!elStatus) return;
    const cores = { trabalhando: "#f0a500", ok: "#22c55e", erro: "#ef4444", "": "#9ca3af" };
    elStatus.textContent = texto;
    elStatus.style.color = cores[tipo] || cores[""];
  }

  function montarUI() {
    if (document.getElementById("macro-criar-paginas")) return;

    const caixa = document.createElement("div");
    caixa.id = "macro-criar-paginas";
    Object.assign(caixa.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      background: "#1c1e21",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: "10px",
      boxShadow: "0 6px 20px rgba(0,0,0,.35)",
      font: "13px -apple-system, system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      maxWidth: "260px",
    });

    const botao = document.createElement("button");
    botao.textContent = "Criar página (macro)";
    Object.assign(botao.style, {
      background: "#1877f2",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "8px 10px",
      fontWeight: "600",
      cursor: "pointer",
    });
    botao.addEventListener("click", executar);

    elStatus = document.createElement("div");
    elStatus.style.fontSize = "12px";
    elStatus.style.color = "#9ca3af";
    elStatus.textContent = `Pronto · atalho ${TECLA_ATALHO.alt ? "Alt+" : ""}${
      TECLA_ATALHO.ctrl ? "Ctrl+" : ""
    }${TECLA_ATALHO.shift ? "Shift+" : ""}${TECLA_ATALHO.key.toUpperCase()}`;

    caixa.appendChild(botao);
    caixa.appendChild(elStatus);
    document.body.appendChild(caixa);
  }

  document.addEventListener("keydown", (e) => {
    if (
      !!e.altKey === !!TECLA_ATALHO.alt &&
      !!e.ctrlKey === !!TECLA_ATALHO.ctrl &&
      !!e.shiftKey === !!TECLA_ATALHO.shift &&
      e.key.toLowerCase() === TECLA_ATALHO.key.toLowerCase()
    ) {
      e.preventDefault();
      executar();
    }
  });

  function iniciar() {
    montarUI();
    if (AUTO_EXECUTAR) esperar(() => acharCampos().categoria).then(() => executar());
  }

  if (document.body) iniciar();
  else window.addEventListener("DOMContentLoaded", iniciar);
})();
