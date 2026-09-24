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
  TOTAL_MINUTES_PRESETS,
  REPEAT_MODES,
  REPEAT_MINUTES_PRESETS,
  HOME_TIME_PRESETS,
  HOME_REPEAT_PRESETS
} from './utils/constants.js';
import * as storage from './utils/storage.js';
import { getCurrentStep, getNextStep, stepRemainingMs, pauseRemainingMs, distributeTotalMinutes } from './utils/session.js';
import { formatClock, formatDuration, formatDate, formatTime, formatMinutesShort, progress } from './utils/timer.js';
import { log, error, initLogger } from './utils/logger.js';
import { levelProgress, BADGES, missionStatus, statsSummary } from './utils/gamification.js';
import * as pageCreator from './utils/page-creator.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  settings: null,
  session: null,
  scheduler: null,
  progress: null,
  greeting: '',
  history: [],
  profileName: '',
  view: 'home',
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
        <div class="toggle-wrap">
          <div class="run-label">Executar: <strong data-run-label="${activity.key}">Sim</strong></div>
          <label class="switch" title="Executar esta atividade na sessão">
            <input type="checkbox" data-field="${activity.key}.enabled">
            <span></span>
          </label>
        </div>
      </div>
      <div class="range-row mode-random">
        <label><span>Tempo mínimo</span><input type="number" min="0" step="1" data-field="${activity.key}.min"></label>
        <label><span>Tempo máximo (0 = não executa)</span><input type="number" min="0" step="1" data-field="${activity.key}.max"></label>
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
  const repeatInput = document.querySelector(`input[name="repeat-mode"][value="${s.autoRepeat.mode}"]`);
  if (repeatInput) repeatInput.checked = true;
  updateCardStates();
}

function buildRepeatPresets() {
  const box = $('#repeat-presets');
  box.innerHTML = REPEAT_MINUTES_PRESETS.map(
    (m) => {
      const hours = Math.floor(m / 60);
      const rest = m % 60;
      const label = hours > 0 ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${m} min`;
      return `<button type="button" class="chip" data-repeat-preset="${m}">${label}</button>`;
    }
  ).join('');
}

function currentRepeatMode() {
  const checked = document.querySelector('input[name="repeat-mode"]:checked');
  return checked ? checked.value : REPEAT_MODES.FIXED;
}

function updateRepeatStates() {
  const enabled = $('#opt-repeat').checked;
  const fixed = currentRepeatMode() === REPEAT_MODES.FIXED;
  $('#repeat-label').textContent = enabled ? 'Sim' : 'Não';
  $('#opt-repeat').closest('.card').classList.toggle('disabled', !enabled);
  $('#repeat-fixed').hidden = !fixed;
  $('#repeat-random').hidden = fixed;
  const minutes = Number(document.querySelector('[data-field="autoRepeat.minutes"]').value);
  document.querySelectorAll('.chip[data-repeat-preset]').forEach((chip) => {
    chip.classList.toggle('active', Number(chip.dataset.repeatPreset) === minutes);
  });
}

function buildActivityChecklist() {
  const box = $('#activity-checklist');
  box.innerHTML = ACTIVITIES.map(
    (a) => `<label><input type="checkbox" data-run="${a.key}"><span>${a.label}</span></label>`
  ).join('');
}

/** Sincroniza a lista de seleção com os interruptores dos cards. */
function syncChecklist() {
  let count = 0;
  ACTIVITIES.forEach((a) => {
    const toggle = document.querySelector(`[data-field="${a.key}.enabled"]`);
    const check = document.querySelector(`[data-run="${a.key}"]`);
    const label = document.querySelector(`[data-run-label="${a.key}"]`);
    const enabled = Boolean(toggle && toggle.checked);
    if (check) check.checked = enabled;
    if (label) label.textContent = enabled ? 'Sim' : 'Não';
    if (enabled) count += 1;
  });
  $('#activity-count').textContent = `${count} de ${ACTIVITIES.length}`;
}

function buildTotalPresets() {
  const box = $('#total-presets');
  box.innerHTML = TOTAL_MINUTES_PRESETS.map((m) => `<button type="button" class="chip" data-preset="${m}">${m} min</button>`).join('');
}

function currentMode() {
  const checked = document.querySelector('input[name="duration-mode"]:checked');
  return checked ? checked.value : DURATION_MODES.RANDOM;
}

const DIST_COLORS = { feed: '#1877F2', reels: '#E1306C', videos: '#31A24C', lives: '#F7B928', games: '#8E44AD', messenger: '#00B2FF' };

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
    totalMinutes: totalRaw === '' ? NaN : Number(totalRaw),
    autoRepeat: { mode: currentRepeatMode() }
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
  syncChecklist();
  updateRepeatStates();
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
  try {
    state.scheduler = await send('scheduler:sync');
    renderScheduler();
  } catch (err) {
    error('Falha ao sincronizar repetição', err);
  }
  if (!silent) toast('Configurações salvas.', 'success');
  return true;
}

/* ------------------------------------------------------------ */
/* Painel simples (Início): fachada sobre o formulário de Ajustes  */
/* ------------------------------------------------------------ */

function buildHome() {
  $('#home-tiles').innerHTML = ACTIVITIES.map(
    (a) => `<button type="button" class="tile" data-tile="${a.key}" title="${escapeHtml(a.title)}">
      <span class="tile-check">✔</span><span class="tile-emoji">${a.emoji}</span><span>${a.label}</span></button>`
  ).join('');
  $('#home-time').innerHTML = HOME_TIME_PRESETS.map((m) => `<button type="button" class="chip" data-home-time="${m}">${m} min</button>`).join('')
    + '<button type="button" class="chip" data-home-time="random">🎲 Sortear</button>';
  $('#home-repeat').innerHTML = HOME_REPEAT_PRESETS.map((m) => {
    const label = m === 0 ? 'Não' : m >= 60 ? `A cada ${m / 60}h` : `A cada ${m} min`;
    return `<button type="button" class="chip" data-home-repeat="${m}">${label}</button>`;
  }).join('');
}

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🐯', '🦄', '🐸', '🤖', '👾', '🐨', '🦁', '🐙'];

/** Formata minutos acumulados: "45 min", "2h 05min", "0 min". */
function formatTotalMinutes(ms) {
  const minutes = Math.round(Math.max(0, ms || 0) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** Cartão de estatísticas acumuladas: minutos por atividade, total e dias. */
function renderStats() {
  const p = state.progress;
  if (!p) return;
  const stats = statsSummary(p);
  $('#stats-day').textContent = `Dia ${stats.daysCount}`;
  $('#stats-total').textContent = formatTotalMinutes(stats.totalMs);
  $('#stats-days').textContent = stats.daysCount;
  $('#stats-sessions').textContent = stats.sessions;
  $('#stats-activities').innerHTML = stats.activities
    .map(
      (a) => `<div class="stat-tile ${a.ms > 0 ? '' : 'empty'}" title="${escapeHtml(a.label)}">
        <div class="stat-emoji">${a.emoji}</div>
        <div class="stat-value">${formatTotalMinutes(a.ms)}</div>
        <div class="stat-label">${escapeHtml(a.label)}</div>
      </div>`
    )
    .join('');
  const parts = [];
  if (stats.firstDay) parts.push(`Começou em ${formatDate(new Date(`${stats.firstDay}T12:00:00`).getTime())}.`);
  if (stats.todayMs > 0) parts.push(`Hoje: ${formatTotalMinutes(stats.todayMs)}.`);
  if (stats.streak > 1) parts.push(`${stats.streak} dias seguidos (recorde ${stats.bestStreak}).`);
  parts.push(`👍 ${stats.likes} · 🤝 ${stats.friends} · 💬 ${stats.messages} registrados no total.`);
  $('#stats-note').textContent = parts.join(' ');
}

/** Cartão do jogador: nível, XP, sequência, medalhas e missões. */
function renderPlayer() {
  const p = state.progress;
  if (!p) return;
  renderStats();
  const lp = levelProgress(p.xp);
  $('#player-avatar').textContent = p.avatar || '🙂';
  $('#player-level').textContent = lp.level;
  $('#player-title').textContent = lp.title;
  $('#player-xp').textContent = lp.current;
  $('#player-xp-next').textContent = lp.needed;
  $('#player-xp-fill').style.width = `${lp.ratio * 100}%`;
  $('#player-streak').textContent = `🔥 ${p.streak}`;
  $('#player-streak').title = `${p.streak} dia(s) seguido(s) com sessão. Recorde: ${p.bestStreak}`;
  $('#player-badges').innerHTML = BADGES.map(
    (b) => `<span class="badge ${p.badges[b.id] ? '' : 'locked'}" title="${escapeHtml(b.name)}: ${escapeHtml(b.description)}">${b.emoji}</span>`
  ).join('');
  $('#player-missions').innerHTML = missionStatus(p, state.history).map(
    (m) => `<li class="mission ${m.done ? 'done' : ''}">
      <span>${m.done ? '✅' : m.emoji}</span>
      <span class="m-name">${escapeHtml(m.name)}</span>
      <span class="m-progress">${m.current}/${m.target} · +${m.xp} XP</span>
    </li>`
  ).join('');
}

function renderRewards(session) {
  const r = session.rewards;
  const xpBox = $('#reward-xp');
  const extras = $('#reward-extras');
  if (!r) {
    xpBox.textContent = '';
    extras.innerHTML = '';
    return;
  }
  xpBox.textContent = `+${r.xpGained} XP`;
  const lines = [];
  if (r.levelUp) lines.push(`<span class="reward-line level">⬆️ Subiu para o nível ${r.levelAfter}!</span>`);
  if (r.streak > 1) lines.push(`<span class="reward-line">🔥 ${r.streak} dias seguidos</span>`);
  (r.newBadges || []).forEach((b) => lines.push(`<span class="reward-line badge-new">${b.emoji} Nova medalha: ${escapeHtml(b.name)}</span>`));
  (r.missionsCompleted || []).forEach((m) => lines.push(`<span class="reward-line mission-done">${m.emoji} Missão: ${escapeHtml(m.name)}</span>`));
  extras.innerHTML = lines.join('');
}

/** Reflete o formulário de Ajustes nos controles do Início. */
function renderHome() {
  renderPlayer();
  const form = readForm();
  document.querySelectorAll('[data-tile]').forEach((tile) => {
    const cfg = form[tile.dataset.tile] || {};
    tile.classList.toggle('on', Boolean(cfg.enabled));
  });
  const totalMode = form.durationMode === DURATION_MODES.TOTAL;
  document.querySelectorAll('[data-home-time]').forEach((chip) => {
    const v = chip.dataset.homeTime;
    chip.classList.toggle('active', v === 'random' ? !totalMode : totalMode && Number(v) === Number(form.totalMinutes));
  });
  $('#home-time-note').textContent = totalMode
    ? `${form.totalMinutes || 0} minutos no total, divididos entre as atividades ligadas.`
    : 'Modo sorteio: cada atividade usa o tempo mínimo e máximo definidos em Ajustes.';
  const repeatOn = Boolean(form.autoRepeat && form.autoRepeat.enabled);
  const fixed = form.autoRepeat && form.autoRepeat.mode === REPEAT_MODES.FIXED;
  document.querySelectorAll('[data-home-repeat]').forEach((chip) => {
    const v = Number(chip.dataset.homeRepeat);
    chip.classList.toggle('active', v === 0 ? !repeatOn : repeatOn && fixed && v === Number(form.autoRepeat.minutes));
  });
}

async function applyHomeChange() {
  updateCardStates();
  const ok = await saveSettingsFromForm({ silent: true });
  renderHome();
  return ok;
}

async function startFromHome({ onlyPlan = false } = {}) {
  const ok = await saveSettingsFromForm({ silent: true });
  if (!ok) {
    state.view = 'settings';
    render();
    return;
  }
  if (state.busy) return;
  state.busy = true;
  try {
    let session = await send('session:generate');
    if (!onlyPlan) session = await send('session:start');
    state.session = session;
    render();
    toast(onlyPlan ? 'Plano pronto! Confira e clique em Começar.' : 'Vamos lá! A página do Facebook foi aberta.', 'success');
  } catch (err) {
    error('Falha ao iniciar pelo painel simples', err);
    toast(err.message, 'error');
  } finally {
    state.busy = false;
  }
}

/* ------------------------------------------------------------ */
/* Faixa da repetição automática                                */
/* ------------------------------------------------------------ */

function renderScheduler() {
  const banner = $('#scheduler-banner');
  const sch = state.scheduler;
  if (!sch || !sch.active) {
    banner.hidden = true;
    return;
  }
  const session = state.session;
  const live = session && (session.status === SESSION_STATUS.RUNNING || session.status === SESSION_STATUS.PAUSED);
  const detail = $('#scheduler-detail');
  if (live) {
    detail.textContent = `Sessão nº ${sch.runs + 1} em andamento. A próxima será agendada ao terminar.`;
    $('#btn-run-now').hidden = true;
  } else if (sch.nextRunAt) {
    const remaining = Math.max(0, sch.nextRunAt - Date.now());
    detail.textContent = `Próxima sessão em ${formatClock(remaining)} (intervalo de ${formatDuration(sch.intervalMs)}).`;
    $('#btn-run-now').hidden = false;
    if (remaining === 0) maybeRequestCheck(0, false);
  } else {
    detail.textContent = 'Aguardando o fim da sessão atual.';
    $('#btn-run-now').hidden = true;
  }
  banner.hidden = false;
}

/** Mostra os valores sorteados da sessão atual nos cards. */
function renderDrawnValues() {
  const session = state.session;
  document.querySelectorAll('[data-drawn]').forEach((el) => {
    el.textContent = '—';
    el.parentElement.classList.remove('skipped');
  });
  if (!session) return;
  ACTIVITIES.forEach((activity) => {
    const el = document.querySelector(`[data-drawn="${activity.key}"]`);
    if (!el) return;
    const step = session.steps.find((s) => s.key === activity.key);
    if (step) {
      el.textContent = formatClock(step.durationMs);
    } else {
      el.textContent = 'não executada';
      el.parentElement.classList.add('skipped');
    }
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

function activityEmoji(key) {
  const activity = ACTIVITIES.find((a) => a.key === key);
  return activity ? activity.emoji : '';
}

function activityInstruction(key) {
  const activity = ACTIVITIES.find((a) => a.key === key);
  return activity ? activity.instruction : '';
}

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
        <span>${activityEmoji(step.key)} ${escapeHtml(step.label)} — <strong>${formatClock(step.durationMs)}</strong></span>
        ${step.pauseAfterMs > 0 ? `<span class="pause">pausa ${formatClock(step.pauseAfterMs)}</span>` : ''}
      </li>`
    )
    .join('');
  $('#ready-goals').innerHTML = GOALS.filter((g) => session.goals[g.key] && session.goals[g.key].enabled)
    .map((g) => `<span>${g.emoji} ${g.label}: ${session.goals[g.key].target}</span>`)
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
    $('#live-emoji').textContent = '☕';
    $('#live-activity').textContent = 'PAUSA';
    $('#live-instruction').textContent = next ? `Descanse um pouco. Depois vem: ${next.emoji || activityEmoji(next.key)} ${next.label}.` : 'Descanse um pouco.';
    $('#live-phase-label').textContent = paused ? 'Pausado por você' : 'Falta';
    $('#live-drawn').textContent = formatClock(session.pauseDurationMs);
    $('#live-remaining').textContent = formatClock(remaining);
    $('#live-progress').style.width = `${progress(session.pauseDurationMs - remaining, session.pauseDurationMs) * 100}%`;
    $('#live-next').textContent = `Próxima atividade em ${formatClock(remaining)}`;
    maybeRequestCheck(remaining, paused);
  } else if (step) {
    const remaining = stepRemainingMs(session, step, now);
    $('#live-emoji').textContent = activityEmoji(step.key);
    $('#live-activity').textContent = step.label.toUpperCase();
    $('#live-instruction').textContent = activityInstruction(step.key);
    $('#live-phase-label').textContent = paused ? 'Pausado por você' : 'Falta';
    $('#live-drawn').textContent = formatClock(step.durationMs);
    $('#live-remaining').textContent = formatClock(remaining);
    $('#live-progress').style.width = `${progress(step.durationMs - remaining, step.durationMs) * 100}%`;
    $('#live-next').textContent = next
      ? `Depois: ${activityEmoji(next.key)} ${next.label}${step.pauseAfterMs > 0 && session.pausesEnabled ? ` (com pausa de ${formatClock(step.pauseAfterMs)})` : ''}`
      : 'Esta é a última atividade.';
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
    const done = g.done >= g.target;
    row.innerHTML = `
      <div>
        <div class="goal-name">${goal.emoji} ${goal.label}</div>
        <div class="goal-count">${g.done} / ${g.target}</div>
        ${done ? `<div class="goal-done">🎉 ${goal.doneMessage}</div>` : ''}
      </div>
      <button type="button" class="btn btn-secondary btn-small ${done ? 'done' : ''}" data-goal="${goal.key}">${goal.emoji} ${goal.bigButton}</button>
    `;
    goalsBox.appendChild(row);
    if (goal.suggest) {
      const box = document.createElement('div');
      box.className = 'suggestion';
      box.innerHTML = `
        <p class="suggestion-text" id="greeting-text">${state.greeting ? escapeHtml(state.greeting) : 'Toque em "Sortear saudação" para eu escolher uma mensagem para você.'}</p>
        <div class="suggestion-actions">
          <button type="button" class="btn btn-secondary btn-small" data-suggest>🎲 Sortear saudação</button>
          <button type="button" class="btn btn-primary btn-small" data-copy ${state.greeting ? '' : 'disabled'}>📋 Copiar</button>
        </div>
        <p class="muted small">Depois cole na conversa, envie e toque em "Mandei a mensagem!".</p>
      `;
      goalsBox.appendChild(box);
    }
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
      rows.push([`${activity.emoji} ${activity.label}`, formatMinutesShort(ms)]);
    }
  });
  GOALS.forEach((goal) => {
    const g = summary.goals[goal.key];
    if (g && g.enabled) rows.push([`${goal.emoji} ${goal.summaryLabel}`, `${g.done} / ${g.target}`]);
  });
  rows.push(['✅ Etapas concluídas', `${summary.stepsCompleted} / ${summary.stepsTotal}`]);
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
    list.innerHTML = '<p class="empty">Ainda não tem nada aqui. Faça sua primeira sessão! 🚀</p>';
    return;
  }
  list.innerHTML = state.history
    .map((entry) => {
      const acts = ACTIVITIES.map((a) => {
        const ms = entry.activities ? entry.activities[a.key] || 0 : 0;
        return ms > 0 ? `${a.emoji} ${a.label} ${formatMinutesShort(ms)}` : null;
      })
        .filter(Boolean)
        .join(' · ');
      return `
        <div class="history-item">
          <div class="title">
            <span>${formatDate(entry.date)} · ${formatTime(entry.startedAt)}–${formatTime(entry.endedAt)}${entry.auto ? '<span class="tag">automática</span>' : ''}</span>
            <span>${formatDuration(entry.durationMs)}</span>
          </div>
          <div class="details">
            ${acts || 'Sem atividades registradas'}<br>
            👍 ${entry.likes || 0} · 🤝 ${entry.friends || 0} · 💬 ${entry.messages || 0}
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
  renderScheduler();

  const showHome = state.view === 'home' && (!session || status === SESSION_STATUS.IDLE);
  const showSession = state.view === 'home' && session && status !== SESSION_STATUS.IDLE;
  const showConfig = state.view === 'settings';

  $('#view-home').hidden = !showHome;
  $('#view-config').hidden = !showConfig;
  $('#view-session').hidden = !showSession;
  $('#view-history').hidden = state.view !== 'history';

  if (showHome) renderHome();

  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === state.view));

  if (showSession) {
    renderWarning(session);
    $('#session-ready').hidden = status !== SESSION_STATUS.READY;
    $('#session-live').hidden = !(status === SESSION_STATUS.RUNNING || status === SESSION_STATUS.PAUSED);
    $('#session-finished').hidden = status !== SESSION_STATUS.FINISHED;
    if (status === SESSION_STATUS.READY) renderReady(session);
    if (status === SESSION_STATUS.RUNNING || status === SESSION_STATUS.PAUSED) renderLive(session);
    if (status === SESSION_STATUS.FINISHED) {
      renderFinished(session);
      renderRewards(session);
    }
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

  $('#home-tiles').addEventListener('click', (event) => {
    const tile = event.target.closest('[data-tile]');
    if (!tile) return;
    const toggle = document.querySelector(`[data-field="${tile.dataset.tile}.enabled"]`);
    if (!toggle) return;
    toggle.checked = !toggle.checked;
    tile.classList.toggle('on', toggle.checked);
    applyHomeChange();
  });
  $('#home-time').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-home-time]');
    if (!chip) return;
    const v = chip.dataset.homeTime;
    if (v === 'random') {
      document.querySelector('input[name="duration-mode"][value="random"]').checked = true;
    } else {
      document.querySelector('input[name="duration-mode"][value="total"]').checked = true;
      $('#opt-total-minutes').value = v;
    }
    applyHomeChange();
  });
  $('#home-repeat').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-home-repeat]');
    if (!chip) return;
    const minutes = Number(chip.dataset.homeRepeat);
    $('#opt-repeat').checked = minutes > 0;
    if (minutes > 0) {
      document.querySelector('input[name="repeat-mode"][value="fixed"]').checked = true;
      document.querySelector('[data-field="autoRepeat.minutes"]').value = minutes;
    }
    applyHomeChange();
  });
  $('#btn-go').addEventListener('click', () => startFromHome());
  $('#player-avatar').addEventListener('click', async () => {
    const current = state.progress ? state.progress.avatar : AVATARS[0];
    const next = AVATARS[(AVATARS.indexOf(current) + 1) % AVATARS.length];
    try {
      state.progress = await send('progress:setAvatar', { avatar: next });
      renderPlayer();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#btn-plan').addEventListener('click', () => startFromHome({ onlyPlan: true }));

  $('#view-config').addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"], input[name="duration-mode"]')) updateCardStates();
    if (event.target.matches('#opt-total-minutes')) updateDistributionPreview();
  });
  $('#view-config').addEventListener('input', (event) => {
    if (event.target.matches('input[type="range"], #opt-total-minutes')) updateDistributionPreview();
  });
  $('#activity-checklist').addEventListener('change', (event) => {
    const check = event.target.closest('[data-run]');
    if (!check) return;
    const toggle = document.querySelector(`[data-field="${check.dataset.run}.enabled"]`);
    if (toggle) toggle.checked = check.checked;
    updateCardStates();
  });
  $('#repeat-presets').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-repeat-preset]');
    if (!chip) return;
    document.querySelector('[data-field="autoRepeat.minutes"]').value = chip.dataset.repeatPreset;
    updateRepeatStates();
  });
  $('#view-config').addEventListener('change', (event) => {
    if (event.target.matches('input[name="repeat-mode"], #opt-repeat')) updateRepeatStates();
  });
  $('#view-config').addEventListener('input', (event) => {
    if (event.target.matches('[data-field="autoRepeat.minutes"]')) updateRepeatStates();
  });
  $('#btn-stop-repeat').addEventListener('click', async () => {
    try {
      state.scheduler = await send('scheduler:stop');
      renderScheduler();
      toast('Repetição automática parada.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#btn-run-now').addEventListener('click', () => runCommand('scheduler:runNow'));
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
    state.view = 'home';
    await runCommand('session:generate', {}, 'Plano pronto! Confira e clique em Começar.');
  });

  $('#btn-start').addEventListener('click', () => runCommand('session:start'));
  $('#btn-regenerate').addEventListener('click', () => runCommand('session:generate', {}, 'Sorteado de novo!'));
  $('#btn-discard').addEventListener('click', () => runCommand('session:discard'));
  $('#btn-pause').addEventListener('click', () => runCommand('session:pause'));
  $('#btn-resume').addEventListener('click', () => runCommand('session:resume'));
  $('#btn-skip').addEventListener('click', () => runCommand('session:skip'));
  $('#btn-finish').addEventListener('click', () => {
    if (confirm('Parar a sessão agora? O resumo vai para o histórico.')) runCommand('session:stop');
  });
  $('#btn-reopen').addEventListener('click', () => runCommand('session:reopenTab'));
  $('#btn-new').addEventListener('click', () => runCommand('session:discard'));

  $('#live-goals').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-goal]');
    if (button) {
      runCommand('session:registerGoal', { goal: button.dataset.goal });
      return;
    }
    if (event.target.closest('[data-suggest]')) {
      try {
        const result = await send('messages:suggest');
        state.greeting = result.text || '';
        $('#greeting-text').textContent = state.greeting;
        $('#live-goals').querySelector('[data-copy]').disabled = !state.greeting;
        await copyText(state.greeting);
        toast('Saudação copiada! Agora cole na conversa.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    if (event.target.closest('[data-copy]') && state.greeting) {
      await copyText(state.greeting);
      toast('Saudação copiada.', 'success');
    }
  });

  $('#btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Limpar todo o histórico?')) return;
    await storage.clearHistory();
    state.history = [];
    render();
    toast('Histórico limpo.', 'success');
  });

  // Handlers para criação de páginas
  $('#btn-start-pages').addEventListener('click', async () => {
    const quantity = parseInt($('#pages-quantity').value, 10) || 1;
    const useFile = $('#pages-use-file').checked;

    if (quantity < 1 || quantity > 100) {
      toast('Quantidade deve ser entre 1 e 100', 'error');
      return;
    }

    try {
      $('#btn-start-pages').hidden = true;
      $('#btn-stop-pages').hidden = false;
      const status = await pageCreator.startPageCreation(quantity, useFile);
      updatePageStatus(status);
      toast(`Iniciando criação de ${quantity} páginas...`, 'success');
    } catch (err) {
      toast(err.message || 'Erro ao iniciar criação', 'error');
      $('#btn-start-pages').hidden = false;
      $('#btn-stop-pages').hidden = true;
    }
  });

  $('#btn-stop-pages').addEventListener('click', async () => {
    try {
      await pageCreator.stopPageCreation();
      $('#btn-start-pages').hidden = false;
      $('#btn-stop-pages').hidden = true;
      toast('Parada solicitada', 'success');
    } catch (err) {
      toast(err.message || 'Erro ao parar', 'error');
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.SESSION]) {
      state.session = changes[STORAGE_KEYS.SESSION].newValue || null;
      render();
    }
    if (changes[STORAGE_KEYS.PROGRESS]) {
      state.progress = changes[STORAGE_KEYS.PROGRESS].newValue || null;
      if (state.view === 'home') renderPlayer();
    }
    if (changes[STORAGE_KEYS.SCHEDULER]) {
      state.scheduler = changes[STORAGE_KEYS.SCHEDULER].newValue || null;
      renderScheduler();
    }
    if (changes[STORAGE_KEYS.HISTORY]) {
      state.history = changes[STORAGE_KEYS.HISTORY].newValue || [];
      if (state.view === 'home') renderPlayer();
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
    if (s && (s.status === SESSION_STATUS.RUNNING || s.status === SESSION_STATUS.PAUSED) && state.view === 'home') {
      renderLiveTimers(s);
    }
    if (state.scheduler && state.scheduler.active) renderScheduler();
  }, 1000);
}

function updatePageStatus(status) {
  const statusBox = $('#pages-status');
  if (!statusBox) return;

  if (status && status.message) {
    statusBox.innerHTML = `<p>${escapeHtml(status.message)}</p>`;
    if (status.log) {
      const logBox = $('#pages-log');
      if (logBox) {
        logBox.hidden = false;
        logBox.textContent = status.log;
      }
    }
  }
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_err) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } finally {
      area.remove();
    }
  }
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
  buildActivityChecklist();
  buildTotalPresets();
  buildRepeatPresets();
  buildHome();
  bindEvents();
  try {
    await loadSettings();
    fillForm();
    state.session = await storage.getSession();
    state.scheduler = await storage.getScheduler();
    state.progress = await storage.getProgress();
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
