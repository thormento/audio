/**
 * logger.js
 * ------------------------------------------------------------
 * Logs com prefixo padronizado. Podem ser desligados pela
 * preferência "debugLogs" (página de opções). Erros são sempre
 * exibidos para que falhas nunca fiquem silenciosas.
 */

import { LOG_PREFIX, STORAGE_KEYS, DEFAULT_PREFS } from './constants.js';

let enabled = DEFAULT_PREFS.debugLogs;

export function setLogging(value) {
  enabled = Boolean(value);
}

export function isLoggingEnabled() {
  return enabled;
}

export function log(...args) {
  if (enabled) console.log(LOG_PREFIX, ...args);
}

export function warn(...args) {
  if (enabled) console.warn(LOG_PREFIX, ...args);
}

export function error(...args) {
  console.error(LOG_PREFIX, ...args);
}

/**
 * Lê a preferência de logs e passa a acompanhar mudanças.
 * Seguro para chamar em qualquer contexto da extensão.
 */
export async function initLogger() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.PREFS);
    const prefs = data[STORAGE_KEYS.PREFS];
    if (prefs && typeof prefs.debugLogs === 'boolean') setLogging(prefs.debugLogs);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEYS.PREFS]) return;
      const next = changes[STORAGE_KEYS.PREFS].newValue;
      if (next && typeof next.debugLogs === 'boolean') setLogging(next.debugLogs);
    });
  } catch (err) {
    console.error(LOG_PREFIX, 'Falha ao iniciar logger', err);
  }
}
