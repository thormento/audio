/**
 * timer.js
 * ------------------------------------------------------------
 * Conversões e formatação de tempo. Os cronômetros da extensão
 * são baseados em timestamps absolutos (Date.now()), por isso o
 * tempo restante é sempre recalculado a partir do prazo salvo.
 */

export const MINUTE_MS = 60 * 1000;
export const SECOND_MS = 1000;

export function minutesToMs(minutes) {
  return Math.max(0, Number(minutes) || 0) * MINUTE_MS;
}

export function secondsToMs(seconds) {
  return Math.max(0, Number(seconds) || 0) * SECOND_MS;
}

/** Minutos inteiros (arredondados) a partir de milissegundos. */
export function msToMinutes(ms) {
  return Math.round(Math.max(0, Number(ms) || 0) / MINUTE_MS);
}

/** Tempo restante até o prazo, nunca negativo. */
export function remainingUntil(deadline, now = Date.now()) {
  if (!deadline) return 0;
  return Math.max(0, Number(deadline) - now);
}

/** Progresso entre 0 e 1. */
export function progress(elapsedMs, totalMs) {
  const total = Number(totalMs) || 0;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (Number(elapsedMs) || 0) / total));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** Formata como mm:ss (ou h:mm:ss acima de uma hora). */
export function formatClock(ms) {
  const totalSeconds = Math.ceil(Math.max(0, Number(ms) || 0) / SECOND_MS);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Formata uma duração de forma legível: "8 min", "1h 05min", "45 s". */
export function formatDuration(ms) {
  const totalSeconds = Math.round(Math.max(0, Number(ms) || 0) / SECOND_MS);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${pad(minutes)}min`;
  return `${minutes} min`;
}

/** Minutos arredondados para exibição: "<1 min", "8 min". */
export function formatMinutesShort(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value > 0 && value < MINUTE_MS) return '<1 min';
  return `${msToMinutes(value)} min`;
}

/** Formata minutos inteiros: "8 minutos" / "1 minuto". */
export function formatMinutesLabel(minutes) {
  const value = Number(minutes) || 0;
  return `${value} ${value === 1 ? 'minuto' : 'minutos'}`;
}

/** Data local curta: 23/09/2026. */
export function formatDate(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleDateString('pt-BR');
  } catch (_error) {
    return '—';
  }
}

/** Hora local curta: 14:05. */
export function formatTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (_error) {
    return '—';
  }
}
