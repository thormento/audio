/**
 * random.js
 * ------------------------------------------------------------
 * Funções de aleatoriedade reutilizadas em toda a extensão:
 * minutos, segundos, quantidades, pausas e ordem das atividades.
 */

/**
 * Retorna um número entre 0 (inclusivo) e 1 (exclusivo).
 * Usa crypto.getRandomValues quando disponível.
 */
function unitRandom() {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] / 4294967296;
    }
  } catch (_error) {
    // Cai no Math.random abaixo.
  }
  return Math.random();
}

/**
 * Sorteia um inteiro entre min e max (ambos inclusivos).
 * Se min > max, os valores são trocados. Valores inválidos viram 0.
 */
export function randomBetween(min, max) {
  let low = Number(min);
  let high = Number(max);
  if (!Number.isFinite(low)) low = 0;
  if (!Number.isFinite(high)) high = 0;
  low = Math.ceil(low);
  high = Math.floor(high);
  if (low > high) [low, high] = [high, low];
  return low + Math.floor(unitRandom() * (high - low + 1));
}

/** Sorteia um número decimal entre min e max. */
export function randomFloat(min, max) {
  let low = Number(min) || 0;
  let high = Number(max) || 0;
  if (low > high) [low, high] = [high, low];
  return low + unitRandom() * (high - low);
}

/** Retorna uma cópia embaralhada do array (Fisher-Yates). */
export function shuffle(array) {
  const copy = Array.isArray(array) ? array.slice() : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(unitRandom() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Retorna um item aleatório do array (ou undefined se vazio). */
export function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) return undefined;
  return array[Math.floor(unitRandom() * array.length)];
}

/** Retorna true com a probabilidade informada (0 a 1). */
export function chance(probability) {
  return unitRandom() < Number(probability);
}
