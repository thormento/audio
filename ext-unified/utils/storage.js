/**
 * storage.js
 * ------------------------------------------------------------
 * Camada única de acesso a chrome.storage.local.
 *
 * Estrutura salva:
 *   schemaVersion   -> número
 *   activeProfileId -> 'profile-1'
 *   profiles        -> { 'profile-1': { id, name, settings }, ... }
 *   session         -> objeto da sessão atual ou null
 *   history         -> array (mais recente primeiro, máx. HISTORY_LIMIT)
 *   prefs           -> { notifications, overlay, debugLogs }
 *
 * Todos os dados ficam apenas no navegador. Nada é enviado para fora.
 * Dados corrompidos são substituídos pelos padrões (com log de aviso).
 */

import {
  STORAGE_KEYS,
  SCHEMA_VERSION,
  HISTORY_LIMIT,
  DEFAULT_SETTINGS,
  DEFAULT_PREFS,
  DEFAULT_PROFILE_IDS,
  ACTIVITIES,
  GOALS,
  LIMITS,
  DURATION_MODES,
  REPEAT_MODES
} from './constants.js';
import { log, warn, error } from './logger.js';
import { normalizeProgress } from './gamification.js';

/* ------------------------------------------------------------ */
/* Helpers básicos                                              */
/* ------------------------------------------------------------ */

async function read(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (err) {
    error('Falha ao ler storage', err);
    return {};
  }
}

async function write(payload) {
  try {
    await chrome.storage.local.set(payload);
    return true;
  } catch (err) {
    error('Falha ao gravar storage', err);
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------ */
/* Configurações: normalização e validação                      */
/* ------------------------------------------------------------ */

/**
 * Garante que um objeto de configurações tenha todos os campos com
 * tipos corretos. Campos ausentes ou inválidos recebem os padrões.
 * Não valida regras de negócio (min <= max): isso é validateSettings.
 */
export function normalizeSettings(input) {
  const source = isPlainObject(input) ? input : {};
  const result = {};

  ACTIVITIES.forEach((activity) => {
    const defaults = DEFAULT_SETTINGS[activity.key];
    const raw = isPlainObject(source[activity.key]) ? source[activity.key] : {};
    result[activity.key] = {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
      min: toNumber(raw.min, defaults.min),
      max: toNumber(raw.max, defaults.max),
      weight: toNumber(raw.weight, defaults.weight)
    };
    if (activity.supportsAutoScroll) {
      result[activity.key].autoScroll =
        typeof raw.autoScroll === 'boolean' ? raw.autoScroll : Boolean(defaults.autoScroll);
    }
  });

  GOALS.forEach((goal) => {
    const defaults = DEFAULT_SETTINGS[goal.key];
    const raw = isPlainObject(source[goal.key]) ? source[goal.key] : {};
    result[goal.key] = {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
      min: toNumber(raw.min, defaults.min),
      max: toNumber(raw.max, defaults.max)
    };
  });

  result.shuffle = typeof source.shuffle === 'boolean' ? source.shuffle : DEFAULT_SETTINGS.shuffle;
  result.durationMode = Object.values(DURATION_MODES).includes(source.durationMode)
    ? source.durationMode
    : DEFAULT_SETTINGS.durationMode;
  result.totalMinutes = toNumber(source.totalMinutes, DEFAULT_SETTINGS.totalMinutes);

  const rawRepeat = isPlainObject(source.autoRepeat) ? source.autoRepeat : {};
  const repeatDefaults = DEFAULT_SETTINGS.autoRepeat;
  result.autoRepeat = {
    enabled: typeof rawRepeat.enabled === 'boolean' ? rawRepeat.enabled : repeatDefaults.enabled,
    mode: Object.values(REPEAT_MODES).includes(rawRepeat.mode) ? rawRepeat.mode : repeatDefaults.mode,
    minutes: toNumber(rawRepeat.minutes, repeatDefaults.minutes),
    min: toNumber(rawRepeat.min, repeatDefaults.min),
    max: toNumber(rawRepeat.max, repeatDefaults.max)
  };

  const rawPauses = isPlainObject(source.pauses) ? source.pauses : {};
  result.pauses = {
    enabled: typeof rawPauses.enabled === 'boolean' ? rawPauses.enabled : DEFAULT_SETTINGS.pauses.enabled,
    min: toNumber(rawPauses.min, DEFAULT_SETTINGS.pauses.min),
    max: toNumber(rawPauses.max, DEFAULT_SETTINGS.pauses.max)
  };

  return result;
}

/**
 * Valida regras de negócio. Retorna { valid, errors } onde cada erro
 * tem { field, message }. "field" segue o padrão "feed.min", "pauses.max".
 */
export function validateSettings(settings) {
  const errors = [];
  const s = normalizeSettings(settings);

  const checkRange = (key, label, cfg, { minAllowed, maxAllowed, unit, requireWhenEnabled }) => {
    if (requireWhenEnabled && !cfg.enabled) return;
    if (!Number.isInteger(cfg.min) || !Number.isInteger(cfg.max)) {
      errors.push({ field: `${key}.min`, message: `${label}: informe números inteiros.` });
      return;
    }
    if (cfg.min < 0 || cfg.max < 0) {
      errors.push({ field: `${key}.min`, message: `${label}: não são permitidos números negativos.` });
      return;
    }
    if (cfg.min < minAllowed) {
      errors.push({ field: `${key}.min`, message: `${label}: o valor mínimo deve ser de pelo menos ${minAllowed} ${unit}.` });
      return;
    }
    if (cfg.max > maxAllowed) {
      errors.push({ field: `${key}.max`, message: `${label}: o valor máximo não pode passar de ${maxAllowed} ${unit}.` });
      return;
    }
    if (cfg.min > cfg.max) {
      errors.push({ field: `${key}.min`, message: `${label}: o valor mínimo não pode ser maior que o valor máximo.` });
    }
  };

  const totalMode = s.durationMode === DURATION_MODES.TOTAL;

  ACTIVITIES.forEach((activity) => {
    const cfg = s[activity.key];
    if (totalMode) {
      if (!cfg.enabled) return;
      if (!Number.isFinite(cfg.weight) || cfg.weight < LIMITS.weightMin || cfg.weight > LIMITS.weightMax) {
        errors.push({ field: `${activity.key}.weight`, message: `${activity.label}: a participação deve ficar entre ${LIMITS.weightMin} e ${LIMITS.weightMax}.` });
      }
      return;
    }
    checkRange(activity.key, activity.label, cfg, {
      minAllowed: LIMITS.activityMinutesMin,
      maxAllowed: LIMITS.activityMinutesMax,
      unit: 'minuto(s)',
      requireWhenEnabled: true
    });
  });

  if (totalMode) {
    if (!Number.isInteger(s.totalMinutes) || s.totalMinutes < LIMITS.totalMinutesMin || s.totalMinutes > LIMITS.totalMinutesMax) {
      errors.push({ field: 'totalMinutes', message: `Tempo total: informe um número inteiro entre ${LIMITS.totalMinutesMin} e ${LIMITS.totalMinutesMax} minutos.` });
    }
    const anyWeight = ACTIVITIES.some((a) => s[a.key].enabled && s[a.key].weight > 0);
    if (!anyWeight) {
      errors.push({ field: 'activities', message: 'No modo de tempo total, pelo menos uma atividade ativa precisa ter participação maior que zero.' });
    }
  }

  GOALS.forEach((goal) => {
    checkRange(goal.key, goal.label, s[goal.key], {
      minAllowed: LIMITS.goalCountMin,
      maxAllowed: LIMITS.goalCountMax,
      unit: goal.unit,
      requireWhenEnabled: true
    });
  });

  checkRange('pauses', 'Pausa entre atividades', s.pauses, {
    minAllowed: LIMITS.pauseSecondsMin,
    maxAllowed: LIMITS.pauseSecondsMax,
    unit: 'segundo(s)',
    requireWhenEnabled: true
  });

  if (s.autoRepeat.enabled) {
    const r = s.autoRepeat;
    if (r.mode === REPEAT_MODES.FIXED) {
      if (!Number.isInteger(r.minutes) || r.minutes < LIMITS.repeatMinutesMin || r.minutes > LIMITS.repeatMinutesMax) {
        errors.push({ field: 'autoRepeat.minutes', message: `Repetição automática: informe um intervalo inteiro entre ${LIMITS.repeatMinutesMin} e ${LIMITS.repeatMinutesMax} minutos.` });
      }
    } else {
      checkRange('autoRepeat', 'Repetição automática', { enabled: true, min: r.min, max: r.max }, {
        minAllowed: LIMITS.repeatMinutesMin,
        maxAllowed: LIMITS.repeatMinutesMax,
        unit: 'minuto(s)',
        requireWhenEnabled: true
      });
    }
  }

  const anyActivity = ACTIVITIES.some((activity) => s[activity.key].enabled);
  if (!anyActivity) {
    errors.push({ field: 'activities', message: 'Selecione pelo menos uma atividade para executar.' });
  } else if (!totalMode) {
    // Tempo máximo 0 significa "não executar": ao menos uma precisa ter tempo.
    const anyTime = ACTIVITIES.some((activity) => s[activity.key].enabled && s[activity.key].max > 0);
    if (!anyTime) {
      errors.push({ field: 'activities', message: 'Todas as atividades selecionadas estão com tempo máximo 0. Informe um tempo para pelo menos uma.' });
    }
  }

  return { valid: errors.length === 0, errors, settings: s };
}

/* ------------------------------------------------------------ */
/* Perfis                                                       */
/* ------------------------------------------------------------ */

function buildDefaultProfiles() {
  const profiles = {};
  DEFAULT_PROFILE_IDS.forEach((id, index) => {
    profiles[id] = { id, name: `Perfil ${index + 1}`, settings: clone(DEFAULT_SETTINGS) };
  });
  return profiles;
}

function normalizeProfiles(input) {
  if (!isPlainObject(input) || Object.keys(input).length === 0) return buildDefaultProfiles();
  const profiles = {};
  Object.keys(input).forEach((id) => {
    const raw = input[id];
    if (!isPlainObject(raw)) return;
    profiles[id] = {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : id,
      settings: normalizeSettings(raw.settings)
    };
  });
  return Object.keys(profiles).length ? profiles : buildDefaultProfiles();
}

/**
 * Garante que a estrutura básica exista. Chamado em onInstalled e
 * de forma preguiçosa por todas as leituras de perfil.
 */
export async function ensureInitialized() {
  const data = await read([
    STORAGE_KEYS.SCHEMA_VERSION,
    STORAGE_KEYS.ACTIVE_PROFILE,
    STORAGE_KEYS.PROFILES,
    STORAGE_KEYS.PREFS,
    STORAGE_KEYS.HISTORY
  ]);

  const payload = {};
  const profiles = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
  if (JSON.stringify(profiles) !== JSON.stringify(data[STORAGE_KEYS.PROFILES])) {
    if (data[STORAGE_KEYS.PROFILES] !== undefined) warn('Perfis corrigidos para o formato esperado.');
    payload[STORAGE_KEYS.PROFILES] = profiles;
  }

  let active = data[STORAGE_KEYS.ACTIVE_PROFILE];
  if (typeof active !== 'string' || !profiles[active]) {
    active = Object.keys(profiles)[0];
    payload[STORAGE_KEYS.ACTIVE_PROFILE] = active;
  }

  if (!isPlainObject(data[STORAGE_KEYS.PREFS])) {
    payload[STORAGE_KEYS.PREFS] = clone(DEFAULT_PREFS);
  }

  if (!Array.isArray(data[STORAGE_KEYS.HISTORY])) {
    if (data[STORAGE_KEYS.HISTORY] !== undefined) warn('Histórico inválido foi reiniciado.');
    payload[STORAGE_KEYS.HISTORY] = [];
  }

  if (data[STORAGE_KEYS.SCHEMA_VERSION] !== SCHEMA_VERSION) {
    payload[STORAGE_KEYS.SCHEMA_VERSION] = SCHEMA_VERSION;
  }

  if (Object.keys(payload).length) {
    await write(payload);
    log('Estrutura de armazenamento inicializada/corrigida.');
  }

  return { profiles, activeProfileId: active };
}

export async function getProfiles() {
  const { profiles } = await ensureInitialized();
  return profiles;
}

export async function getActiveProfileId() {
  const { activeProfileId } = await ensureInitialized();
  return activeProfileId;
}

export async function setActiveProfile(profileId) {
  const { profiles } = await ensureInitialized();
  if (!profiles[profileId]) throw new Error('Perfil não encontrado.');
  await write({ [STORAGE_KEYS.ACTIVE_PROFILE]: profileId });
  log('Perfil ativo:', profileId);
  return profileId;
}

export async function renameProfile(profileId, name) {
  const { profiles } = await ensureInitialized();
  if (!profiles[profileId]) throw new Error('Perfil não encontrado.');
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Informe um nome para o perfil.');
  profiles[profileId].name = clean;
  await write({ [STORAGE_KEYS.PROFILES]: profiles });
  return profiles[profileId];
}

export async function resetProfileSettings(profileId) {
  const { profiles } = await ensureInitialized();
  if (!profiles[profileId]) throw new Error('Perfil não encontrado.');
  profiles[profileId].settings = clone(DEFAULT_SETTINGS);
  await write({ [STORAGE_KEYS.PROFILES]: profiles });
  log('Configurações do perfil restauradas:', profileId);
  return profiles[profileId].settings;
}

/* ------------------------------------------------------------ */
/* Configurações do perfil ativo                                */
/* ------------------------------------------------------------ */

/** Configurações normalizadas do perfil ativo. */
export async function getSettings() {
  const { profiles, activeProfileId } = await ensureInitialized();
  return normalizeSettings(profiles[activeProfileId].settings);
}

/**
 * Valida e salva as configurações no perfil ativo.
 * Retorna { valid, errors, settings }.
 */
export async function saveSettings(settings) {
  const validation = validateSettings(settings);
  if (!validation.valid) return validation;
  const { profiles, activeProfileId } = await ensureInitialized();
  profiles[activeProfileId].settings = validation.settings;
  const ok = await write({ [STORAGE_KEYS.PROFILES]: profiles });
  if (!ok) {
    return { valid: false, errors: [{ field: 'storage', message: 'Não foi possível salvar as configurações.' }], settings: validation.settings };
  }
  log('Configurações salvas no perfil', activeProfileId);
  return validation;
}

/* ------------------------------------------------------------ */
/* Sessão                                                       */
/* ------------------------------------------------------------ */

function isValidSession(session) {
  return (
    isPlainObject(session) &&
    typeof session.id === 'string' &&
    typeof session.status === 'string' &&
    Array.isArray(session.steps) &&
    isPlainObject(session.goals)
  );
}

/** Sessão atual ou null. Dados corrompidos são descartados. */
export async function getSession() {
  const data = await read(STORAGE_KEYS.SESSION);
  const session = data[STORAGE_KEYS.SESSION];
  if (session === undefined || session === null) return null;
  if (!isValidSession(session)) {
    warn('Sessão corrompida encontrada e descartada.');
    await write({ [STORAGE_KEYS.SESSION]: null });
    return null;
  }
  return session;
}

export async function saveSession(session) {
  return write({ [STORAGE_KEYS.SESSION]: session || null });
}

export async function clearSession() {
  return write({ [STORAGE_KEYS.SESSION]: null });
}

/* ------------------------------------------------------------ */
/* Agendador da repetição automática                            */
/* ------------------------------------------------------------ */

export const DEFAULT_SCHEDULER = { active: false, nextRunAt: null, intervalMs: 0, runs: 0, profileId: null };

/** Estado do agendador (sempre normalizado). */
export async function getScheduler() {
  const data = await read(STORAGE_KEYS.SCHEDULER);
  const raw = isPlainObject(data[STORAGE_KEYS.SCHEDULER]) ? data[STORAGE_KEYS.SCHEDULER] : {};
  return {
    active: raw.active === true,
    nextRunAt: Number.isFinite(raw.nextRunAt) ? raw.nextRunAt : null,
    intervalMs: Number.isFinite(raw.intervalMs) ? raw.intervalMs : 0,
    runs: Number.isInteger(raw.runs) ? raw.runs : 0,
    profileId: typeof raw.profileId === 'string' ? raw.profileId : null
  };
}

export async function saveScheduler(scheduler) {
  return write({ [STORAGE_KEYS.SCHEDULER]: { ...DEFAULT_SCHEDULER, ...(isPlainObject(scheduler) ? scheduler : {}) } });
}

/* ------------------------------------------------------------ */
/* Histórico                                                    */
/* ------------------------------------------------------------ */

export async function getHistory() {
  const data = await read(STORAGE_KEYS.HISTORY);
  const history = data[STORAGE_KEYS.HISTORY];
  if (!Array.isArray(history)) return [];
  return history.filter(isPlainObject);
}

/** Insere no início e mantém apenas os HISTORY_LIMIT mais recentes. */
export async function addHistoryEntry(entry) {
  const history = await getHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, HISTORY_LIMIT);
  await write({ [STORAGE_KEYS.HISTORY]: trimmed });
  log('Histórico atualizado. Registros:', trimmed.length);
  return trimmed;
}

export async function clearHistory() {
  await write({ [STORAGE_KEYS.HISTORY]: [] });
  log('Histórico limpo.');
}

/* ------------------------------------------------------------ */
/* Preferências                                                 */
/* ------------------------------------------------------------ */

export async function getPrefs() {
  const data = await read(STORAGE_KEYS.PREFS);
  const raw = isPlainObject(data[STORAGE_KEYS.PREFS]) ? data[STORAGE_KEYS.PREFS] : {};
  return {
    notifications: typeof raw.notifications === 'boolean' ? raw.notifications : DEFAULT_PREFS.notifications,
    overlay: typeof raw.overlay === 'boolean' ? raw.overlay : DEFAULT_PREFS.overlay,
    debugLogs: typeof raw.debugLogs === 'boolean' ? raw.debugLogs : DEFAULT_PREFS.debugLogs,
    customGreetings: Array.isArray(raw.customGreetings)
      ? raw.customGreetings.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim().slice(0, 300)).slice(0, 200)
      : []
  };
}

export async function savePrefs(partial) {
  const current = await getPrefs();
  const next = { ...current, ...(isPlainObject(partial) ? partial : {}) };
  await write({ [STORAGE_KEYS.PREFS]: next });
  return next;
}

/* ------------------------------------------------------------ */
/* Manutenção                                                   */
/* ------------------------------------------------------------ */

/** Apaga tudo e recria os padrões. Usado pela página de opções. */
export async function resetAll() {
  try {
    await chrome.storage.local.clear();
  } catch (err) {
    error('Falha ao limpar storage', err);
  }
  await ensureInitialized();
  log('Todos os dados foram restaurados para o padrão.');
}

/* ------------------------------------------------------------ */
/* Progresso do jogo (XP, nível, medalhas)                      */
/* ------------------------------------------------------------ */

export async function getProgress() {
  const data = await read(STORAGE_KEYS.PROGRESS);
  return normalizeProgress(data[STORAGE_KEYS.PROGRESS]);
}

export async function saveProgress(progress) {
  return write({ [STORAGE_KEYS.PROGRESS]: normalizeProgress(progress) });
}

export async function resetProgress() {
  await write({ [STORAGE_KEYS.PROGRESS]: normalizeProgress(null) });
  log('Progresso do jogo zerado.');
}
