/* import-excel.js — lectura de Excel, validación y generación de data.json.
   Núcleo (sin DOM) reutilizable en Node para pruebas y para tools/build-data.js.
   La interfaz de import-excel.html se activa solo en el navegador. Todo se procesa localmente. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pos.js'), require('./search.js'));
  else root.OFImport = factory(root.OFPos, root.OFSearch);
})(typeof self !== 'undefined' ? self : this, function (OFPos, OFSearch) {
  'use strict';

  var norm = OFSearch.normalize;

  // Sinónimos de encabezados (ya normalizados: sin acentos, minúsculas, sin puntuación)
  var SYNONYMS = {
    sal: ['sal', 'sustancia', 'sustancia activa', 'principio activo', 'substancia', 'acomodo', 'generico'],
    descripcion: ['descripcion', 'nombre comercial', 'nombre', 'producto', 'medicamento', 'articulo'],
    codigo: ['codigo', 'codigo de barras', 'cod barras', 'barras', 'ean', 'upc', 'codigo barras', 'barcode'],
    precio: ['precio publico', 'precio', 'pub', 'precio al publico', 'pvp', 'p publico'],
    orden: ['orden', 'posicion', 'secuencia', 'consecutivo', 'indice']
  };
  var REQUIRED = ['sal', 'descripcion', 'codigo', 'precio'];

  function headerKey(h) { return norm(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

  /** Propone la correspondencia campo → índice de columna. Devuelve {mapping, ambiguous[]} */
  function detectColumns(headers) {
    var keys = headers.map(headerKey);
    var mapping = {}, ambiguous = [];
    Object.keys(SYNONYMS).forEach(function (field) {
      var exact = [], loose = [];
      keys.forEach(function (k, i) {
        if (!k) return;
        if (SYNONYMS[field].indexOf(k) !== -1) exact.push(i);
        else if (SYNONYMS[field].some(function (s) { return s.length > 3 && k.indexOf(s) !== -1; })) loose.push(i);
      });
      var c = exact.length ? exact : loose;
      if (c.length === 1) mapping[field] = c[0];
      else if (c.length > 1) { mapping[field] = c[0]; ambiguous.push(field); }
      else if (REQUIRED.indexOf(field) !== -1) ambiguous.push(field);
    });
    // Evitar que dos campos usen la misma columna
    var used = {};
    Object.keys(mapping).forEach(function (f) {
      if (used[mapping[f]] != null) { ambiguous.push(f); }
      used[mapping[f]] = f;
    });
    return { mapping: mapping, ambiguous: ambiguous };
  }

  function cellToString(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function parsePrice(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
    var s = String(v).replace(/[$\s]/g, '').replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
  }

  /**
   * Construye el catálogo.
   * rows: arreglo de filas (arreglos) SIN el encabezado. mapping: {sal,descripcion,codigo,precio,orden?} → índice.
   * opts.orderMode: 'sheet' (orden de la hoja, por defecto) | 'column' (columna "orden") | 'sal' (ordenar por Sal, estable).
   * Devuelve { items, report }. No elimina silenciosamente: lo excluido queda en report.excluded.
   */
  function buildCatalog(rows, mapping, opts) {
    opts = opts || {};
    var mode = opts.orderMode || 'sheet';
    var firstRow = opts.firstRowNumber || 2; // número de fila de Excel de rows[0]
    var report = { totalRows: 0, emptyRows: 0, imported: 0, excluded: [], warnings: [],
      duplicateCodes: [], missingCode: [], missingSal: [], invalidPrice: [], orderInversions: [], nonNumericCodes: 0 };
    var recs = [];

    rows.forEach(function (r, i) {
      var rowNum = firstRow + i;
      var blank = !r || r.every(function (c) { return c == null || String(c).trim() === ''; });
      if (blank) { report.emptyRows++; return; }
      report.totalRows++;
      var descripcion = cellToString(r[mapping.descripcion]);
      var sal = cellToString(r[mapping.sal]);
      var codigo = cellToString(r[mapping.codigo]);
      var rawPrice = r[mapping.precio];
      if (!descripcion) { report.excluded.push({ fila: rowNum, motivo: 'Sin descripción', codigo: codigo, sal: sal }); return; }
      var precio = parsePrice(rawPrice);
      if (precio === null) report.invalidPrice.push({ fila: rowNum, descripcion: descripcion, valor: rawPrice == null ? '' : String(rawPrice) });
      if (!codigo) report.missingCode.push({ fila: rowNum, descripcion: descripcion });
      if (!sal) report.missingSal.push({ fila: rowNum, descripcion: descripcion });
      if (codigo && !/^\d+$/.test(codigo)) report.nonNumericCodes++;
      var ord = null;
      if (mode === 'column' && mapping.orden != null) {
        ord = Number(r[mapping.orden]);
        if (!isFinite(ord)) { report.excluded.push({ fila: rowNum, motivo: 'Valor de orden inválido', codigo: codigo, sal: sal }); return; }
      }
      recs.push({ fila: rowNum, seq: recs.length, ord: ord,
        item: { codigo: codigo, descripcion: descripcion, sal: sal, letra: OFPos.letterFromSal(sal), precio: precio } });
    });

    if (mode === 'column') recs.sort(function (a, b) { return a.ord - b.ord || a.seq - b.seq; });
    else if (mode === 'sal') recs.sort(function (a, b) {
      var x = norm(a.item.sal), y = norm(b.item.sal); return x < y ? -1 : x > y ? 1 : a.seq - b.seq; });

    // Informe de orden: cuántas veces la Sal retrocede alfabéticamente respecto al registro anterior (informativo)
    for (var k = 1; k < recs.length; k++) {
      var p = norm(recs[k - 1].item.sal), c = norm(recs[k].item.sal);
      if (c < p) report.orderInversions.push({ fila: recs[k].fila, anterior: recs[k - 1].item.sal, actual: recs[k].item.sal });
    }
    // Duplicados de código (se conservan todos)
    var seen = {};
    recs.forEach(function (rc) {
      var c = rc.item.codigo; if (!c) return;
      (seen[c] = seen[c] || []).push(rc.fila);
    });
    Object.keys(seen).forEach(function (c) { if (seen[c].length > 1) report.duplicateCodes.push({ codigo: c, filas: seen[c] }); });

    var items = recs.map(function (rc, idx) {
      var it = rc.item;
      return { codigo: it.codigo, descripcion: it.descripcion, sal: it.sal, letra: it.letra, precio: it.precio, orden: idx + 1 };
    });
    report.imported = items.length;
    return { items: items, report: report };
  }

  /** Texto resumido del informe (para consola / README de pruebas). */
  function summarize(report) {
    return [
      'Filas con datos: ' + report.totalRows + ' (filas vacías omitidas: ' + report.emptyRows + ')',
      'Importados: ' + report.imported,
      'Excluidos: ' + report.excluded.length,
      'Sin código: ' + report.missingCode.length,
      'Sin sal: ' + report.missingSal.length,
      'Precio inválido: ' + report.invalidPrice.length,
      'Códigos duplicados: ' + report.duplicateCodes.length,
      'Códigos no numéricos (internos): ' + report.nonNumericCodes,
      'Retrocesos alfabéticos de Sal en el orden (informativo): ' + report.orderInversions.length
    ].join('\n');
  }

  /** Lee un libro de SheetJS: devuelve { sheets:[nombres] } y una función para obtener filas de una hoja. */
  function sheetRows(XLSX, wb, name) {
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
  }
  /** Detecta la fila de encabezados (primera fila con ≥3 celdas de texto entre las primeras 15). */
  function findHeaderRow(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var texts = (rows[i] || []).filter(function (c) { return typeof c === 'string' && c.trim(); });
      if (texts.length >= 3) return i;
    }
    return 0;
  }

  return { detectColumns: detectColumns, buildCatalog: buildCatalog, summarize: summarize,
    sheetRows: sheetRows, findHeaderRow: findHeaderRow, REQUIRED: REQUIRED, parsePrice: parsePrice };
});
