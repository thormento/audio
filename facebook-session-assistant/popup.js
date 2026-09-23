/**
 * popup.js
 * ------------------------------------------------------------
 * Interface do painel. Lê configurações e sessão do storage, envia
 * comandos ao service worker e atualiza os cronômetros a cada
 * segundo a partir dos prazos salvos (nunca controla a sessão
 * sozinho: se o popup fechar, o service worker continua).
 */

import {
  APP_NAME,
  ACTIVITIES,
  GOALS,
  SESSION_STATUS,
  PHASE,
  STEP_STATUS,
  STATUS_LABELS,
  STORAGE_KEYS,
  HISTORY_LIMIT,
  DURATION_MODES,
  TOTAL_MINUTES_PRESETS
} from './utils/constants.js';
import * as storage from './utils/storage.js';
import { getCurrentStep, getNextStep, stepRemainingMs, pauseRemainingMs, distributeTotalMinutes } from './utils/session.js';
import { formatClock, formatDuration, formatDate, formatTime, formatMinutesShort, progress } from './utils/timer.js';
import { log, error, initLogger } from './utils/logger.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  settings: null,
  session: null,
  history: [],
  profileName: '',
  view: 'panel',
  busy: false,
  lastZeroCheck: 0
};

/* ------------------------------------------------------------ */
/* Comunicação com o service worker                             */
/* ------------------------------------------------------------ */

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('Sem resposta do service worker.'));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error || 'Erro desconhecido.'));
          return;
        }
        resolve(response.result);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function runCommand(type, payload, successMessage) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await send(type, payload);
    if (result && typeof result === 'object' && 'status' in result) state.session = result;
    if (result === null) state.session = null;
    if (successMessage) toast(successMessage, 'success');
    render();
  } catch (err) {
    error(`Comando ${type} falhou`, err);
    toast(err.message, 'error');
  } finally {
    state.busy = false;
  }
}

/* ------------------------------------------------------------ */
/* Toast                                                        */
/* ------------------------------------------------------------ */

let toastTimer = null;
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`.trim();
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

/* ------------------------------------------------------------ */
/* Formulário de configuração                                   */
/* ------------------------------------------------------------ */

function buildActivityCards() {
  const container = $('#activity-cards');
  container.innerHTML = '';
  ACTIVITIES.forEach((activity) => {
    const card = document.createElement('div');
    card.className = 'card activity-card';
    card.dataset.key = activity.key;
    card.innerHTML = `
      <div class="card-head">
        <div>
          <h3>${activity.label}</h3>
          <p class="desc">${activity.title} · ${activity.description}</p>
        </div>
        <label class="switch" title="Ativar/desativar">
          <input type="checkbox" data-field="${activity.key}.enabled">
          <span></span>
        </label>
      </div>
      <div class="range-row mode-random">
        <label><span>Tempo mínimo</span><input type="number" min="1" step="1" data-field="${activity.key}.min"></label>
        <label><span>Tempo máximo</span><input type="number" min="1" step="1" data-field="${activity.key}.max"></label>
        <span class="unit">${activity.unit}</span>
      </div>
      <div class="weight-row mode-total">
        <div class="weight-head">
          <span>Participação: <strong data-weight-label="${activity.key}">0%</strong></span>
          <span>≈ <strong data-weight-time="${activity.key}">00:00</strong></span>
        </div>
        <input type="range" min="0" max="100" step="5" data-field="${activity.key}.weight">
      </div>
      ${
        activity.supportsAutoScroll
          ? `<label class="check-row sub"><input type="checkbox" data-field="${activity.key}.autoScroll"><span>Rolagem automática com pausas variáveis</span></label>`
          : ''
      }
      <div class="drawn">Nesta sessão: <strong data-drawn="${activity.key}">—</strong></div>
    `;
    container.appendChild(card);
  });
}

function buildGoalCards() {
  const container = $('#goal-cards');
  container.innerHTML = '';
  GOALS.forEach((goal) => {
    const card = document.createElement('div');
    card.className = 'card goal-card';
    card.dataset.key = goal.key;
    card.innerHTML = `
      <div class="card-head">
        <div>
          <h3>${goal.label}</h3>
          <p class="desc">${goal.title} · ${goal.description}</p>
        </div>
        <label class="switch" title="Ativar/desativar">
          <input type="checkbox" data-field="${goal.key}.enabled">
          <span></span>
        </label>
      </div>
      <div class="range-row">
        <label><span>Mínimo</span><input type="number" min="0" step="1" data-field="${goal.key}.min"></label>
        <label><span>Máximo</span><input type="number" min="0" step="1" data-field="${goal.key}.max"></label>
        <span class="unit">${goal.unit}</span>
      </div>
      <div class="drawn">Meta sorteada para a sessão atual: <strong data-drawn="${goal.key}">—</strong></div>
    `;
    container.appendChild(card);
  });
}

/** Preenche os campos a partir de state.settings. */
function fillForm() {
  const s = state.settings;
  if (!s) return;
  document.querySelectorAll('[data-field]').forEach((input) => {
    const [group, field] = input.dataset.field.split('.');
    const value = s[group] ? s[group][field] : undefined;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value === undefined ? '' : value;
    input.classList.remove('invalid');
  });
  $('#opt-shuffle').checked = Boolean(s.shuffle);
  $('#opt-pauses').checked = Boolean(s.pauses.enabled);
  const modeInput = document.querySelector(`input[name="duration-mode"][value="${s.durationMode}"]`);
  if (modeInput) modeInput.checked = true;
  $('#opt-total-minutes').value = s.totalMinutes;
  updateCardStates();
}

function buildTotalPresets() {
  const box = $('#total-presets');
  box.innerHTML = TOTAL_MINUTES_PRESETS.map((m) => `<button type="button" class="chip" data-preset="${m}">${m} min</button>`).join('');
}

function currentMode() {
  const checked = document.querySelector('input[name="duration-mode"]:checked');
  return checked ? checked.value : DURATION_MODES.RANDOM;
}

const DIST_COLORS = { feed: '#1877F2', reels: '#E1306C', videos: '#31A24C', lives: '#F7B928', games: '#8E44AD' };

/** Atualiza a prévia da divisão do tempo total e os rótulos das barras. */
function updateDistributionPreview() {
  const form = readForm();
  const distributed = distributeTotalMinutes(form);
  const totalSeconds = Math.max(0, Math.round(Number(form.totalMinutes) || 0)) * 60;

  document.querySelectorAll('[data-weight-label]').forEach((el) => {
    const key = el.dataset.weightLabel;
    const cfg = form[key] || {};
    el.textContent = `${Number(cfg.weight) || 0}%`;
  });
  document.querySelectorAll('[data-weight-time]').forEach((el) => {
    el.textContent = formatClock(distributed[el.dataset.weightTime] || 0);
  });

  document.querySelectorAll('.chip[data-preset]').forEach((chip) => {
    chip.classList.toggle('active', Number(chip.dataset.preset) === Number(form.totalMinutes));
  });

  const preview = $('#distribution-preview');
  const parts = ACTIVITIES.filter((a) => distributed[a.key]);
  if (!parts.length || totalSeconds <= 0) {
    preview.innerHTML = '<p class="muted small">Nenhuma atividade recebe tempo. Ative uma atividade e aumente a participação.</p>';
    return;
  }
  const bar = parts
    .map((a) => `<span style="width:${(distributed[a.key] / 1000 / totalSeconds) * 100}%;background:${DIST_COLORS[a.key] || '#999'}"></span>`)
    .join('');
  const legend = parts
    .map((a) => `<span><i style="background:${DIST_COLORS[a.key] || '#999'}"></i>${a.label} ${formatClock(distributed[a.key])}</span>`)
    .join('');
  preview.innerHTML = `
    <div class="dist-bar">${bar}</div>
    <div class="dist-legend">${legend}</div>
    <div class="dist-total">Total das atividades: ${formatClock(totalSeconds * 1000)} (pausas entre etapas não entram nesse total).</div>
  `;
}

/** Lê o formulário para um objeto de configurações (sem validar). */
function readForm() {
  const totalRaw = $('#opt-total-minutes').value;
  const result = {
    shuffle: $('#opt-shuffle').checked,
    pauses: { enabled: $('#opt-pauses').checked },
    durationMode: currentMode(),
    totalMinutes: totalRaw === '' ? NaN : Number(totalRaw)
  };
  document.querySelectorAll('[data-field]').forEach((input) => {
    const [group, field] = input.dataset.field.split('.');
    if (!result[group]) result[group] = {};
    if (input.type === 'checkbox') result[group][field] = input.checked;
    else result[group][field] = input.value === '' ? NaN : Number(input.value);
  });
  return result;
}

function updateCardStates() {
  document.querySelectorAll('.activity-card, .goal-card').forEach((card) => {
    const toggle = card.querySelector('input[type="checkbox"][data-field$=".enabled"]');
    card.classList.toggle('disabled', toggle && !toggle.checked);
  });
  $('#pause-range').style.opacity = $('#opt-pauses').checked ? '1' : '0.45';
  const totalMode = currentMode() === DURATION_MODES.TOTAL;
  $('#total-config').hidden = !totalMode;
  document.querySelectorAll('.mode-random').forEach((el) => { el.hidden = totalMode; });
  document.querySelectorAll('.mode-total').forEach((el) => { el.hidden = !totalMode; });
  if (totalMode) updateDistributionPreview();
}

function showErrors(errors) {
  const box = $('#form-errors');
  document.querySelectorAll('[data-field], #opt-total-minutes').forEach((input) => input.classList.remove('invalid'));
  if (!errors || !errors.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<ul>${errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('')}</ul>`;
  box.hidden = false;
  errors.forEach((e) => {
    const input = e.field === 'totalMinutes' ? $('#opt-total-minutes') : document.querySelector(`[data-field="${e.field}"]`);
    if (input) input.classList.add('invalid');
  });
}

async function saveSettingsFromForm({ silent = false } = {}) {
  const raw = readForm();
  const result = await storage.saveSettings(raw);
  if (!result.valid) {
    showErrors(result.errors);
    toast(result.errors[0].message, 'error');
    return false;
  }
  showErrors([]);
  state.settings = result.settings;
  fillForm();
  if (!silent) toast('Configurações salvas.', 'success');
  return true;
}

/** Mostra os valores sorteados da sessão atual nos cards. */
function renderDrawnValues() {
  const session = state.session;
  document.querySelectorAll('[data-drawn]').forEach((el) => {
    el.textContent = '—';
  });
  if (!session) return;
  session.steps.forEach((step) => {
    const el = document.querySelector(`[data-drawn="${step.key}"]`);
    if (el) el.textContent = formatClock(step.durationMs);
  });
  GOALS.forEach((goal) => {
    const g = session.goals[goal.key];
    const el = document.querySelector(`[data-drawn="${goal.key}"]`);
    if (el && g && g.enabled) el.textContent = `${g.target} ${goal.unit}`;
  });
}

/* ------------------------------------------------------------ */
/* Sessão: pronta / em execução / finalizada                    */
/* ------------------------------------------------------------ */

function renderReady(session) {
  $('#ready-total').textContent = formatDuration(session.totalEstimatedMs);
  $('#ready-mode').textContent =
    session.durationMode === DURATION_MODES.TOTAL
      ? `Tempo total escolhido: ${session.totalMinutes} min, dividido pelas participações.`
      : 'Durações sorteadas entre mínimo e máximo.';
  const list = $('#ready-steps');
  list.innerHTML = session.steps
    .map(
      (step) => `
      <li>
        <span>${escapeHtml(step.label)} — <strong>${formatClock(step.durationMs)}</strong></span>
        ${step.pauseAfterMs > 0 ? `<span class="pause">pausa ${formatClock(step.pauseAfterMs)}</span>` : ''}
      </li>`
    )
    .join('');
  $('#ready-goals').innerHTML = GOALS.filter((g) => session.goals[g.key] && session.goals[g.key].enabled)
    .map((g) => `<span>${g.label}: ${session.goals[g.key].target}</span>`)
    .join('');
}

/** Atualiza apenas cronômetros e barra de progresso (chamado a cada segundo). */
function renderLiveTimers(session) {
  const now = Date.now();
  const step = getCurrentStep(session);
  const next = getNextStep(session);
  const paused = session.status === SESSION_STATUS.PAUSED;
  const inPause = session.phase === PHASE.PAUSE;

  $('#live-step-counter').textContent = `Etapa ${Math.max(1, session.currentIndex + 1)} / ${session.steps.length}`;
  $('#live-total').textContent = formatDuration(session.totalEstimatedMs);

  if (inPause) {
    const remaining = pauseRemainingMs(session, now);
    $('#live-activity').textContent = 'PAUSA';
    $('#live-phase-label').textContent = next ? `Próxima atividade: ${next.label}` : 'Pausa';
    $('#live-drawn').textContent = formatClock(session.pauseDurationMs);
    $('#live-remaining').textContent = formatClock(remaining);
    $('#live-progress').style.width = `${progress(session.pauseDurationMs - remaining, session.pauseDurationMs) * 100}%`;
    $('#live-next').textContent = `Próxima atividade em: ${formatClock(remaining)}`;
    maybeRequestCheck(remaining, paused);
  } else if (step) {
    const remaining = stepRemainingMs(session, step, now);
    $('#live-activity').textContent = step.label.toUpperCase();
    $('#live-phase-label').textContent = paused ? 'Sessão pausada' : 'Em andamento';
    $('#live-drawn').textContent = formatClock(step.durationMs);
    $('#live-remaining').textContent = formatClock(remaining);
    $('#live-progress').style.width = `${progress(step.durationMs - remaining, step.durationMs) * 100}%`;
    $('#live-next').textContent = next
      ? `Próxima: ${next.label}${step.pauseAfterMs > 0 && session.pausesEnabled ? ` (após pausa de ${formatClock(step.pauseAfterMs)})` : ''}`
      : 'Última etapa da sessão';
    maybeRequestCheck(remaining, paused);
  }
}

/** Renderiza contadores de metas e botões (chamado quando a sessão muda). */
function renderLiveGoals(session) {
  const goalsBox = $('#live-goals');
  goalsBox.innerHTML = '';
  const activeGoals = GOALS.filter((g) => session.goals[g.key] && session.goals[g.key].enabled);
  if (!activeGoals.length) {
    goalsBox.innerHTML = '<p class="muted small">Nenhuma meta ativa nesta sessão.</p>';
  }
  activeGoals.forEach((goal) => {
    const g = session.goals[goal.key];
    const row = document.createElement('div');
    row.className = 'goal-row';
    row.innerHTML = `
      <div>
        <div class="goal-name">${goal.label}</div>
        <div class="goal-count">${g.done} / ${g.target}</div>
        ${g.done >= g.target ? `<div class="goal-done">${goal.doneMessage}</div>` : ''}
      </div>
      <button type="button" class="btn btn-secondary btn-small" data-goal="${goal.key}">${goal.buttonLabel}</button>
    `;
    goalsBox.appendChild(row);
  });

  const paused = session.status === SESSION_STATUS.PAUSED;
  $('#btn-pause').hidden = paused;
  $('#btn-resume').hidden = !paused;
}

function renderLive(session) {
  renderLiveTimers(session);
  renderLiveGoals(session);
}

function renderFinished(session) {
  const summary = session.summary;
  if (!summary) return;
  $('#summary-total').textContent = formatDuration(summary.totalMs);
  const rows = [];
  ACTIVITIES.forEach((activity) => {
    const ms = summary.activities[activity.key] || 0;
    if (session.steps.some((s) => s.key === activity.key)) {
      rows.push([activity.label, formatMinutesShort(ms)]);
    }
  });
  GOALS.forEach((goal) => {
    const g = summary.goals[goal.key];
    if (g && g.enabled) rows.push([goal.summaryLabel, `${g.done} / ${g.target}`]);
  });
  rows.push(['Etapas concluídas', `${summary.stepsCompleted} / ${summary.stepsTotal}`]);
  $('#summary-list').innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
}

function renderWarning(session) {
  const box = $('#session-warning');
  const reopen = $('#btn-reopen');
  const messages = {
    tabClosed: 'A aba da sessão foi fechada. O cronômetro continua; reabra a aba para seguir.',
    tabError: 'Não foi possível abrir a página do Facebook. Tente reabrir a aba.',
    login: 'Você não está autenticado no Facebook. Faça login na aba da sessão para continuar.'
  };
  if (!session || !session.warning || !messages[session.warning]) {
    box.hidden = true;
    return;
  }
  $('#session-warning-text').textContent = messages[session.warning];
  reopen.hidden = !(session.warning === 'tabClosed' || session.warning === 'tabError');
  box.hidden = false;
}

/**
 * Se o popup percebe que um prazo venceu e nada mudou, pede ao
 * service worker para verificar (garantia extra além dos alarmes).
 */
function maybeRequestCheck(remaining, paused) {
  if (paused || remaining > 0) return;
  const now = Date.now();
  if (now - state.lastZeroCheck < 3000) return;
  state.lastZeroCheck = now;
  send('session:check').catch(() => {});
}

/* ------------------------------------------------------------ */
/* Histórico                                                    */
/* ------------------------------------------------------------ */

function renderHistory() {
  const list = $('#history-list');
  $('#history-limit').textContent = HISTORY_LIMIT;
  if (!state.history.length) {
    list.innerHTML = '<p class="empty">Nenhuma sessão registrada ainda.</p>';
    return;
  }
  list.innerHTML = state.history
    .map((entry) => {
      const acts = ACTIVITIES.map((a) => {
        const ms = entry.activities ? entry.activities[a.key] || 0 : 0;
        return ms > 0 ? `${a.label} ${formatMinutesShort(ms)}` : null;
      })
        .filter(Boolean)
        .join(' · ');
      return `
        <div class="history-item">
          <div class="title">
            <span>${formatDate(entry.date)} · ${formatTime(entry.startedAt)}–${formatTime(entry.endedAt)}</span>
            <span>${formatDuration(entry.durationMs)}</span>
          </div>
          <div class="details">
            ${acts || 'Sem atividades registradas'}<br>
            Curtidas: ${entry.likes || 0} · Solicitações: ${entry.friends || 0}
          </div>
        </div>`;
    })
    .join('');
}

/* ------------------------------------------------------------ */
/* Render principal                                             */
/* ------------------------------------------------------------ */

function setStatus(status) {
  const dot = $('#status-dot');
  dot.className = `status-dot ${status}`;
  $('#status-label').textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
}

function render() {
  const session = state.session;
  const status = session ? session.status : SESSION_STATUS.IDLE;
  setStatus(status);
  renderDrawnValues();

  const showConfig = state.view === 'panel' && (!session || status === SESSION_STATUS.IDLE);
  const showSession = state.view === 'panel' && session && status !== SESSION_STATUS.IDLE;

  $('#view-config').hidden = !showConfig;
  $('#view-session').hidden = !showSession;
  $('#view-history').hidden = state.view !== 'history';

  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === state.view));

  if (showSession) {
    renderWarning(session);
    $('#session-ready').hidden = status !== SESSION_STATUS.READY;
    $('#session-live').hidden = !(status === SESSION_STATUS.RUNNING || status === SESSION_STATUS.PAUSED);
    $('#session-finished').hidden = status !== SESSION_STATUS.FINISHED;
    if (status === SESSION_STATUS.READY) renderReady(session);
    if (status === SESSION_STATUS.RUNNING || status === SESSION_STATUS.PAUSED) renderLive(session);
    if (status === SESSION_STATUS.FINISHED) renderFinished(session);
  }

  if (state.view === 'history') renderHistory();
}

/* ------------------------------------------------------------ */
/* Eventos                                                      */
/* ------------------------------------------------------------ */

function bindEvents() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      state.view = tab.dataset.view;
      if (state.view === 'history') state.history = await storage.getHistory();
      render();
    });
  });

  $('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  $('#view-config').addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"], input[name="duration-mode"]')) updateCardStates();
    if (event.target.matches('#opt-total-minutes')) updateDistributionPreview();
  });
  $('#view-config').addEventListener('input', (event) => {
    if (event.target.matches('input[type="range"], #opt-total-minutes')) updateDistributionPreview();
  });
  $('#total-presets').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-preset]');
    if (!chip) return;
    $('#opt-total-minutes').value = chip.dataset.preset;
    updateDistributionPreview();
  });

  $('#btn-save').addEventListener('click', () => saveSettingsFromForm());

  $('#btn-generate').addEventListener('click', async () => {
    const ok = await saveSettingsFromForm({ silent: true });
    if (!ok) return;
    await runCommand('session:generate', {}, 'Sessão gerada. Confira os valores sorteados.');
  });

  $('#btn-start').addEventListener('click', () => runCommand('session:start'));
  $('#btn-regenerate').addEventListener('click', () => runCommand('session:generate', {}, 'Nova sessão sorteada.'));
  $('#btn-discard').addEventListener('click', () => runCommand('session:discard'));
  $('#btn-pause').addEventListener('click', () => runCommand('session:pause'));
  $('#btn-resume').addEventListener('click', () => runCommand('session:resume'));
  $('#btn-skip').addEventListener('click', () => runCommand('session:skip'));
  $('#btn-finish').addEventListener('click', () => {
    if (confirm('Finalizar a sessão agora? O resumo será salvo no histórico.')) runCommand('session:stop');
  });
  $('#btn-reopen').addEventListener('click', () => runCommand('session:reopenTab'));
  $('#btn-new').addEventListener('click', () => runCommand('session:discard'));

  $('#live-goals').addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal]');
    if (button) runCommand('session:registerGoal', { goal: button.dataset.goal });
  });

  $('#btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Limpar todo o histórico?')) return;
    await storage.clearHistory();
    state.history = [];
    render();
    toast('Histórico limpo.', 'success');
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.SESSION]) {
      state.session = changes[STORAGE_KEYS.SESSION].newValue || null;
      render();
    }
    if (changes[STORAGE_KEYS.HISTORY]) {
      state.history = changes[STORAGE_KEYS.HISTORY].newValue || [];
      if (state.view === 'history') render();
    }
    if (changes[STORAGE_KEYS.PROFILES] || changes[STORAGE_KEYS.ACTIVE_PROFILE]) {
      await loadSettings();
      fillForm();
      render();
    }
  });

  // Cronômetros: recalculados a cada segundo a partir dos prazos.
  setInterval(() => {
    const s = state.session;
    if (s && (s.status === SESSION_STATUS.RUNNING || s.status === SESSION_STATUS.PAUSED) && state.view === 'panel') {
      renderLiveTimers(s);
    }
  }, 1000);
}

/* ------------------------------------------------------------ */
/* Inicialização                                                */
/* ------------------------------------------------------------ */

async function loadSettings() {
  state.settings = await storage.getSettings();
  const profiles = await storage.getProfiles();
  const activeId = await storage.getActiveProfileId();
  state.profileName = profiles[activeId] ? profiles[activeId].name : activeId;
  $('#profile-name').textContent = state.profileName;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function init() {
  await initLogger();
  document.title = APP_NAME;
  $('#app-name').textContent = APP_NAME;
  buildActivityCards();
  buildGoalCards();
  buildTotalPresets();
  bindEvents();
  try {
    await loadSettings();
    fillForm();
    state.session = await storage.getSession();
    state.history = await storage.getHistory();
    // Pede ao service worker uma verificação: acorda-o e sincroniza prazos.
    send('session:check')
      .then((session) => {
        if (session !== undefined) {
          state.session = session;
          render();
        }
      })
      .catch(() => {});
  } catch (err) {
    error('Falha ao carregar o painel', err);
    toast('Não foi possível carregar os dados. Tente reabrir o painel.', 'error');
  }
  render();
  log('Painel aberto');
}

document.addEventListener('DOMContentLoaded', init);
