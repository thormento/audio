/**
 * background.js (service worker - Manifest V3)
 * ------------------------------------------------------------
 * Responsável por:
 *  - controlar a sessão (gerar, iniciar, pausar, continuar, pular, finalizar);
 *  - controlar as etapas e as pausas entre elas;
 *  - criar/limpar alarmes (chrome.alarms) e um alarme de vigilância;
 *  - salvar o estado em chrome.storage.local a cada mudança;
 *  - abrir as páginas do Facebook na aba da sessão;
 *  - enviar notificações;
 *  - restaurar a sessão quando o navegador reinicia.
 *
 * Os cronômetros são baseados em timestamps absolutos. O popup e o
 * content script apenas leem a sessão do storage e recalculam o tempo
 * restante; nunca dependem de estar abertos para a sessão avançar.
 */

import {
  ALARMS,
  WATCHDOG_PERIOD_MINUTES,
  SESSION_STATUS,
  PHASE,
  STEP_STATUS,
  GOALS,
  APP_NAME,
  REPEAT_MODES,
  REPEAT_CATCHUP_MS
} from './utils/constants.js';
import * as storage from './utils/storage.js';
import {
  buildSession,
  getCurrentStep,
  getNextStep,
  computeSummary,
  summaryToHistoryEntry
} from './utils/session.js';
import { formatClock, formatDuration, minutesToMs } from './utils/timer.js';
import { randomBetween } from './utils/random.js';
import { randomGreeting } from './utils/messages.js';
import { log, warn, error, initLogger } from './utils/logger.js';

initLogger();

/* ------------------------------------------------------------ */
/* Fila de mutações: evita que dois eventos alterem a sessão     */
/* ao mesmo tempo (ex.: alarme + clique no popup).               */
/* ------------------------------------------------------------ */

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Carrega a sessão, aplica o mutador e salva o resultado.
 * O mutador pode retornar:
 *  - um objeto de sessão  -> salvo;
 *  - null                 -> sessão apagada;
 *  - undefined            -> nada é salvo.
 */
function mutateSession(mutator) {
  return enqueue(async () => {
    const current = await storage.getSession();
    const updated = await mutator(current);
    if (updated === undefined) return current;
    await storage.saveSession(updated);
    return updated;
  });
}

/* ------------------------------------------------------------ */
/* Notificações                                                 */
/* ------------------------------------------------------------ */

async function notify(title, message) {
  try {
    const prefs = await storage.getPrefs();
    if (!prefs.notifications) return;
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `${APP_NAME} · ${title}`,
      message,
      priority: 1
    });
  } catch (err) {
    warn('Não foi possível exibir notificação', err);
  }
}

/* ------------------------------------------------------------ */
/* Alarmes                                                      */
/* ------------------------------------------------------------ */

const localTimers = new Set();

async function scheduleAlarm(name, when) {
  try {
    await chrome.alarms.clear(name);
    await chrome.alarms.create(name, { when: Math.max(when, Date.now() + 250) });
  } catch (err) {
    error('Falha ao criar alarme', name, err);
  }
  // Complemento: enquanto o service worker estiver vivo, um timer local
  // garante precisão em prazos curtos (o alarme continua como garantia).
  const delay = Math.max(0, when - Date.now()) + 50;
  const handle = setTimeout(() => {
    localTimers.delete(handle);
    checkDeadlines().catch((err) => error('Falha na verificação local', err));
  }, delay);
  localTimers.add(handle);
}

async function clearStepAlarms() {
  localTimers.forEach((handle) => clearTimeout(handle));
  localTimers.clear();
  try {
    await chrome.alarms.clear(ALARMS.STEP_END);
    await chrome.alarms.clear(ALARMS.PAUSE_END);
  } catch (err) {
    warn('Falha ao limpar alarmes', err);
  }
}

async function startWatchdog() {
  try {
    const existing = await chrome.alarms.get(ALARMS.WATCHDOG);
    if (!existing) {
      await chrome.alarms.create(ALARMS.WATCHDOG, { periodInMinutes: WATCHDOG_PERIOD_MINUTES });
    }
  } catch (err) {
    warn('Falha ao criar alarme de vigilância', err);
  }
}

async function stopWatchdog() {
  try {
    await chrome.alarms.clear(ALARMS.WATCHDOG);
  } catch (err) {
    warn('Falha ao limpar alarme de vigilância', err);
  }
}

/* ------------------------------------------------------------ */
/* Abas                                                         */
/* ------------------------------------------------------------ */

async function tabExists(tabId) {
  if (typeof tabId !== 'number') return false;
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Abre a URL na aba da sessão (reutiliza a aba se ainda existir).
 * Retorna o id da aba usada ou null se falhar.
 */
async function openInSessionTab(session, url) {
  try {
    if (await tabExists(session.tabId)) {
      const tab = await chrome.tabs.update(session.tabId, { url, active: true });
      if (tab && typeof tab.windowId === 'number') {
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
      return tab.id;
    }
    const tab = await chrome.tabs.create({ url, active: true });
    return tab.id;
  } catch (err) {
    error('Falha ao abrir a página da atividade', err);
    return null;
  }
}

/* ------------------------------------------------------------ */
/* Máquina de estados da sessão                                 */
/* ------------------------------------------------------------ */

function assertSession(session) {
  if (!session) throw new Error('Nenhuma sessão encontrada. Gere uma nova sessão.');
  return session;
}

/** Inicia a etapa de índice "index". */
async function beginStep(session, index) {
  const step = session.steps[index];
  if (!step) return finishSession(session);

  const now = Date.now();
  session.currentIndex = index;
  session.phase = PHASE.ACTIVITY;
  session.pauseDeadline = null;
  session.pauseRemainingMs = 0;
  session.pauseDurationMs = 0;

  step.status = STEP_STATUS.RUNNING;
  step.startedAt = step.startedAt || now;
  step.segmentStart = now;
  step.remainingMs = Math.max(0, step.durationMs - step.elapsedMs);
  step.deadline = now + step.remainingMs;

  const tabId = await openInSessionTab(session, step.url);
  if (tabId !== null) {
    session.tabId = tabId;
    if (session.warning === 'tabClosed') session.warning = null;
  } else {
    session.warning = 'tabError';
  }

  await scheduleAlarm(ALARMS.STEP_END, step.deadline);
  await startWatchdog();

  log(`Etapa ${step.label} iniciada (${formatClock(step.durationMs)})`);
  notify(`${step.label} iniciado`, `Tempo sorteado: ${formatClock(step.durationMs)}.`);
  return session;
}

/** Conclui a etapa atual (por tempo esgotado ou pulo). */
async function completeStep(session, { skipped = false } = {}) {
  const step = getCurrentStep(session);
  const now = Date.now();

  if (step && step.status === STEP_STATUS.RUNNING) {
    if (step.segmentStart) step.elapsedMs += Math.max(0, now - step.segmentStart);
    step.elapsedMs = Math.min(step.elapsedMs, step.durationMs);
    step.segmentStart = null;
    step.deadline = null;
    step.remainingMs = 0;
    step.endedAt = now;
    step.status = skipped ? STEP_STATUS.SKIPPED : STEP_STATUS.DONE;
    log(`Etapa ${step.label} ${skipped ? 'pulada' : 'concluída'}`);
  }

  await clearStepAlarms();

  const next = getNextStep(session);
  if (!next) return finishSession(session);

  if (session.pausesEnabled && step && step.pauseAfterMs > 0 && !skipped) {
    session.phase = PHASE.PAUSE;
    session.pauseDurationMs = step.pauseAfterMs;
    session.pauseDeadline = now + step.pauseAfterMs;
    session.pauseRemainingMs = step.pauseAfterMs;
    await scheduleAlarm(ALARMS.PAUSE_END, session.pauseDeadline);
    notify(`${step.label} concluído`, `Próxima atividade (${next.label}) em ${formatClock(step.pauseAfterMs)}.`);
    log(`Pausa de ${formatClock(step.pauseAfterMs)} antes de ${next.label}`);
    return session;
  }

  if (step && !skipped) notify(`${step.label} concluído`, 'A próxima atividade está pronta.');
  return beginStep(session, session.currentIndex + 1);
}

/** Encerra a sessão, gera o resumo e grava no histórico. */
async function finishSession(session) {
  const now = Date.now();
  const step = getCurrentStep(session);
  if (step && step.status === STEP_STATUS.RUNNING) {
    if (session.status === SESSION_STATUS.RUNNING && step.segmentStart) {
      step.elapsedMs += Math.max(0, now - step.segmentStart);
    }
    step.elapsedMs = Math.min(step.elapsedMs, step.durationMs);
    step.segmentStart = null;
    step.deadline = null;
    step.endedAt = now;
    step.status = step.elapsedMs >= step.durationMs ? STEP_STATUS.DONE : STEP_STATUS.SKIPPED;
  }

  session.status = SESSION_STATUS.FINISHED;
  session.phase = PHASE.NONE;
  session.endedAt = now;
  session.pauseDeadline = null;
  session.pauseRemainingMs = 0;
  session.warning = null;

  const summary = computeSummary(session);
  session.summary = summary;

  await clearStepAlarms();
  await stopWatchdog();
  try {
    await storage.addHistoryEntry(summaryToHistoryEntry(session, summary));
  } catch (err) {
    error('Falha ao gravar histórico', err);
  }

  log(`Sessão finalizada. Duração total: ${formatDuration(summary.totalMs)}`);
  notify('Sessão concluída', `Duração total: ${formatDuration(summary.totalMs)}.`);
  await armScheduler();
  return session;
}

/* ------------------------------------------------------------ */
/* Repetição automática                                         */
/* ------------------------------------------------------------ */

/** Sorteia/define o intervalo de espera conforme as configurações. */
function drawRepeatIntervalMs(settings) {
  const r = settings.autoRepeat;
  const minutes = r.mode === REPEAT_MODES.RANDOM ? randomBetween(r.min, r.max) : r.minutes;
  return minutesToMs(Math.max(1, minutes));
}

/**
 * Chamado ao fim de cada sessão. Se a repetição estiver ativa e
 * habilitada nas configurações, agenda a próxima sessão automática.
 */
async function armScheduler() {
  const scheduler = await storage.getScheduler();
  if (!scheduler.active) return;
  const settings = await storage.getSettings();
  if (!settings.autoRepeat.enabled) {
    await stopScheduler('desabilitada nas configurações');
    return;
  }
  const intervalMs = drawRepeatIntervalMs(settings);
  scheduler.intervalMs = intervalMs;
  scheduler.nextRunAt = Date.now() + intervalMs;
  scheduler.profileId = await storage.getActiveProfileId();
  await storage.saveScheduler(scheduler);
  await scheduleAlarm(ALARMS.AUTO_NEXT, scheduler.nextRunAt);
  log(`Próxima sessão automática em ${formatDuration(intervalMs)}`);
  notify('Repetição automática', `Próxima sessão em ${formatDuration(intervalMs)}.`);
}

async function stopScheduler(reason) {
  const scheduler = await storage.getScheduler();
  scheduler.active = false;
  scheduler.nextRunAt = null;
  await storage.saveScheduler(scheduler);
  try {
    await chrome.alarms.clear(ALARMS.AUTO_NEXT);
  } catch (err) {
    warn('Falha ao limpar alarme de repetição', err);
  }
  log(`Repetição automática parada${reason ? ` (${reason})` : ''}`);
  return scheduler;
}

/**
 * Sincroniza o agendador com as configurações: ativa quando há sessão em
 * andamento e a repetição está habilitada; desativa se foi desabilitada.
 */
async function syncScheduler() {
  const settings = await storage.getSettings();
  const scheduler = await storage.getScheduler();
  if (!settings.autoRepeat.enabled) {
    if (scheduler.active) await stopScheduler('desabilitada nas configurações');
    return storage.getScheduler();
  }
  const session = await storage.getSession();
  const live = session && (session.status === SESSION_STATUS.RUNNING || session.status === SESSION_STATUS.PAUSED);
  if (live && !scheduler.active) {
    scheduler.active = true;
    scheduler.nextRunAt = null;
    scheduler.profileId = await storage.getActiveProfileId();
    await storage.saveScheduler(scheduler);
    log('Repetição automática ativada');
  }
  return storage.getScheduler();
}

/**
 * Gera e inicia uma sessão automaticamente. Ignorado se houver sessão
 * em andamento (a próxima será agendada quando ela terminar).
 */
async function runAutoSession() {
  return mutateSession(async (current) => {
    const scheduler = await storage.getScheduler();
    if (!scheduler.active) return undefined;
    if (current && (current.status === SESSION_STATUS.RUNNING || current.status === SESSION_STATUS.PAUSED)) {
      log('Repetição: já existe sessão em andamento, aguardando terminar.');
      return undefined;
    }
    const settings = await storage.getSettings();
    if (!settings.autoRepeat.enabled) {
      await stopScheduler('desabilitada nas configurações');
      return undefined;
    }
    const validation = storage.validateSettings(settings);
    if (!validation.valid) {
      await stopScheduler('configurações inválidas');
      notify('Repetição automática parada', validation.errors[0].message);
      return undefined;
    }
    const profileId = await storage.getActiveProfileId();
    const session = buildSession(validation.settings, profileId);
    session.status = SESSION_STATUS.RUNNING;
    session.startedAt = Date.now();
    session.autoStarted = true;

    scheduler.runs += 1;
    scheduler.nextRunAt = null;
    await storage.saveScheduler(scheduler);
    try {
      await chrome.alarms.clear(ALARMS.AUTO_NEXT);
    } catch (_err) {
      // ignorado
    }

    log(`Sessão automática #${scheduler.runs} iniciada:`, session.steps.map((s) => `${s.label} ${formatClock(s.durationMs)}`).join(', '));
    notify('Sessão automática iniciada', `Sessão nº ${scheduler.runs} da repetição. Duração estimada: ${formatDuration(session.totalEstimatedMs)}.`);
    return beginStep(session, 0);
  });
}

/** Dispara a sessão automática se o horário agendado já passou. */
async function checkScheduler() {
  const scheduler = await storage.getScheduler();
  if (!scheduler.active || !scheduler.nextRunAt) return;
  if (Date.now() >= scheduler.nextRunAt - 200) {
    await runAutoSession();
    return;
  }
  const alarm = await chrome.alarms.get(ALARMS.AUTO_NEXT).catch(() => null);
  if (!alarm) await scheduleAlarm(ALARMS.AUTO_NEXT, scheduler.nextRunAt);
}

/**
 * Verifica se algum prazo venceu (etapa ou pausa) e avança a sessão.
 * Chamado por alarmes, timers locais, pelo popup e na restauração.
 */
async function checkDeadlines() {
  await checkScheduler();
  return mutateSession(async (session) => {
    if (!session || session.status !== SESSION_STATUS.RUNNING) return undefined;
    const now = Date.now();

    if (session.phase === PHASE.ACTIVITY) {
      const step = getCurrentStep(session);
      if (!step) return finishSession(session);
      if (step.deadline && now >= step.deadline - 200) {
        return completeStep(session);
      }
      // Prazo ainda não venceu: garante que o alarme exista.
      const alarm = await chrome.alarms.get(ALARMS.STEP_END).catch(() => null);
      if (!alarm) await scheduleAlarm(ALARMS.STEP_END, step.deadline);
      return undefined;
    }

    if (session.phase === PHASE.PAUSE) {
      if (!session.pauseDeadline || now >= session.pauseDeadline - 200) {
        const next = getNextStep(session);
        if (!next) return finishSession(session);
        return beginStep(session, session.currentIndex + 1);
      }
      const alarm = await chrome.alarms.get(ALARMS.PAUSE_END).catch(() => null);
      if (!alarm) await scheduleAlarm(ALARMS.PAUSE_END, session.pauseDeadline);
      return undefined;
    }

    return undefined;
  });
}

/* ------------------------------------------------------------ */
/* Comandos vindos do popup / content script                    */
/* ------------------------------------------------------------ */

async function generateSession() {
  return mutateSession(async (current) => {
    if (current && (current.status === SESSION_STATUS.RUNNING || current.status === SESSION_STATUS.PAUSED)) {
      throw new Error('Já existe uma sessão em andamento. Finalize antes de gerar outra.');
    }
    const settings = await storage.getSettings();
    const validation = storage.validateSettings(settings);
    if (!validation.valid) throw new Error(validation.errors[0].message);
    const profileId = await storage.getActiveProfileId();
    const session = buildSession(validation.settings, profileId);
    log('Nova sessão gerada:', session.steps.map((s) => `${s.label} ${formatClock(s.durationMs)}`).join(', '));
    return session;
  });
}

async function startSession() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status === SESSION_STATUS.RUNNING) return session;
    if (session.status !== SESSION_STATUS.READY) {
      throw new Error('A sessão atual não pode ser iniciada. Gere uma nova sessão.');
    }
    session.status = SESSION_STATUS.RUNNING;
    session.startedAt = Date.now();
    log('Sessão iniciada');
    const started = await beginStep(session, 0);
    await storage.saveSession(started);
    await syncScheduler();
    return started;
  });
}

async function pauseSession() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status !== SESSION_STATUS.RUNNING) return session;
    const now = Date.now();

    if (session.phase === PHASE.ACTIVITY) {
      const step = getCurrentStep(session);
      if (step && step.segmentStart) {
        step.elapsedMs += Math.max(0, now - step.segmentStart);
        step.elapsedMs = Math.min(step.elapsedMs, step.durationMs);
      }
      if (step) {
        step.segmentStart = null;
        step.remainingMs = Math.max(0, step.durationMs - step.elapsedMs);
        step.deadline = null;
      }
    } else if (session.phase === PHASE.PAUSE) {
      session.pauseRemainingMs = Math.max(0, (session.pauseDeadline || now) - now);
      session.pauseDeadline = null;
    }

    session.status = SESSION_STATUS.PAUSED;
    session.pausedAt = now;
    await clearStepAlarms();
    await stopWatchdog();
    log('Sessão pausada');
    return session;
  });
}

async function resumeSession() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status !== SESSION_STATUS.PAUSED) return session;
    const now = Date.now();
    session.status = SESSION_STATUS.RUNNING;
    session.pausedAt = null;

    if (session.phase === PHASE.ACTIVITY) {
      const step = getCurrentStep(session);
      if (!step) return finishSession(session);
      step.segmentStart = now;
      step.deadline = now + Math.max(0, step.remainingMs);
      await scheduleAlarm(ALARMS.STEP_END, step.deadline);
    } else if (session.phase === PHASE.PAUSE) {
      session.pauseDeadline = now + Math.max(0, session.pauseRemainingMs);
      await scheduleAlarm(ALARMS.PAUSE_END, session.pauseDeadline);
    } else {
      return beginStep(session, Math.max(0, session.currentIndex));
    }

    await startWatchdog();
    log('Sessão retomada');
    return session;
  });
}

async function skipStep() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status !== SESSION_STATUS.RUNNING && session.status !== SESSION_STATUS.PAUSED) {
      throw new Error('Não há etapa em andamento para pular.');
    }
    const wasPaused = session.status === SESSION_STATUS.PAUSED;
    session.status = SESSION_STATUS.RUNNING;
    session.pausedAt = null;

    if (session.phase === PHASE.PAUSE) {
      await clearStepAlarms();
      const next = getNextStep(session);
      if (!next) return finishSession(session);
      log('Pausa pulada');
      return beginStep(session, session.currentIndex + 1);
    }

    // Se estava pausada, o tempo decorrido já foi somado (segmentStart = null);
    // se estava em execução, completeStep soma o segmento atual.
    if (wasPaused) {
      const step = getCurrentStep(session);
      if (step) step.segmentStart = null;
    }
    return completeStep(session, { skipped: true });
  });
}

async function stopSession() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status === SESSION_STATUS.READY) {
      log('Sessão descartada antes de iniciar');
      return null;
    }
    if (session.status === SESSION_STATUS.FINISHED) return session;
    if (!session.startedAt) session.startedAt = Date.now();
    return finishSession(session);
  });
}

async function discardSession() {
  return mutateSession(async (current) => {
    if (!current) return null;
    if (current.status === SESSION_STATUS.RUNNING || current.status === SESSION_STATUS.PAUSED) {
      throw new Error('Finalize a sessão antes de descartá-la.');
    }
    await clearStepAlarms();
    await stopWatchdog();
    log('Sessão descartada');
    return null;
  });
}

async function registerGoal(goalKey) {
  const goalDef = GOALS.find((g) => g.key === goalKey);
  if (!goalDef) throw new Error('Meta desconhecida.');
  return mutateSession(async (current) => {
    const session = assertSession(current);
    if (session.status !== SESSION_STATUS.RUNNING && session.status !== SESSION_STATUS.PAUSED) {
      throw new Error('Inicie a sessão para registrar metas.');
    }
    const goal = session.goals[goalKey];
    if (!goal || !goal.enabled) throw new Error('Esta meta não está ativa nesta sessão.');
    goal.done += 1;
    log(`${goalDef.label} registrada: ${goal.done}/${goal.target}`);
    if (goal.done >= goal.target && !goal.completedNotified) {
      goal.completedNotified = true;
      notify(goalDef.label, goalDef.doneMessage);
    }
    return session;
  });
}

async function reopenTab() {
  return mutateSession(async (current) => {
    const session = assertSession(current);
    const step = getCurrentStep(session);
    if (!step) throw new Error('Nenhuma atividade em andamento.');
    const tabId = await openInSessionTab(session, step.url);
    if (tabId === null) throw new Error('Não foi possível abrir a aba do Facebook.');
    session.tabId = tabId;
    if (session.warning === 'tabClosed' || session.warning === 'tabError') session.warning = null;
    log('Aba da sessão reaberta');
    return session;
  });
}

async function flagLoginRequired(tabId) {
  return mutateSession(async (current) => {
    if (!current) return undefined;
    if (typeof tabId === 'number' && current.tabId !== null && current.tabId !== tabId) return undefined;
    if (current.status !== SESSION_STATUS.RUNNING && current.status !== SESSION_STATUS.PAUSED) return undefined;
    if (current.warning === 'login') return undefined;
    current.warning = 'login';
    warn('Usuário não autenticado no Facebook');
    notify('Login necessário', 'Entre na sua conta do Facebook para continuar a sessão.');
    return current;
  });
}

async function clearLoginWarning(tabId) {
  return mutateSession(async (current) => {
    if (!current || current.warning !== 'login') return undefined;
    if (typeof tabId === 'number' && current.tabId !== null && current.tabId !== tabId) return undefined;
    current.warning = null;
    return current;
  });
}

/* ------------------------------------------------------------ */
/* Restauração                                                  */
/* ------------------------------------------------------------ */

async function restoreScheduler(reason) {
  const scheduler = await storage.getScheduler();
  if (!scheduler.active || !scheduler.nextRunAt) return;
  const now = Date.now();
  if (scheduler.nextRunAt <= now - 2 * REPEAT_CATCHUP_MS) {
    // O horário passou há mais de dois minutos (navegador fechado): dá um
    // minuto para o usuário perceber (e parar, se quiser) antes de iniciar.
    // Atrasos pequenos (service worker acordando) disparam imediatamente.
    scheduler.nextRunAt = now + REPEAT_CATCHUP_MS;
    await storage.saveScheduler(scheduler);
    log(`Repetição vencida durante ${reason}; próxima sessão em 1 minuto.`);
  }
  await scheduleAlarm(ALARMS.AUTO_NEXT, scheduler.nextRunAt);
}

async function restoreSession(reason) {
  await storage.ensureInitialized();
  await restoreScheduler(reason);
  const session = await storage.getSession();
  if (!session) {
    log(`Nenhuma sessão para restaurar (${reason}).`);
    return;
  }
  log(`Restaurando sessão "${session.id}" (${reason}) - status: ${session.status}`);

  if (session.status === SESSION_STATUS.RUNNING) {
    // Se a aba da sessão não existe mais, sinaliza para o usuário.
    if (!(await tabExists(session.tabId))) {
      await mutateSession(async (current) => {
        if (!current || current.status !== SESSION_STATUS.RUNNING) return undefined;
        current.tabId = null;
        if (!current.warning) current.warning = 'tabClosed';
        return current;
      });
    }
    await startWatchdog();
    await checkDeadlines();
  }
}

/* ------------------------------------------------------------ */
/* Listeners                                                    */
/* ------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener((details) => {
  log('Extensão instalada/atualizada:', details.reason);
  restoreSession('onInstalled').catch((err) => error('Falha na restauração', err));
});

chrome.runtime.onStartup.addListener(() => {
  restoreSession('onStartup').catch((err) => error('Falha na restauração', err));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || !Object.values(ALARMS).includes(alarm.name)) return;
  log('Alarme disparado:', alarm.name);
  if (alarm.name === ALARMS.AUTO_NEXT) {
    checkScheduler().catch((err) => error('Falha ao iniciar sessão automática', err));
    return;
  }
  checkDeadlines().catch((err) => error('Falha ao processar alarme', err));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mutateSession(async (current) => {
    if (!current || current.tabId !== tabId) return undefined;
    current.tabId = null;
    if (current.status === SESSION_STATUS.RUNNING || current.status === SESSION_STATUS.PAUSED) {
      current.warning = 'tabClosed';
      warn('A aba da sessão foi fechada.');
    }
    return current;
  }).catch((err) => error('Falha ao tratar fechamento de aba', err));
});

let lastGreeting = null;

/** Sorteia uma saudação (banco + personalizadas), evitando repetir a última. */
async function suggestGreeting() {
  const prefs = await storage.getPrefs();
  const text = randomGreeting(prefs.customGreetings, lastGreeting);
  lastGreeting = text;
  log('Saudação sugerida');
  return { text };
}

const handlers = {
  'session:get': async () => storage.getSession(),
  'session:generate': generateSession,
  'session:start': startSession,
  'session:pause': pauseSession,
  'session:resume': resumeSession,
  'session:skip': skipStep,
  'session:stop': stopSession,
  'session:discard': discardSession,
  'session:check': async () => {
    await checkDeadlines();
    return storage.getSession();
  },
  'session:registerGoal': async (message) => registerGoal(message.goal),
  'session:reopenTab': reopenTab,
  'messages:suggest': suggestGreeting,
  'scheduler:get': async () => storage.getScheduler(),
  'scheduler:sync': syncScheduler,
  'scheduler:stop': async () => stopScheduler('pedido do usuário'),
  'scheduler:runNow': async () => {
    const scheduler = await storage.getScheduler();
    if (!scheduler.active) throw new Error('A repetição automática não está ativa.');
    await runAutoSession();
    return storage.getSession();
  },
  'content:whoami': async (_message, sender) => ({ tabId: sender.tab ? sender.tab.id : null }),
  'content:loginRequired': async (_message, sender) => flagLoginRequired(sender.tab ? sender.tab.id : null),
  'content:loggedIn': async (_message, sender) => clearLoginWarning(sender.tab ? sender.tab.id : null),
  'content:ping': async () => ({ pong: true })
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  const handler = handlers[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Mensagem desconhecida: ${message.type}` });
    return false;
  }
  handler(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => {
      error(`Falha em ${message.type}:`, err);
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });
  return true; // resposta assíncrona
});

// O service worker pode ter sido acordado por um evento qualquer:
// garante que alarmes existam para uma sessão em andamento.
restoreSession('boot').catch((err) => error('Falha na restauração inicial', err));
