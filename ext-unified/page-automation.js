// page-automation.js - Injetado em facebook.com/pages/creation*
// Responsável pela automação de criação de páginas

(function() {
  "use strict";

  const LOG_PREFIX = '[Page Automation]';
  const TIMEOUT = 15000;
  const PAUSA_APOS_NOME = 2200;
  const VERIFICA_CRIACAO_MS = 20000;

  let automationActive = false;
  let currentState = null;

  // Nomes para geração
  const PRIMEIROS = [
    "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Charlotte", "Amelia",
    "Harper", "Evelyn", "Abigail", "Emily", "Ella", "Elizabeth", "Avery", "Scarlett",
    "Madison", "Victoria", "Chloe", "Penelope", "Eleanor", "Nora", "Hannah", "Lucy",
    "Natalie", "Zoe", "Leah", "Hailey", "Audrey", "Savannah", "Claire", "Caroline",
  ];

  const SOBRENOMES = [
    "Johnson", "Williams", "Miller", "Davis", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Thompson", "Harris", "Robinson",
    "Walker", "Allen", "Scott", "Adams", "Nelson", "Carter", "Mitchell", "Roberts",
  ];

  const PALAVRAS_BLOQUEADAS = [];

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function randomName() {
    const first = PRIMEIROS[Math.floor(Math.random() * PRIMEIROS.length)];
    const last = SOBRENOMES[Math.floor(Math.random() * SOBRENOMES.length)];
    return `${first} ${last}`;
  }

  function isBlockedName(nome) {
    const n = nome.toLowerCase();
    return PALAVRAS_BLOQUEADAS.some(p => p && n.includes(p.toLowerCase()));
  }

  async function loadNamesFromFile() {
    try {
      const url = chrome.runtime.getURL("nomes.txt");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return [];
      const txt = (await r.text()).replace(/^﻿/, "");
      return txt
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#"));
    } catch (e) {
      return [];
    }
  }

  async function getNextName(useFile) {
    if (useFile) {
      const lista = await loadNamesFromFile();
      if (lista.length) {
        const usados = await chrome.storage.local.get("nomesUsados");
        const used = (usados.nomesUsados || []);
        const livre = lista.find(n => !used.includes(n) && !isBlockedName(n));
        if (livre) {
          used.push(livre);
          await chrome.storage.local.set({ nomesUsados: used });
          return livre;
        }
      }
    }
    return randomName();
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function waitForElement(selector, timeout = TIMEOUT) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  function isVisible(el) {
    return el && el.offsetParent !== null && el.getClientRects().length > 0;
  }

  function setText(el, value) {
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    if (setter) {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  function clickElement(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };

    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));

    if (typeof el.click === "function") {
      try { el.click(); } catch (_) {}
    }
    return true;
  }

  async function createOnePage(useFile) {
    try {
      // Gera ou carrega o próximo nome
      const name = await getNextName(useFile);
      log(`Criando página: ${name}`);

      // Encontra o campo de nome
      const inputs = document.querySelectorAll("input[type='text']");
      const nameInput = Array.from(inputs).find(el => isVisible(el));

      if (!nameInput) {
        log("Campo de nome não encontrado");
        return { success: false, error: "Campo de nome não encontrado" };
      }

      // Preenche o nome
      setText(nameInput, name);
      await sleep(500);

      // Aguarda a categoria aparecer
      await sleep(PAUSA_APOS_NOME);

      // Seleciona uma categoria aleatória (primeira opção)
      const listbox = document.querySelector('[role="listbox"]');
      const options = Array.from(document.querySelectorAll('[role="option"]')).filter(isVisible);

      if (options.length > 0) {
        clickElement(options[0]);
        await sleep(500);
      }

      // Clica no botão "Criar Página"
      const buttons = document.querySelectorAll("button");
      const createBtn = Array.from(buttons).find(el =>
        isVisible(el) &&
        (el.textContent.includes("Create") || el.textContent.includes("Criar"))
      );

      if (createBtn) {
        clickElement(createBtn);
        log(`✓ Página "${name}" criada`);
        return { success: true, name };
      } else {
        log("Botão de criação não encontrado");
        return { success: false, error: "Botão de criação não encontrado" };
      }
    } catch (err) {
      log("Erro durante criação:", err);
      return { success: false, error: err.message };
    }
  }

  async function runAutomation(quantity, useFile) {
    automationActive = true;
    currentState = { quantity, created: 0, useFile, log: [] };

    for (let i = 0; i < quantity && automationActive; i++) {
      currentState.created++;
      const result = await createOnePage(useFile);

      if (result.success) {
        currentState.log.push(`✓ ${result.name}`);
      } else {
        currentState.log.push(`✗ Erro: ${result.error}`);
      }

      // Aguarda antes da próxima criação
      if (i < quantity - 1 && automationActive) {
        await sleep(2000);
      }
    }

    automationActive = false;
    return currentState;
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return false;

    if (message.type === 'START_PAGE_AUTOMATION') {
      runAutomation(message.quantity || 1, message.useFile !== false)
        .then(state => sendResponse({ ok: true, state }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // resposta assíncrona
    }

    if (message.type === 'STOP_PAGE_AUTOMATION') {
      automationActive = false;
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'GET_PAGE_AUTOMATION_STATUS') {
      sendResponse({ ok: true, state: currentState });
      return false;
    }

    return false;
  });

  log("Página automation pronto");
})();
