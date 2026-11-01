/* =====================================================
   cart.js — Página del carrito (carrito.html)
   El cliente revisa lo que lleva, agrega/quita y pasa a llenar sus datos.
   ===================================================== */
(function () {
  'use strict';

  var O = Order, esc = O.esc;
  var page, repaintLines = null, notice = '', busy = false;

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function render() {
    busy = true;                      // cleanCart avisa al carrito; evitamos re-pintar dos veces
    var removed = O.cleanCart();
    busy = false;
    if (removed) notice = 'Quitamos ' + removed + (removed === 1 ? ' plato que ya no está disponible' : ' platos que ya no están disponibles') + ' en este menú.';

    var ls = O.lines(), m = O.mode();

    if (!ls.length) {
      page.innerHTML =
        (notice ? '<div class="notice">' + esc(notice) + '</div>' : '') +
        '<div class="empty">' + O.I.bag +
        '<h2>Tu pedido está vacío</h2>' +
        '<p>Agrega platos desde el menú para empezar.</p>' +
        '<a class="btn primary" href="index.html">Ver el menú</a></div>';
      return;
    }

    var t = O.totals(), canOrder = Store.canOrder();

    page.innerHTML =
      (notice ? '<div class="notice">' + esc(notice) + '</div>' : '') +
      '<div class="mode-row"><span class="mode-pill">' + esc(O.modeLabel()) + '</span>' +
        '<a class="link-btn" href="index.html?cambiar=1">Cambiar</a></div>' +
      '<section class="box"><div id="lines" class="lines"></div>' +
        '<a class="add-more" href="index.html">+ Agregar algo más</a></section>' +
      '<section class="box" id="totals"></section>' +
      (canOrder ? '' : '<div class="closed-banner">Estamos cerrados por ahora. Podrás enviar tu pedido cuando abramos.</div>') +
      '<a class="btn primary block lg' + (canOrder ? '' : ' disabled') + '" id="goOrder" href="' + (canOrder ? 'pedido.html' : '#') + '">' +
        'Continuar con mis datos' + '</a>';

    repaintLines = O.mountLines(document.getElementById('lines'), onChange);
    paintTotals();
  }

  function paintTotals() {
    var box = document.getElementById('totals');
    if (box) box.innerHTML = O.totalsHTML(O.totals());
  }

  function onChange() {
    if (!O.lines().length) render(); else paintTotals();
  }

  function init() {
    var md = Store.mode.get();
    if (md && md.type === 'local') { location.replace('index.html'); return; }   // en la mesa se pide desde el menú
    page = document.getElementById('page');
    O.renderHeader(document.getElementById('topbar'), 'Mi pedido', 'index.html');
    render();

    // tasa del día (si es automática) y cambios hechos desde otra pestaña
    Store.refreshRate().then(render);
    window.addEventListener('store:cart', function () { if (!busy && (!document.activeElement || !document.activeElement.closest('.line'))) render(); });
    window.addEventListener('store:data', render);

    document.addEventListener('click', function (e) {
      var go = e.target.closest('#goOrder.disabled');
      if (go) { e.preventDefault(); toast('Estamos cerrados por ahora'); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () { Store.ready.then(init); });
})();