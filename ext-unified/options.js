/**
 * options.js
 * ------------------------------------------------------------
 * Página de opções: perfis, preferências, histórico e reset.
 */

import { APP_NAME, ACTIVITIES, HISTORY_LIMIT, STORAGE_KEYS } from './utils/constants.js';
import * as storage from './utils/storage.js';
import { formatDate, formatTime, formatDuration, formatMinutesShort } from './utils/timer.js';
import { log, error, initLogger } from './utils/logger.js';
import { GREETINGS } from './utils/messages.js';
import { levelProgress, BADGES, statsSummary } from './utils/gamification.js';

const $ = (selector) => document.querySelector(selector);

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

/* Perfis ----------------------------------------------------- */

async function renderProfiles() {
  const profiles = await storage.getProfiles();
  const activeId = await storage.getActiveProfileId();
  const select = $('#profile-select');
  select.innerHTML = Object.values(profiles)
    .map((p) => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');
  $('#profile-name').value = profiles[activeId] ? profiles[activeId].name : '';
}

/* Preferências ----------------------------------------------- */

async function renderPrefs() {
  const prefs = await storage.getPrefs();
  $('#pref-notifications').checked = prefs.notifications;
  $('#pref-overlay').checked = prefs.overlay;
  $('#pref-logs').checked = prefs.debugLogs;
  $('#greetings-count').textContent = GREETINGS.length;
  $('#custom-greetings').value = prefs.customGreetings.join('\n');
  $('#custom-greetings-count').textContent = `${prefs.customGreetings.length} personalizada(s)`;
}

async function saveGreetings() {
  const lines = $('#custom-greetings').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const prefs = await storage.savePrefs({ customGreetings: lines });
  $('#custom-greetings-count').textContent = `${prefs.customGreetings.length} personalizada(s)`;
  toast('Saudações salvas.', 'success');
}

async function savePrefsFromForm() {
  await storage.savePrefs({
    notifications: $('#pref-notifications').checked,
    overlay: $('#pref-overlay').checked,
    debugLogs: $('#pref-logs').checked
  });
  toast('Preferências salvas.', 'success');
}

/* Progresso do jogo ------------------------------------------ */

async function renderProgress() {
  const p = await storage.getProgress();
  const lp = levelProgress(p.xp);
  const badges = Object.keys(p.badges).length;
  const stats = statsSummary(p);
  const perActivity = stats.activities.filter((a) => a.ms > 0).map((a) => `${a.emoji} ${a.label} ${formatDuration(a.ms)}`).join(' · ');
  $('#progress-summary').textContent = `${p.avatar} Nível ${lp.level} (${lp.title}) · ${p.xp} XP · ${p.sessions} sessões · dia ${stats.daysCount} (${stats.daysCount} dia(s) com sessão) · sequência ${p.streak} dia(s), recorde ${p.bestStreak} · ${badges}/${BADGES.length} medalhas · total ${formatDuration(stats.totalMs)}${perActivity ? ` (${perActivity})` : ''}.`;
}

/* Histórico -------------------------------------------------- */

async function renderHistory() {
  const history = await storage.getHistory();
  const tbody = $('#history-table tbody');
  $('#history-limit').textContent = HISTORY_LIMIT;
  $('#history-empty').hidden = history.length > 0;
  $('#history-table').hidden = history.length === 0;
  tbody.innerHTML = history
    .map((entry) => {
      const cells = ACTIVITIES.map((a) => {
        const ms = entry.activities ? entry.activities[a.key] || 0 : 0;
        return `<td>${ms > 0 ? formatMinutesShort(ms) : '—'}</td>`;
      }).join('');
      return `
        <tr>
          <td>${formatDate(entry.date)}${entry.auto ? ' <span class="tag">auto</span>' : ''}</td>
          <td>${formatTime(entry.startedAt)}</td>
          <td>${formatTime(entry.endedAt)}</td>
          <td>${formatDuration(entry.durationMs)}</td>
          ${cells}
          <td>${entry.likes || 0}</td>
          <td>${entry.friends || 0}</td>
          <td>${entry.messages || 0}</td>
        </tr>`;
    })
    .join('');
}

/* Eventos ---------------------------------------------------- */

function bindEvents() {
  $('#profile-select').addEventListener('change', async (event) => {
    try {
      await storage.setActiveProfile(event.target.value);
      await renderProfiles();
      toast('Perfil ativo alterado.', 'success');
    } catch (err) {
      error(err);
      toast(err.message, 'error');
    }
  });

  $('#btn-rename').addEventListener('click', async () => {
    try {
      const id = $('#profile-select').value;
      await storage.renameProfile(id, $('#profile-name').value);
      await renderProfiles();
      toast('Perfil renomeado.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#btn-reset-profile').addEventListener('click', async () => {
    if (!confirm('Restaurar os intervalos padrão deste perfil?')) return;
    await storage.resetProfileSettings($('#profile-select').value);
    toast('Configurações do perfil restauradas.', 'success');
  });

  $('#btn-save-greetings').addEventListener('click', saveGreetings);

  ['#pref-notifications', '#pref-overlay', '#pref-logs'].forEach((selector) => {
    $(selector).addEventListener('change', savePrefsFromForm);
  });

  $('#btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Limpar todo o histórico?')) return;
    await storage.clearHistory();
    await renderHistory();
    toast('Histórico limpo.', 'success');
  });

  $('#btn-reset-progress').addEventListener('click', async () => {
    if (!confirm('Zerar XP, nível, sequência e medalhas? O histórico de sessões é mantido.')) return;
    await storage.resetProgress();
    await renderProgress();
    toast('Progresso do jogo zerado.', 'success');
  });

  $('#btn-reset-all').addEventListener('click', async () => {
    if (!confirm('Apagar TODOS os dados da extensão? Esta ação não pode ser desfeita.')) return;
    await storage.resetAll();
    await Promise.all([renderProfiles(), renderPrefs(), renderHistory(), renderProgress()]);
    toast('Dados restaurados para o padrão.', 'success');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.HISTORY]) renderHistory();
    if (changes[STORAGE_KEYS.PROGRESS]) renderProgress();
    if (changes[STORAGE_KEYS.PROFILES] || changes[STORAGE_KEYS.ACTIVE_PROFILE]) renderProfiles();
  });
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  await initLogger();
  document.title = `Opções · ${APP_NAME}`;
  $('#app-name').textContent = APP_NAME;
  bindEvents();
  try {
    await Promise.all([renderProfiles(), renderPrefs(), renderHistory(), renderProgress()]);
  } catch (err) {
    error('Falha ao carregar opções', err);
    toast('Não foi possível carregar as opções.', 'error');
  }
  log('Página de opções aberta');
}

document.addEventListener('DOMContentLoaded', init);
