/**
 * gamification.js
 * ------------------------------------------------------------
 * Regras do "jogo": XP, níveis, sequência de dias, medalhas e missões
 * diárias. Funções puras (sem storage), usadas pelo service worker ao
 * fim de cada sessão e pelo popup para exibir o progresso.
 *
 * Estrutura salva em chrome.storage.local ("progress"):
 * {
 *   xp, level, streak, bestStreak, lastSessionDay ('AAAA-MM-DD'),
 *   sessions, minutes, likes, friends, messages,
 *   activityMs: { feed, reels, videos, lives, games, messenger } (ms acumulados),
 *   days: { 'AAAA-MM-DD': ms de atividade no dia }, firstDay ('AAAA-MM-DD'),
 *   badges: { [id]: timestamp },
 *   missions: { day, claimed: { [id]: true } },
 *   avatar
 * }
 */

import { ACTIVITIES } from './constants.js';

/* ------------------------------------------------------------ */
/* XP e níveis                                                  */
/* ------------------------------------------------------------ */

export const XP_RULES = {
  perMinute: 1,
  perLike: 10,
  perFriend: 25,
  perMessage: 20,
  goalMet: 30,
  allStepsDone: 50,
  sessionFinished: 20,
  missionDefault: 30
};

export const LEVEL_TITLES = [
  'Iniciante',
  'Curioso',
  'Explorador',
  'Sociável',
  'Conectado',
  'Influente',
  'Veterano',
  'Mestre',
  'Lenda'
];

/** XP total necessário para alcançar o nível informado (nível 1 = 0). */
export function xpForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  return 100 * (n - 1) * (n - 1);
}

/** Nível correspondente a um total de XP. */
export function levelForXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  return Math.floor(Math.sqrt(value / 100)) + 1;
}

export function levelTitle(level) {
  const index = Math.min(LEVEL_TITLES.length - 1, Math.max(0, Math.floor(level) - 1));
  return LEVEL_TITLES[index];
}

/** Progresso dentro do nível atual: { level, current, needed, ratio }. */
export function levelProgress(xp) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = Math.max(0, (Number(xp) || 0) - base);
  const needed = next - base;
  return { level, title: levelTitle(level), current, needed, ratio: needed > 0 ? Math.min(1, current / needed) : 1, nextLevelXp: next };
}

/* ------------------------------------------------------------ */
/* Datas                                                        */
/* ------------------------------------------------------------ */

/** Dia local no formato AAAA-MM-DD. */
export function dayKey(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isYesterday(dayA, dayB) {
  // dayA é o dia anterior a dayB?
  const [y, m, d] = dayB.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return dayKey(prev.getTime()) === dayA;
}

/* ------------------------------------------------------------ */
/* Medalhas                                                     */
/* ------------------------------------------------------------ */

export const BADGES = [
  { id: 'first_session', emoji: '🎈', name: 'Primeira sessão', description: 'Concluiu a primeira sessão.', check: (p) => p.sessions >= 1 },
  { id: 'five_sessions', emoji: '🖐️', name: 'Cinco na conta', description: 'Concluiu 5 sessões.', check: (p) => p.sessions >= 5 },
  { id: 'twenty_sessions', emoji: '🏅', name: 'Vinte sessões', description: 'Concluiu 20 sessões.', check: (p) => p.sessions >= 20 },
  { id: 'streak_3', emoji: '🔥', name: 'Três dias seguidos', description: 'Sessões em 3 dias seguidos.', check: (p) => p.streak >= 3 },
  { id: 'streak_7', emoji: '🗓️', name: 'Semana inteira', description: 'Sessões em 7 dias seguidos.', check: (p) => p.streak >= 7 },
  { id: 'likes_50', emoji: '👍', name: 'Curtidor', description: 'Registrou 50 curtidas.', check: (p) => p.likes >= 50 },
  { id: 'friends_10', emoji: '🤝', name: 'Fazedor de amigos', description: 'Registrou 10 solicitações.', check: (p) => p.friends >= 10 },
  { id: 'messages_20', emoji: '💬', name: 'Bom de papo', description: 'Registrou 20 mensagens.', check: (p) => p.messages >= 20 },
  { id: 'hours_10', emoji: '⏳', name: 'Dez horas', description: '10 horas de atividades no total.', check: (p) => p.minutes >= 600 },
  { id: 'perfect', emoji: '⭐', name: 'Sessão perfeita', description: 'Todas as etapas e metas de uma sessão.', check: (_p, ctx) => ctx.perfect },
  { id: 'marathon', emoji: '🏃', name: 'Maratona', description: 'Uma sessão com 1 hora ou mais.', check: (_p, ctx) => ctx.sessionMinutes >= 60 },
  { id: 'allrounder', emoji: '🎯', name: 'Faz-tudo', description: 'Uma sessão com todas as atividades.', check: (_p, ctx) => ctx.allActivities },
  { id: 'early_bird', emoji: '🌅', name: 'Madrugador', description: 'Sessão iniciada antes das 8h.', check: (_p, ctx) => ctx.hour < 8 },
  { id: 'night_owl', emoji: '🦉', name: 'Coruja', description: 'Sessão iniciada depois das 22h.', check: (_p, ctx) => ctx.hour >= 22 }
];

/* ------------------------------------------------------------ */
/* Missões diárias                                              */
/* ------------------------------------------------------------ */

export const MISSIONS = [
  { id: 'daily_session', emoji: '✅', name: 'Faça 1 sessão hoje', target: 1, metric: 'sessions', xp: 30 },
  { id: 'daily_minutes', emoji: '⏱️', name: 'Fique 15 minutos ativo', target: 15, metric: 'minutes', xp: 30 },
  { id: 'daily_likes', emoji: '👍', name: 'Curta 5 posts', target: 5, metric: 'likes', xp: 30 },
  { id: 'daily_messages', emoji: '💬', name: 'Converse com 2 amigos', target: 2, metric: 'messages', xp: 40 }
];

/** Totais do dia calculados a partir do histórico. */
export function todayTotals(history, day = dayKey()) {
  const totals = { sessions: 0, minutes: 0, likes: 0, friends: 0, messages: 0 };
  (history || []).forEach((entry) => {
    if (dayKey(entry.startedAt || entry.date) !== day) return;
    totals.sessions += 1;
    const activityMs = entry.activities ? Object.values(entry.activities).reduce((a, b) => a + (b || 0), 0) : 0;
    totals.minutes += Math.round(activityMs / 60000);
    totals.likes += entry.likes || 0;
    totals.friends += entry.friends || 0;
    totals.messages += entry.messages || 0;
  });
  return totals;
}

/** Estado das missões de hoje: [{ ...mission, current, done, claimed }]. */
export function missionStatus(progress, history, day = dayKey()) {
  const totals = todayTotals(history, day);
  const claimed = progress.missions && progress.missions.day === day ? progress.missions.claimed || {} : {};
  return MISSIONS.map((m) => {
    const current = Math.min(m.target, totals[m.metric] || 0);
    return { ...m, current, done: current >= m.target, claimed: Boolean(claimed[m.id]) };
  });
}

/* ------------------------------------------------------------ */
/* Progresso                                                    */
/* ------------------------------------------------------------ */

export const DEFAULT_PROGRESS = {
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastSessionDay: null,
  sessions: 0,
  minutes: 0,
  likes: 0,
  friends: 0,
  messages: 0,
  activityMs: {},
  days: {},
  firstDay: null,
  statsBackfilled: false,
  badges: {},
  missions: { day: null, claimed: {} },
  avatar: '🙂'
};

export function normalizeProgress(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const progress = {
    ...DEFAULT_PROGRESS,
    xp: num(raw.xp),
    streak: num(raw.streak),
    bestStreak: num(raw.bestStreak),
    lastSessionDay: typeof raw.lastSessionDay === 'string' ? raw.lastSessionDay : null,
    sessions: num(raw.sessions),
    minutes: num(raw.minutes),
    likes: num(raw.likes),
    friends: num(raw.friends),
    messages: num(raw.messages),
    activityMs: {},
    days: {},
    firstDay: typeof raw.firstDay === 'string' ? raw.firstDay : null,
    statsBackfilled: raw.statsBackfilled === true,
    badges: raw.badges && typeof raw.badges === 'object' ? { ...raw.badges } : {},
    missions:
      raw.missions && typeof raw.missions === 'object'
        ? { day: raw.missions.day || null, claimed: { ...(raw.missions.claimed || {}) } }
        : { day: null, claimed: {} },
    avatar: typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : DEFAULT_PROGRESS.avatar
  };
  ACTIVITIES.forEach((a) => {
    progress.activityMs[a.key] = raw.activityMs && typeof raw.activityMs === 'object' ? num(raw.activityMs[a.key]) : 0;
  });
  if (raw.days && typeof raw.days === 'object') {
    Object.keys(raw.days).forEach((day) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) progress.days[day] = num(raw.days[day]);
    });
  }
  progress.level = levelForXp(progress.xp);
  return progress;
}

/**
 * Resumo das estatísticas acumuladas para exibição:
 * minutos por atividade, total, dias distintos com sessão ("dia N"),
 * primeiro dia e sequência atual.
 */
export function statsSummary(progressInput) {
  const p = normalizeProgress(progressInput);
  const activities = ACTIVITIES.map((a) => ({
    key: a.key,
    emoji: a.emoji,
    label: a.label,
    ms: p.activityMs[a.key] || 0,
    minutes: Math.round((p.activityMs[a.key] || 0) / 60000)
  }));
  const totalMs = activities.reduce((sum, a) => sum + a.ms, 0);
  const dayKeys = Object.keys(p.days).sort();
  return {
    activities,
    totalMs,
    totalMinutes: Math.round(totalMs / 60000),
    daysCount: dayKeys.length,
    firstDay: p.firstDay || dayKeys[0] || null,
    lastDay: dayKeys[dayKeys.length - 1] || null,
    todayMs: p.days[dayKey()] || 0,
    streak: p.streak,
    bestStreak: p.bestStreak,
    sessions: p.sessions,
    likes: p.likes,
    friends: p.friends,
    messages: p.messages
  };
}

/**
 * Aplica as recompensas de uma sessão concluída.
 * Recebe o progresso atual, o resumo da sessão e o histórico já
 * atualizado (com a sessão incluída). Retorna { progress, rewards }.
 */
export function awardSession(progressInput, session, summary, history) {
  const progress = normalizeProgress(progressInput);
  const before = { xp: progress.xp, level: progress.level, badges: { ...progress.badges } };
  const day = dayKey(summary.startedAt || Date.now());

  const activityMs = Object.values(summary.activities || {}).reduce((a, b) => a + (b || 0), 0);
  const sessionMinutes = Math.round(activityMs / 60000);
  const likes = summary.goals.likes ? summary.goals.likes.done : 0;
  const friends = summary.goals.friends ? summary.goals.friends.done : 0;
  const messages = summary.goals.messages ? summary.goals.messages.done : 0;

  // Totais acumulados
  progress.sessions += 1;
  progress.minutes += sessionMinutes;
  ACTIVITIES.forEach((a) => {
    progress.activityMs[a.key] = (progress.activityMs[a.key] || 0) + Math.max(0, (summary.activities || {})[a.key] || 0);
  });
  progress.days[day] = (progress.days[day] || 0) + activityMs;
  if (!progress.firstDay || day < progress.firstDay) progress.firstDay = day;
  progress.likes += likes;
  progress.friends += friends;
  progress.messages += messages;

  // Sequência de dias
  if (progress.lastSessionDay !== day) {
    progress.streak = progress.lastSessionDay && isYesterday(progress.lastSessionDay, day) ? progress.streak + 1 : 1;
    progress.lastSessionDay = day;
  }
  progress.bestStreak = Math.max(progress.bestStreak, progress.streak);

  // XP da sessão
  const breakdown = [];
  const add = (label, value) => {
    if (value > 0) breakdown.push({ label, xp: value });
  };
  add('Tempo ativo', sessionMinutes * XP_RULES.perMinute);
  add('Curtidas', likes * XP_RULES.perLike);
  add('Amizades', friends * XP_RULES.perFriend);
  add('Mensagens', messages * XP_RULES.perMessage);
  const goalsMet = Object.values(summary.goals || {}).filter((g) => g.enabled && g.target > 0 && g.done >= g.target).length;
  add('Metas batidas', goalsMet * XP_RULES.goalMet);
  const allStepsDone = summary.stepsTotal > 0 && summary.stepsCompleted === summary.stepsTotal;
  if (allStepsDone) add('Todas as etapas', XP_RULES.allStepsDone);
  add('Sessão concluída', XP_RULES.sessionFinished);

  // Missões do dia (recompensa uma vez por dia)
  if (!progress.missions || progress.missions.day !== day) progress.missions = { day, claimed: {} };
  const missionsCompleted = [];
  missionStatus(progress, history, day).forEach((m) => {
    if (m.done && !m.claimed) {
      progress.missions.claimed[m.id] = true;
      missionsCompleted.push(m);
      add(`Missão: ${m.name}`, m.xp || XP_RULES.missionDefault);
    }
  });

  const xpGained = breakdown.reduce((a, b) => a + b.xp, 0);
  progress.xp += xpGained;
  progress.level = levelForXp(progress.xp);

  // Medalhas
  const activeGoals = Object.values(summary.goals || {}).filter((g) => g.enabled && g.target > 0);
  const ctx = {
    perfect: allStepsDone && activeGoals.length > 0 && activeGoals.every((g) => g.done >= g.target),
    sessionMinutes,
    allActivities: ACTIVITIES.every((a) => (summary.activities[a.key] || 0) > 0),
    hour: new Date(summary.startedAt || Date.now()).getHours()
  };
  const newBadges = [];
  BADGES.forEach((badge) => {
    if (progress.badges[badge.id]) return;
    let ok = false;
    try {
      ok = Boolean(badge.check(progress, ctx));
    } catch (_err) {
      ok = false;
    }
    if (ok) {
      progress.badges[badge.id] = Date.now();
      newBadges.push({ id: badge.id, emoji: badge.emoji, name: badge.name, description: badge.description });
    }
  });

  return {
    progress,
    rewards: {
      xpGained,
      breakdown,
      levelBefore: before.level,
      levelAfter: progress.level,
      levelUp: progress.level > before.level,
      newBadges,
      missionsCompleted: missionsCompleted.map((m) => ({ id: m.id, emoji: m.emoji, name: m.name, xp: m.xp })),
      streak: progress.streak
    }
  };
}
