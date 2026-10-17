/* pos.js — letra de acomodo y vecinos en el orden maestro.
   El orden maestro es el orden del arreglo del catálogo (campo "orden" = posición + 1). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OFPos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function stripAccents(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /**
   * Letra de acomodo a partir de la sustancia (columna Sal).
   * - Grupos con prefijo "X-", "Y-", "Z-", "ZZ-" (productos no farmacéuticos) → el prefijo (X, Y, Z, ZZ).
   * - Resto → primera letra de la sal, mayúscula y sin acento.
   * - Si no hay letra, devuelve "" (la interfaz muestra "—").
   */
  function letterFromSal(sal) {
    const s = stripAccents(sal).trim();
    const m = /^(ZZ|Z|Y|X)\s*-/i.exec(s);
    if (m) return m[1].toUpperCase();
    const l = /[A-Za-z]/.exec(s);
    return l ? l[0].toUpperCase() : '';
  }

  /**
   * Cuatro anteriores y cuatro posteriores (o n) según la posición en el catálogo.
   * prev va de más lejano a más cercano (4,3,2,1); next de más cercano a más lejano (1..4).
   */
  function getNeighbors(items, pos, n) {
    n = n == null ? 4 : n;
    if (pos < 0 || pos >= items.length) return null;
    const prev = [], next = [];
    for (let k = n; k >= 1; k--) {
      const p = pos - k;
      if (p >= 0) prev.push({ pos: p, distance: k, item: items[p] });
    }
    for (let k = 1; k <= n; k++) {
      const p = pos + k;
      if (p < items.length) next.push({ pos: p, distance: k, item: items[p] });
    }
    return {
      current: { pos: pos, item: items[pos] },
      prev: prev, next: next,
      missingBefore: n - prev.length, missingAfter: n - next.length
    };
  }

  return { letterFromSal: letterFromSal, getNeighbors: getNeighbors };
});
