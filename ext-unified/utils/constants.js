/**
 * constants.js
 * ------------------------------------------------------------
 * Constantes compartilhadas por popup, options e service worker.
 * O nome da extensão exibido na interface fica aqui (APP_NAME).
 * O nome que aparece no Chrome fica em manifest.json ("name").
 */

export const APP_NAME = 'Facebook Session Assistant';
export const APP_VERSION = '1.1.0';
export const LOG_PREFIX = '[Session Assistant]';

/** Versão do esquema de dados salvo em chrome.storage.local. */
export const SCHEMA_VERSION = 1;

/** Quantidade máxima de registros mantidos no histórico. */
export const HISTORY_LIMIT = 30;

/** Chaves usadas em chrome.storage.local. */
export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'schemaVersion',
  ACTIVE_PROFILE: 'activeProfileId',
  PROFILES: 'profiles',
  SESSION: 'session',
  HISTORY: 'history',
  PREFS: 'prefs',
  SCHEDULER: 'scheduler',
  PROGRESS: 'progress'
};

/** Nomes dos alarmes criados com chrome.alarms. */
export const ALARMS = {
  STEP_END: 'fsa-step-end',
  PAUSE_END: 'fsa-pause-end',
  WATCHDOG: 'fsa-watchdog',
  AUTO_NEXT: 'fsa-auto-next'
};

/** Intervalo (em minutos) do alarme de verificação periódica. */
export const WATCHDOG_PERIOD_MINUTES = 0.5;

export const SESSION_STATUS = {
  IDLE: 'idle',         // nenhuma sessão
  READY: 'ready',       // sessão sorteada, aguardando início
  RUNNING: 'running',   // em execução
  PAUSED: 'paused',     // pausada pelo usuário
  FINISHED: 'finished'  // concluída (resumo disponível)
};

export const PHASE = {
  NONE: 'none',
  ACTIVITY: 'activity',
  PAUSE: 'pause'
};

export const STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  SKIPPED: 'skipped'
};

/** Rótulos de status exibidos na interface. */
export const STATUS_LABELS = {
  [SESSION_STATUS.IDLE]: 'Pronto para começar',
  [SESSION_STATUS.READY]: 'Plano pronto',
  [SESSION_STATUS.RUNNING]: 'Em andamento',
  [SESSION_STATUS.PAUSED]: 'Pausado',
  [SESSION_STATUS.FINISHED]: 'Concluído'
};

/** Atalhos de tempo total no painel simples (minutos). */
export const HOME_TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

/** Atalhos de repetição no painel simples (minutos; 0 = não repetir). */
export const HOME_REPEAT_PRESETS = [0, 30, 60, 120, 180];

/**
 * Atividades com cronômetro. A ordem aqui é a ordem padrão quando
 * "Embaralhar atividades" está desligado.
 */
export const ACTIVITIES = [
  {
    key: 'feed',
    emoji: '📰',
    instruction: 'Role o feed e veja as novidades. Curta o que você gostar!',
    label: 'Feed',
    title: 'Navegar pelo Feed',
    description: 'Abre a página inicial e acompanha o tempo de navegação.',
    url: 'https://www.facebook.com/',
    unit: 'minutos',
    supportsAutoScroll: true
  },
  {
    key: 'reels',
    emoji: '🎬',
    instruction: 'Assista aos Reels. Curta os que achar legais!',
    label: 'Reels',
    title: 'Assistir Reels',
    description: 'Abre a área de Reels com cronômetro regressivo.',
    url: 'https://www.facebook.com/reel/',
    unit: 'minutos',
    supportsAutoScroll: false
  },
  {
    key: 'videos',
    emoji: '▶️',
    instruction: 'Escolha um vídeo e assista.',
    label: 'Vídeos',
    title: 'Assistir vídeos',
    description: 'Abre a área de vídeos (Watch).',
    url: 'https://www.facebook.com/watch/',
    unit: 'minutos',
    supportsAutoScroll: false
  },
  {
    key: 'lives',
    emoji: '🔴',
    instruction: 'Escolha uma live e assista um pouco.',
    label: 'Lives',
    title: 'Assistir Lives',
    description: 'Abre a área de transmissões ao vivo. Você escolhe a live.',
    url: 'https://www.facebook.com/watch/live/',
    unit: 'minutos',
    supportsAutoScroll: false
  },
  {
    key: 'games',
    emoji: '🎮',
    instruction: 'Escolha um jogo e divirta-se um pouco.',
    label: 'Jogos',
    title: 'Jogos do Facebook',
    description: 'Abre a área de jogos. Você escolhe o jogo.',
    url: 'https://www.facebook.com/gaming/',
    unit: 'minutos',
    supportsAutoScroll: false
  },
  {
    key: 'messenger',
    emoji: '💬',
    instruction: 'Escolha um amigo, cole a saudação e envie.',
    label: 'Messenger',
    title: 'Conversar com amigos',
    description: 'Abre as mensagens. Você escolhe o amigo e envia a saudação sugerida.',
    url: 'https://www.facebook.com/messages/',
    unit: 'minutos',
    supportsAutoScroll: false
  }
];

/**
 * Metas assistidas. A extensão nunca executa essas ações sozinha:
 * o usuário realiza a ação no Facebook e registra no contador.
 */
export const GOALS = [
  {
    key: 'likes',
    emoji: '👍',
    bigButton: 'Curti um post!',
    label: 'Curtidas',
    title: 'Curtidas durante a sessão',
    description: 'Você curte manualmente e registra aqui.',
    unit: 'curtidas',
    buttonLabel: '+ Registrar curtida',
    summaryLabel: 'Curtidas registradas',
    doneMessage: 'Meta de curtidas concluída.'
  },
  {
    key: 'friends',
    emoji: '🤝',
    bigButton: 'Pedi amizade!',
    label: 'Amigos',
    title: 'Solicitações de amizade',
    description: 'Você envia manualmente e registra aqui.',
    unit: 'solicitações',
    buttonLabel: '+ Registrar solicitação',
    summaryLabel: 'Solicitações registradas',
    doneMessage: 'Meta de solicitações concluída.'
  },
  {
    key: 'messages',
    emoji: '💬',
    bigButton: 'Mandei a mensagem!',
    label: 'Mensagens',
    title: 'Mensagens de saudação para amigos',
    description: 'A extensão sorteia e copia a saudação; você cola, envia e registra.',
    unit: 'mensagens',
    buttonLabel: '+ Registrar mensagem',
    summaryLabel: 'Mensagens registradas',
    doneMessage: 'Meta de mensagens concluída.',
    suggest: true
  }
];

/**
 * Modos de duração das atividades:
 *  - random: sorteia minutos entre mínimo e máximo de cada atividade;
 *  - total:  o usuário escolhe o tempo total da sessão e a fatia (peso)
 *            de cada atividade; os minutos são divididos proporcionalmente.
 */
export const DURATION_MODES = {
  RANDOM: 'random',
  TOTAL: 'total'
};

/** Opções rápidas de tempo total (minutos) no modo "total". */
export const TOTAL_MINUTES_PRESETS = [1, 2, 5, 10, 15, 20];

/**
 * Repetição automática: ao terminar uma sessão, a extensão espera um
 * intervalo e gera/inicia outra sessão sozinha (com novos sorteios).
 *  - fixed:  espera sempre a mesma quantidade de minutos;
 *  - random: sorteia a espera entre mínimo e máximo (minutos).
 */
export const REPEAT_MODES = {
  FIXED: 'fixed',
  RANDOM: 'random'
};

/** Opções rápidas de intervalo (minutos) para a repetição automática. */
export const REPEAT_MINUTES_PRESETS = [15, 30, 60, 90, 120, 180];

/** Espera usada quando o navegador reabre com uma repetição já vencida. */
export const REPEAT_CATCHUP_MS = 60 * 1000;

/** Configuração padrão de um perfil. */
export const DEFAULT_SETTINGS = {
  autoRepeat: { enabled: false, mode: REPEAT_MODES.FIXED, minutes: 60, min: 60, max: 90 },
  durationMode: DURATION_MODES.RANDOM,
  totalMinutes: 10,
  feed: { enabled: true, min: 1, max: 15, weight: 30, autoScroll: true },
  reels: { enabled: true, min: 2, max: 10, weight: 25 },
  videos: { enabled: true, min: 2, max: 8, weight: 20 },
  lives: { enabled: true, min: 3, max: 10, weight: 15 },
  games: { enabled: true, min: 2, max: 5, weight: 10 },
  messenger: { enabled: true, min: 2, max: 5, weight: 10 },
  likes: { enabled: true, min: 5, max: 10 },
  friends: { enabled: true, min: 1, max: 3 },
  messages: { enabled: true, min: 1, max: 3 },
  shuffle: true,
  pauses: { enabled: true, min: 10, max: 60 }
};

/** Preferências globais (independentes de perfil). */
export const DEFAULT_PREFS = {
  notifications: true,
  overlay: true,
  debugLogs: true,
  customGreetings: []
};

/** Limites de validação dos formulários. */
export const LIMITS = {
  activityMinutesMin: 0,
  activityMinutesMax: 600,
  totalMinutesMin: 1,
  totalMinutesMax: 600,
  weightMin: 0,
  weightMax: 100,
  repeatMinutesMin: 1,
  repeatMinutesMax: 1440,
  goalCountMin: 0,
  goalCountMax: 1000,
  pauseSecondsMin: 0,
  pauseSecondsMax: 3600
};

/** Perfis criados na primeira execução. */
export const DEFAULT_PROFILE_IDS = ['profile-1', 'profile-2', 'profile-3'];
