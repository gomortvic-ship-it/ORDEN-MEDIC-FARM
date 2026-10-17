/* app.js — interfaz y coordinación. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var el = { q: $('q'), clear: $('clearBtn'), scan: $('scanBtn'), status: $('status'), sugg: $('suggestions'),
    msg: $('message'), result: $('result'), info: $('catalogInfo'), net: $('netStatus'),
    cacheBanner: $('cacheBanner'), updateBanner: $('updateBanner'),
    scanner: $('scanner'), video: $('video'), scanMsg: $('scanMsg'), scanClose: $('scanClose'),
    manualForm: $('manualForm'), manualCode: $('manualCode') };

  var items = [], index = null, selectedPos = -1, suggItems = [], activeSugg = -1, timer = null;

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function money(n) {
    return n == null ? 'Sin precio' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function showMessage(text, kind) {
    el.msg.textContent = text || '';
    el.msg.className = 'message' + (kind ? ' ' + kind : '');
    el.msg.hidden = !text;
  }

  /* ---------- carga del catálogo ---------- */
  function loadCatalog() {
    return fetch('data.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var fromCache = r.headers.get('X-From-Cache') === '1';
      var lm = r.headers.get('Last-Modified');
      return r.json().then(function (data) { return { data: data, fromCache: fromCache, lm: lm }; });
    });
  }

  function init() {
    loadCatalog().then(function (res) {
      items = res.data;
      index = OFSearch.buildIndex(items);
      el.status.textContent = items.length.toLocaleString('es-MX') + ' productos disponibles. Escribe o escanea para buscar.';
      var d = res.lm ? new Date(res.lm) : null;
      el.info.textContent = 'Catálogo: ' + items.length.toLocaleString('es-MX') + ' productos' +
        (d && !isNaN(d) ? ' · actualizado ' + d.toLocaleDateString('es-MX') : '');
      if (res.fromCache) {
        el.cacheBanner.textContent = 'Sin conexión: usando el catálogo guardado en este dispositivo. Puede no ser la versión más reciente.';
        el.cacheBanner.hidden = false;
      }
      el.q.disabled = false; el.q.focus({ preventScroll: true });
    }).catch(function () {
      el.status.textContent = '';
      showMessage('No se pudo cargar el catálogo. Conéctate a internet y recarga la página.', 'error');
    });
  }

  /* ---------- búsqueda y sugerencias ---------- */
  function onInput() {
    el.clear.hidden = !el.q.value;
    clearTimeout(timer);
    timer = setTimeout(runSearch, 60);
  }

  function runSearch() {
    showMessage('');
    var q = el.q.value.trim();
    if (!index) return;
    if (!q) { hideSuggestions(); el.status.textContent = items.length.toLocaleString('es-MX') + ' productos disponibles. Escribe o escanea para buscar.'; return; }
    var res = OFSearch.search(index, q, 12);
    suggItems = res; activeSugg = -1;
    if (!res.length) {
      hideSuggestions();
      el.status.textContent = 'Sin resultados para “' + q + '”.';
      return;
    }
    el.status.textContent = res.total + (res.total === 1 ? ' resultado' : ' resultados') +
      (res.total > res.length ? ' (mostrando los ' + res.length + ' más relevantes)' : '') + '. Elige uno.';
    el.sugg.innerHTML = res.map(function (r, i) {
      return '<li role="option" id="s' + i + '" data-i="' + i + '"><span class="s-name">' + esc(r.item.descripcion) +
        '</span><span class="s-sub">' + (r.item.letra ? '<b>' + esc(r.item.letra) + '</b> · ' : '') + esc(r.item.sal) +
        (r.item.codigo ? ' · ' + esc(r.item.codigo) : '') + '</span></li>';
    }).join('');
    el.sugg.hidden = false; el.q.setAttribute('aria-expanded', 'true');
  }

  function hideSuggestions() {
    el.sugg.hidden = true; el.sugg.innerHTML = ''; suggItems = []; activeSugg = -1;
    el.q.setAttribute('aria-expanded', 'false');
  }

  function highlight(i) {
    var lis = el.sugg.children;
    for (var k = 0; k < lis.length; k++) lis[k].classList.toggle('active', k === i);
    activeSugg = i;
    if (lis[i]) { lis[i].scrollIntoView({ block: 'nearest' }); el.q.setAttribute('aria-activedescendant', lis[i].id); }
  }

  function onKey(e) {
    if (e.key === 'ArrowDown' && suggItems.length) { e.preventDefault(); highlight(Math.min(activeSugg + 1, suggItems.length - 1)); }
    else if (e.key === 'ArrowUp' && suggItems.length) { e.preventDefault(); highlight(Math.max(activeSugg - 1, 0)); }
    else if (e.key === 'Escape') { hideSuggestions(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSugg >= 0 && suggItems[activeSugg]) return select(suggItems[activeSugg].pos);
      lookupTyped();
    }
  }

  /** Enter: solo selecciona solo si es un código exacto único; nunca adivina entre varios. */
  function lookupTyped() {
    clearTimeout(timer);
    var q = el.q.value.trim();
    if (!q || !index) return;
    var byCode = OFSearch.findByCode(index, q);
    if (byCode.length === 1) return select(byCode[0]);
    if (byCode.length > 1) { runSearch(); showMessage('Ese código aparece en varios productos. Elige el correcto.', 'info'); return; }
    var res = OFSearch.search(index, q, 12);
    if (!res.length) { showMessage('No se encontró “' + q + '”. Revisa la escritura o el código.', 'error'); return; }
    runSearch();
    showMessage(res.total === 1 ? 'Toca el producto para ver su acomodo.' : 'Hay varios productos parecidos. Toca el correcto.', 'info');
  }

  /* ---------- resultado ---------- */
  function card(n, cls, label) {
    var it = n.item;
    return '<button type="button" class="prod ' + cls + '" data-pos="' + n.pos + '" aria-label="Ver acomodo de ' + esc(it.descripcion) + '">' +
      '<span class="badge" title="' + label + '">' + (cls === 'prev' ? '−' : '+') + n.distance + '</span>' +
      '<span class="prod-body"><span class="prod-name">' + esc(it.descripcion) + '</span>' +
      '<span class="prod-meta">' + (it.codigo ? 'Código: ' + esc(it.codigo) : 'Sin código') + ' · ' + money(it.precio) + '</span></span></button>';
  }

  function select(pos) {
    var nb = OFPos.getNeighbors(items, pos, 4);
    if (!nb) return;
    selectedPos = pos;
    var it = nb.current.item;
    hideSuggestions(); showMessage('');
    el.q.value = it.descripcion; el.clear.hidden = false;
    el.status.textContent = '';
    var html = '';
    html += '<div class="ok-bar">✔ Producto encontrado</div>';
    html += '<div class="card letter-card"><div class="letter" aria-label="Letra de acomodo ' + esc(it.letra || 'sin letra') + '">' +
      esc(it.letra || '—') + '</div><div><div class="kicker">Letra de acomodo</div>' +
      '<div class="sal">' + esc(it.sal) + '</div></div></div>';

    html += '<h2 class="sec">Cuatro anteriores</h2><div class="list">';
    if (nb.missingBefore) html += '<div class="edge">Inicio del catálogo: no hay más productos antes.</div>';
    html += nb.prev.map(function (n) { return card(n, 'prev', 'Anterior ' + n.distance); }).join('') + '</div>';

    html += '<div class="card current" aria-label="Producto seleccionado"><div class="kicker">Producto seleccionado</div>' +
      '<div class="cur-name">' + esc(it.descripcion) + '</div>' +
      '<div class="cur-grid"><div><span class="lbl">Código de barras</span><span class="val">' + (it.codigo ? esc(it.codigo) : 'Sin código') + '</span></div>' +
      '<div><span class="lbl">Precio público</span><span class="val price">' + money(it.precio) + '</span></div></div></div>';

    html += '<h2 class="sec">Cuatro posteriores</h2><div class="list">' +
      nb.next.map(function (n) { return card(n, 'next', 'Posterior ' + n.distance); }).join('');
    if (nb.missingAfter) html += '<div class="edge">Final del catálogo: no hay más productos después.</div>';
    html += '</div>';

    el.result.innerHTML = html;
    var cur = el.result.querySelector('.letter-card');
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearAll() {
    el.q.value = ''; el.clear.hidden = true; el.result.innerHTML = ''; showMessage('');
    hideSuggestions(); selectedPos = -1;
    el.status.textContent = items.length.toLocaleString('es-MX') + ' productos disponibles. Escribe o escanea para buscar.';
    el.q.focus();
  }

  /* ---------- escáner ---------- */
  function openScanner() {
    el.scanner.hidden = false; document.body.classList.add('no-scroll');
    el.scanMsg.textContent = 'Iniciando cámara… acepta el permiso si el navegador lo solicita.';
    el.scanMsg.className = 'scan-msg';
    OFScanner.start(el.video, onScanned, function (m) { el.scanMsg.textContent = m; el.scanMsg.className = 'scan-msg error'; });
    el.video.addEventListener('playing', function once() {
      el.video.removeEventListener('playing', once);
      el.scanMsg.textContent = 'Apunta la cámara al código de barras del producto.';
    });
  }
  function closeScanner() {
    OFScanner.stop(); el.scanner.hidden = true; document.body.classList.remove('no-scroll');
  }
  function onScanned(code) { closeScanner(); lookupCode(code); }

  function lookupCode(code) {
    code = String(code || '').trim();
    if (!code || !index) return;
    el.q.value = code; el.clear.hidden = false;
    var found = OFSearch.findByCode(index, code);
    if (found.length === 1) return select(found[0]);
    if (found.length > 1) {
      el.result.innerHTML = ''; runSearch();
      return showMessage('Ese código aparece en varios productos. Elige el correcto.', 'info');
    }
    el.result.innerHTML = ''; hideSuggestions();
    el.status.textContent = '';
    showMessage('El código ' + code + ' no está en el catálogo. Intenta de nuevo o búscalo por nombre.', 'error');
  }

  /* ---------- eventos ---------- */
  el.q.addEventListener('input', onInput);
  el.q.addEventListener('keydown', onKey);
  el.clear.addEventListener('click', clearAll);
  el.scan.addEventListener('click', openScanner);
  el.scanClose.addEventListener('click', closeScanner);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.scanner.hidden) closeScanner(); });
  el.manualForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var c = el.manualCode.value.trim(); if (!c) return;
    el.manualCode.value = ''; closeScanner(); lookupCode(c);
  });
  el.sugg.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-i]'); if (!li) return;
    var r = suggItems[+li.dataset.i]; if (r) select(r.pos);
  });
  el.result.addEventListener('click', function (e) {
    var b = e.target.closest('.prod[data-pos]'); if (b) select(+b.dataset.pos);
  });

  function updateNet() {
    el.net.hidden = navigator.onLine;
    el.net.textContent = 'Sin conexión';
  }
  window.addEventListener('online', updateNet); window.addEventListener('offline', updateNet); updateNet();

  /* ---------- service worker y actualizaciones ---------- */
  if ('serviceWorker' in navigator) {
    var reloading = false, hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('service-worker.js').then(function (reg) {
      function watch(w) {
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            el.updateBanner.hidden = false;
            $('updateBtn').onclick = function () { w.postMessage({ type: 'SKIP_WAITING' }); };
          }
        });
      }
      if (reg.waiting && navigator.serviceWorker.controller) { el.updateBanner.hidden = false; $('updateBtn').onclick = function () { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }; }
      reg.addEventListener('updatefound', function () { if (reg.installing) watch(reg.installing); });
      reg.update().catch(function () {});
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !hadController) return; reloading = true; location.reload();
    });
  }

  el.q.disabled = true;
  init();
})();
