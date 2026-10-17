/* import-ui.js — interfaz de import-excel.html (usa OFImport, SheetJS local). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var wb = null, rows = [], result = null;
  var FIELDS = ['sal', 'descripcion', 'codigo', 'precio', 'orden'];

  function msg(t, kind) { var m = $('fileMsg'); m.textContent = t || ''; m.className = 'message ' + (kind || ''); m.hidden = !t; }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    msg('Leyendo archivo…', 'info');
    var reader = new FileReader();
    reader.onload = function () {
      try {
        wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: false });
        $('sheet').innerHTML = wb.SheetNames.map(function (n, i) { return '<option value="' + i + '">' + esc(n) + '</option>'; }).join('');
        msg('Archivo leído: ' + f.name, 'info'); $('s2').hidden = false; $('s3').hidden = true; $('s4').hidden = true;
        loadSheet();
      } catch (err) { msg('No se pudo leer el archivo: ' + err.message, 'error'); }
    };
    reader.onerror = function () { msg('No se pudo leer el archivo.', 'error'); };
    reader.readAsArrayBuffer(f);
  });

  function loadSheet() {
    var name = wb.SheetNames[+$('sheet').value];
    rows = OFImport.sheetRows(XLSX, wb, name);
    var h = OFImport.findHeaderRow(rows);
    var opts = ''; for (var i = 0; i < Math.min(rows.length, 15); i++) opts += '<option value="' + i + '">Fila ' + (i + 1) + '</option>';
    $('headerRow').innerHTML = opts; $('headerRow').value = h;
    fillColumns();
  }
  function fillColumns() {
    var h = +$('headerRow').value, headers = (rows[h] || []).map(function (x) { return x == null ? '' : String(x); });
    var det = OFImport.detectColumns(headers);
    FIELDS.forEach(function (f) {
      var o = '<option value="">' + (f === 'orden' ? '— ninguna —' : '— elegir —') + '</option>';
      headers.forEach(function (t, i) { o += '<option value="' + i + '">' + esc(t || '(vacío)') + ' [col. ' + (i + 1) + ']</option>'; });
      $('m_' + f).innerHTML = o;
      if (det.mapping[f] != null) $('m_' + f).value = det.mapping[f];
    });
    var w = $('colWarn');
    var amb = det.ambiguous.filter(function (f) { return f !== 'orden'; });
    w.hidden = !amb.length;
    w.textContent = amb.length ? 'Revisa la correspondencia de columnas (no se pudo identificar con certeza): ' + amb.join(', ') + '.' : '';
  }
  $('sheet').addEventListener('change', loadSheet);
  $('headerRow').addEventListener('change', fillColumns);

  $('process').addEventListener('click', function () {
    var mapping = {}, missing = [];
    FIELDS.forEach(function (f) { var v = $('m_' + f).value; if (v !== '') mapping[f] = +v; else if (OFImport.REQUIRED.indexOf(f) !== -1) missing.push(f); });
    if (missing.length) { $('colWarn').hidden = false; $('colWarn').textContent = 'Falta elegir columna para: ' + missing.join(', ') + '.'; return; }
    var mode = $('orderMode').value;
    if (mode === 'column' && mapping.orden == null) { $('colWarn').hidden = false; $('colWarn').textContent = 'Elige la columna de orden o cambia el criterio.'; return; }
    $('colWarn').hidden = true;
    var h = +$('headerRow').value;
    result = OFImport.buildCatalog(rows.slice(h + 1), mapping, { orderMode: mode, firstRowNumber: h + 2 });
    render(result);
  });

  function render(res) {
    var r = res.report;
    function chip(n, label, cls) { return '<span class="' + (n ? cls : 'good') + '">' + label + ': <b>' + n + '</b></span>'; }
    $('stats').innerHTML = '<span class="good">Importados: <b>' + r.imported + '</b> de ' + r.totalRows + '</span>' +
      chip(r.excluded.length, 'Excluidos', 'bad') + chip(r.missingCode.length, 'Sin código', 'warn') + chip(r.missingSal.length, 'Sin sal', 'warn') +
      chip(r.invalidPrice.length, 'Precio inválido', 'warn') + chip(r.duplicateCodes.length, 'Códigos duplicados', 'warn') +
      '<span>Retrocesos de Sal en el orden: <b>' + r.orderInversions.length + '</b></span>';
    var d = '';
    function det(title, arr, fmt) { if (arr.length) d += '<details><summary>' + title + ' (' + arr.length + ')</summary><ul>' + arr.slice(0, 200).map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') + (arr.length > 200 ? '<li>… y ' + (arr.length - 200) + ' más</li>' : '') + '</ul></details>'; }
    det('Excluidos (no incluidos en el catálogo)', r.excluded, function (x) { return 'Fila ' + x.fila + ': ' + esc(x.motivo); });
    det('Sin código de barras (se conservan, no se encuentran por código)', r.missingCode, function (x) { return 'Fila ' + x.fila + ': ' + esc(x.descripcion); });
    det('Sin sustancia (sin letra de acomodo)', r.missingSal, function (x) { return 'Fila ' + x.fila + ': ' + esc(x.descripcion); });
    det('Precio inválido', r.invalidPrice, function (x) { return 'Fila ' + x.fila + ': ' + esc(x.descripcion) + ' (valor “' + esc(x.valor) + '”)'; });
    det('Códigos duplicados (se conservan todos)', r.duplicateCodes, function (x) { return esc(x.codigo) + ' en filas ' + x.filas.join(', '); });
    det('Retrocesos de Sal respecto al registro anterior (informativo; se respeta el orden elegido)', r.orderInversions, function (x) { return 'Fila ' + x.fila + ': “' + esc(x.anterior) + '” → “' + esc(x.actual) + '”'; });
    if (r.nonNumericCodes) d += '<p style="font-size:.85rem;color:var(--muted)">' + r.nonNumericCodes + ' códigos no son numéricos (códigos internos); se conservan como texto.</p>';
    $('details').innerHTML = d;
    var head = '<tr><th>#</th><th>Letra</th><th>Descripción</th><th>Sal</th><th>Código</th><th>Precio</th></tr>';
    $('preview').innerHTML = head + res.items.slice(0, 12).map(function (it) {
      return '<tr><td>' + it.orden + '</td><td><b>' + esc(it.letra) + '</b></td><td>' + esc(it.descripcion) + '</td><td>' + esc(it.sal) + '</td><td>' + esc(it.codigo) + '</td><td>' + (it.precio == null ? '' : it.precio) + '</td></tr>'; }).join('');
    $('s3').hidden = false; $('s4').hidden = !res.items.length;
    $('s3').scrollIntoView({ behavior: 'smooth' });
  }

  $('download').addEventListener('click', function () {
    if (!result) return;
    var blob = new Blob([JSON.stringify(result.items)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'data.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
})();
