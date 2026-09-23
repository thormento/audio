/**
 * content.js
 * ------------------------------------------------------------
 * Executa nas páginas do Facebook. Não usa módulos ES (limitação de
 * content scripts), por isso é autocontido.
 *
 * Funções:
 *  1. Detectar se o usuário está na tela de login e avisar o service worker.
 *  2. Exibir um widget flutuante com a atividade atual, o tempo restante e
 *     os contadores assistidos (curtidas / solicitações).
 *  3. Na etapa Feed (se habilitado), rolar a página em ritmo variável, com
 *     pausas de leitura, e parar quando o usuário interagir manualmente.
 *
 * O script apenas LÊ a sessão do chrome.storage.local. Nenhuma ação social
 * é executada automaticamente: curtidas, amizades, comentários etc. são
 * sempre manuais.
 */

(() => {
  if (window.__fbSessionAssistantLoaded) return;
  window.__fbSessionAssistantLoaded = true;

  const APP_NAME = 'Facebook Session Assistant';
  const LOG_PREFIX = '[Session Assistant]';
  const SESSION_KEY = 'session';
  const PREFS_KEY = 'prefs';

  let debugLogs = true;
  const log = (...args) => debugLogs && console.log(LOG_PREFIX, ...args);
  const warn = (...args) => debugLogs && console.warn(LOG_PREFIX, ...args);

  const state = {
    tabId: null,
    session: null,
    prefs: { overlay: true, debugLogs: true },
    scrolling: false,
    scrollDeadline: 0,
    scrollStepKey: null,
    lastUserInput: 0,
    overlayCollapsed: false,
    loginFlagged: false
  };

  /* ---------------------------------------------------------- */
  /* Utilidades                                                 */
  /* ---------------------------------------------------------- */

  function randomBetween(min, max) {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(Math.random() * (high - low + 1));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatClock(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function sendMessage(type, payload = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response && response.ok ? response.result : null);
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function currentStep(session) {
    if (!session || session.currentIndex < 0) return null;
    return session.steps[session.currentIndex] || null;
  }

  /* ---------------------------------------------------------- */
  /* Detecção de login                                          */
  /* ---------------------------------------------------------- */

  function looksLikeLoginPage() {
    const path = location.pathname || '';
    if (path.startsWith('/login') || path.startsWith('/checkpoint')) return true;
    if (document.querySelector('#login_form, form[action*="/login"]')) return true;
    if (document.querySelector('input[name="pass"][type="password"]') && !document.querySelector('[role="navigation"] [aria-label]')) {
      return true;
    }
    return false;
  }

  async function checkLogin() {
    const isLogin = looksLikeLoginPage();
    if (isLogin && !state.loginFlagged) {
      state.loginFlagged = true;
      warn('Tela de login detectada');
      await sendMessage('content:loginRequired');
    } else if (!isLogin && state.loginFlagged) {
      state.loginFlagged = false;
      await sendMessage('content:loggedIn');
    } else if (!isLogin && state.session && state.session.warning === 'login') {
      await sendMessage('content:loggedIn');
    }
  }

  /* ---------------------------------------------------------- */
  /* Rolagem com pausas variáveis (apenas Feed)                 */
  /* ---------------------------------------------------------- */

  function smoothScrollBy(distance, durationMs) {
    return new Promise((resolve) => {
      const start = window.scrollY;
      const startTime = performance.now();
      const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t); // ease-in-out
      function frame(now) {
        if (!state.scrolling) return resolve();
        const t = Math.min(1, (now - startTime) / durationMs);
        window.scrollTo(0, start + distance * ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function scrollLoop() {
    log('Rolagem automática iniciada');
    while (state.scrolling && Date.now() < state.scrollDeadline) {
      // Se o usuário mexeu na página recentemente, aguarda.
      if (Date.now() - state.lastUserInput < 8000 || document.hidden) {
        await sleep(1000);
        continue;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200;
      const goBack = !atBottom && Math.random() < 0.08;
      const distance = goBack ? -randomBetween(120, 320) : randomBetween(180, 620);
      await smoothScrollBy(distance, randomBetween(500, 1400));
      if (!state.scrolling) break;
      // Pausa de leitura: normalmente curta, às vezes mais longa.
      const longPause = Math.random() < 0.22;
      await sleep(longPause ? randomBetween(6000, 16000) : randomBetween(1500, 5000));
    }
    state.scrolling = false;
    log('Rolagem automática encerrada');
  }

  function startScrolling(step) {
    if (state.scrolling && state.scrollStepKey === step.key) {
      state.scrollDeadline = step.deadline;
      return;
    }
    state.scrolling = true;
    state.scrollStepKey = step.key;
    state.scrollDeadline = step.deadline;
    scrollLoop().catch((err) => console.error(LOG_PREFIX, 'Falha na rolagem', err));
  }

  function stopScrolling() {
    if (state.scrolling) log('Rolagem automática interrompida');
    state.scrolling = false;
    state.scrollStepKey = null;
  }

  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((eventName) => {
    window.addEventListener(
      eventName,
      () => {
        state.lastUserInput = Date.now();
      },
      { passive: true, capture: true }
    );
  });

  /* ---------------------------------------------------------- */
  /* Widget flutuante                                           */
  /* ---------------------------------------------------------- */

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fsa-overlay';
    overlay.innerHTML = `
      <div class="fsa-head">
        <span class="fsa-title">${APP_NAME}</span>
        <button type="button" class="fsa-toggle" title="Minimizar/expandir">–</button>
      </div>
      <div class="fsa-body">
        <div class="fsa-activity"><span class="fsa-step"></span><span class="fsa-status"></span></div>
        <div class="fsa-time"><span class="fsa-remaining">00:00</span><span class="fsa-drawn"></span></div>
        <div class="fsa-progress"><div class="fsa-progress-bar"></div></div>
        <div class="fsa-goals"></div>
        <div class="fsa-warning" hidden></div>
      </div>
    `;
    overlay.querySelector('.fsa-toggle').addEventListener('click', () => {
      state.overlayCollapsed = !state.overlayCollapsed;
      overlay.classList.toggle('fsa-collapsed', state.overlayCollapsed);
      overlay.querySelector('.fsa-toggle').textContent = state.overlayCollapsed ? '+' : '–';
    });
    overlay.querySelector('.fsa-goals').addEventListener('click', async (event) => {
      const suggest = event.target.closest('[data-suggest]');
      if (suggest) {
        const result = await sendMessage('messages:suggest');
        currentGreeting = result && result.text ? result.text : '';
        const copied = currentGreeting ? await copyText(currentGreeting) : false;
        renderOverlay();
        const note = overlay.querySelector('.fsa-greeting-note');
        if (note) note.textContent = copied ? 'Copiada! Cole na conversa e envie.' : 'Selecione o texto e copie.';
        return;
      }
      const copy = event.target.closest('[data-copy]');
      if (copy && currentGreeting) {
        const copied = await copyText(currentGreeting);
        const note = overlay.querySelector('.fsa-greeting-note');
        if (note) note.textContent = copied ? 'Copiada! Cole na conversa e envie.' : 'Selecione o texto e copie.';
        return;
      }
      const button = event.target.closest('[data-goal]');
      if (!button) return;
      button.disabled = true;
      await sendMessage('session:registerGoal', { goal: button.dataset.goal });
      button.disabled = false;
    });
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  const GOAL_LABELS = {
    likes: { label: 'Curtidas', button: '+ Curtida' },
    friends: { label: 'Amigos', button: '+ Solicitação' },
    messages: { label: 'Mensagens', button: '+ Mensagem', suggest: true }
  };
  let currentGreeting = '';

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } finally {
        area.remove();
      }
      return ok;
    }
  }

  function renderOverlay() {
    const session = state.session;
    const active = session && (session.status === 'running' || session.status === 'paused');
    if (!active || !state.prefs.overlay) {
      removeOverlay();
      return;
    }
    const el = ensureOverlay();
    const step = currentStep(session);
    const now = Date.now();
    const paused = session.status === 'paused';
    const inPause = session.phase === 'pause';

    let label = '';
    let remaining = 0;
    let total = 0;
    if (inPause) {
      label = 'Pausa';
      total = session.pauseDurationMs || 0;
      remaining = session.status === 'running' && session.pauseDeadline ? Math.max(0, session.pauseDeadline - now) : session.pauseRemainingMs || 0;
    } else if (step) {
      label = step.label;
      total = step.durationMs;
      remaining = session.status === 'running' && step.deadline ? Math.max(0, step.deadline - now) : step.remainingMs || 0;
    }

    el.querySelector('.fsa-step').textContent = label;
    el.querySelector('.fsa-status').textContent = paused ? 'Pausado' : `Etapa ${session.currentIndex + 1}/${session.steps.length}`;
    el.querySelector('.fsa-remaining').textContent = formatClock(remaining);
    el.querySelector('.fsa-drawn').textContent = `de ${formatClock(total)}`;
    const pct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 100;
    el.querySelector('.fsa-progress-bar').style.width = `${pct}%`;
    el.classList.toggle('fsa-paused', paused);

    const goalsBox = el.querySelector('.fsa-goals');
    const rows = Object.keys(GOAL_LABELS)
      .filter((key) => session.goals[key] && session.goals[key].enabled)
      .map((key) => {
        const g = session.goals[key];
        const done = g.done >= g.target;
        const row = `
          <div class="fsa-goal ${done ? 'fsa-goal-done' : ''}">
            <span>${GOAL_LABELS[key].label}: <strong>${g.done} / ${g.target}</strong>${done ? ' ✓' : ''}</span>
            <button type="button" data-goal="${key}">${GOAL_LABELS[key].button}</button>
          </div>`;
        if (!GOAL_LABELS[key].suggest) return row;
        const text = currentGreeting
          ? currentGreeting.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : 'Clique em "Saudação" para sortear uma mensagem.';
        return `${row}
          <div class="fsa-greeting">
            <p class="fsa-greeting-text">${text}</p>
            <div class="fsa-greeting-actions">
              <button type="button" data-suggest>Saudação</button>
              <button type="button" data-copy ${currentGreeting ? '' : 'disabled'}>Copiar</button>
            </div>
            <p class="fsa-greeting-note">Você cola e envia; a extensão só sugere.</p>
          </div>`;
      });
    goalsBox.innerHTML = rows.join('');

    const warningBox = el.querySelector('.fsa-warning');
    if (session.warning === 'login') {
      warningBox.textContent = 'Faça login para continuar a sessão.';
      warningBox.hidden = false;
    } else {
      warningBox.hidden = true;
    }
  }

  /* ---------------------------------------------------------- */
  /* Avaliação do estado                                        */
  /* ---------------------------------------------------------- */

  function evaluate() {
    const session = state.session;
    renderOverlay();

    const step = currentStep(session);
    const shouldScroll =
      session &&
      session.status === 'running' &&
      session.phase === 'activity' &&
      step &&
      step.key === 'feed' &&
      step.autoScroll &&
      step.deadline &&
      state.tabId !== null &&
      session.tabId === state.tabId &&
      !looksLikeLoginPage();

    if (shouldScroll) startScrolling(step);
    else stopScrolling();
  }

  async function loadState() {
    try {
      const data = await chrome.storage.local.get([SESSION_KEY, PREFS_KEY]);
      state.session = data[SESSION_KEY] || null;
      if (data[PREFS_KEY]) {
        state.prefs = { ...state.prefs, ...data[PREFS_KEY] };
        debugLogs = state.prefs.debugLogs !== false;
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Falha ao ler storage', err);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SESSION_KEY]) state.session = changes[SESSION_KEY].newValue || null;
    if (changes[PREFS_KEY]) {
      state.prefs = { ...state.prefs, ...(changes[PREFS_KEY].newValue || {}) };
      debugLogs = state.prefs.debugLogs !== false;
    }
    evaluate();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'content:ping') sendResponse({ ok: true, result: { pong: true } });
    return false;
  });

  /* ---------------------------------------------------------- */
  /* Inicialização                                              */
  /* ---------------------------------------------------------- */

  async function init() {
    const whoami = await sendMessage('content:whoami');
    state.tabId = whoami && typeof whoami.tabId === 'number' ? whoami.tabId : null;
    await loadState();
    await checkLogin();
    evaluate();
    setInterval(renderOverlay, 1000);
    setInterval(checkLogin, 15000);
    log('Content script pronto na aba', state.tabId);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
