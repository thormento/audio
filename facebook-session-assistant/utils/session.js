/**
 * session.js
 * ------------------------------------------------------------
 * Funções puras para criar e resumir sessões. Não acessam storage
 * nem APIs do Chrome, o que facilita testes e reutilização.
 *
 * Estrutura de uma sessão:
 * {
 *   id, profileId, status, phase,
 *   createdAt, startedAt, endedAt,
 *   steps: [{ key, label, url, durationMs, drawnMinutes, elapsedMs,
 *             remainingMs, status, startedAt, endedAt, segmentStart,
 *             deadline, pauseAfterMs, autoScroll }],
 *   currentIndex,
 *   goals: { likes: { enabled, target, done, completedNotified }, friends: {...} },
 *   shuffle, pausesEnabled, totalEstimatedMs,
 *   tabId, warning, pauseDeadline, pauseRemainingMs, pauseDurationMs,
 *   summary
 * }
 */

import { ACTIVITIES, GOALS, SESSION_STATUS, PHASE, STEP_STATUS } from './constants.js';
import { randomBetween, shuffle } from './random.js';
import { minutesToMs, secondsToMs } from './timer.js';

/**
 * Sorteia durações, quantidades, pausas e ordem a partir das
 * configurações já validadas. Lança erro se nenhuma atividade
 * estiver ativa.
 */
export function buildSession(settings, profileId) {
  const now = Date.now();

  let steps = ACTIVITIES.filter((activity) => settings[activity.key] && settings[activity.key].enabled).map(
    (activity) => {
      const cfg = settings[activity.key];
      const drawnMinutes = randomBetween(cfg.min, cfg.max);
      const durationMs = minutesToMs(drawnMinutes);
      return {
        key: activity.key,
        label: activity.label,
        url: activity.url,
        durationMs,
        drawnMinutes,
        elapsedMs: 0,
        remainingMs: durationMs,
        status: STEP_STATUS.PENDING,
        startedAt: null,
        endedAt: null,
        segmentStart: null,
        deadline: null,
        pauseAfterMs: 0,
        autoScroll: Boolean(activity.supportsAutoScroll && cfg.autoScroll)
      };
    }
  );

  if (steps.length === 0) {
    throw new Error('Ative pelo menos uma atividade antes de gerar a sessão.');
  }

  if (settings.shuffle) steps = shuffle(steps);

  const pausesEnabled = Boolean(settings.pauses && settings.pauses.enabled);
  if (pausesEnabled) {
    steps.forEach((step, index) => {
      if (index < steps.length - 1) {
        step.pauseAfterMs = secondsToMs(randomBetween(settings.pauses.min, settings.pauses.max));
      }
    });
  }

  const goals = {};
  GOALS.forEach((goal) => {
    const cfg = settings[goal.key] || { enabled: false, min: 0, max: 0 };
    const enabled = Boolean(cfg.enabled);
    goals[goal.key] = {
      enabled,
      target: enabled ? randomBetween(cfg.min, cfg.max) : 0,
      done: 0,
      completedNotified: false
    };
  });

  const totalEstimatedMs = steps.reduce((sum, step) => sum + step.durationMs + step.pauseAfterMs, 0);

  return {
    id: `session-${now}-${Math.floor(Math.random() * 1e6)}`,
    profileId: profileId || null,
    status: SESSION_STATUS.READY,
    phase: PHASE.NONE,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    steps,
    currentIndex: -1,
    goals,
    shuffle: Boolean(settings.shuffle),
    pausesEnabled,
    totalEstimatedMs,
    tabId: null,
    warning: null,
    pauseDeadline: null,
    pauseRemainingMs: 0,
    pauseDurationMs: 0,
    summary: null
  };
}

/** Passo atual ou null. */
export function getCurrentStep(session) {
  if (!session || session.currentIndex < 0) return null;
  return session.steps[session.currentIndex] || null;
}

/** Próximo passo pendente após o índice atual ou null. */
export function getNextStep(session) {
  if (!session) return null;
  return session.steps[session.currentIndex + 1] || null;
}

/**
 * Tempo restante do passo (ms) considerando o estado atual.
 * Quando em execução, deriva do prazo; quando pausado, usa remainingMs.
 */
export function stepRemainingMs(session, step, now = Date.now()) {
  if (!step) return 0;
  if (session.status === SESSION_STATUS.RUNNING && session.phase === PHASE.ACTIVITY && step.deadline) {
    return Math.max(0, step.deadline - now);
  }
  if (step.status === STEP_STATUS.DONE || step.status === STEP_STATUS.SKIPPED) return 0;
  return Math.max(0, step.remainingMs);
}

/** Tempo restante da pausa entre atividades (ms). */
export function pauseRemainingMs(session, now = Date.now()) {
  if (!session || session.phase !== PHASE.PAUSE) return 0;
  if (session.status === SESSION_STATUS.RUNNING && session.pauseDeadline) {
    return Math.max(0, session.pauseDeadline - now);
  }
  return Math.max(0, session.pauseRemainingMs);
}

/** Monta o resumo final da sessão. */
export function computeSummary(session) {
  const activities = {};
  ACTIVITIES.forEach((activity) => {
    activities[activity.key] = 0;
  });
  session.steps.forEach((step) => {
    activities[step.key] = (activities[step.key] || 0) + Math.max(0, step.elapsedMs || 0);
  });

  const startedAt = session.startedAt || session.createdAt;
  const endedAt = session.endedAt || Date.now();
  const goals = {};
  GOALS.forEach((goal) => {
    const g = session.goals[goal.key] || { target: 0, done: 0, enabled: false };
    goals[goal.key] = { target: g.target, done: g.done, enabled: g.enabled };
  });

  return {
    startedAt,
    endedAt,
    totalMs: Math.max(0, endedAt - startedAt),
    activities,
    goals,
    stepsCompleted: session.steps.filter((s) => s.status === STEP_STATUS.DONE).length,
    stepsSkipped: session.steps.filter((s) => s.status === STEP_STATUS.SKIPPED).length,
    stepsTotal: session.steps.length
  };
}

/** Converte um resumo em registro de histórico. */
export function summaryToHistoryEntry(session, summary) {
  return {
    id: session.id,
    profileId: session.profileId,
    date: summary.startedAt,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    durationMs: summary.totalMs,
    activities: summary.activities,
    likes: summary.goals.likes ? summary.goals.likes.done : 0,
    friends: summary.goals.friends ? summary.goals.friends.done : 0,
    stepsCompleted: summary.stepsCompleted,
    stepsSkipped: summary.stepsSkipped,
    stepsTotal: summary.stepsTotal
  };
}
