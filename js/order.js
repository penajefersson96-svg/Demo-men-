/* =====================================================
   order.js — Funciones compartidas por carrito.html y pedido.html
   (líneas del pedido, totales, fecha/hora, iconos)
   ===================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function svg(inner, size) {
    size = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var I = {
    back: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', 22),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 18),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18),
    minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>', 18),
    pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 18),
    lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 16),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 22),
    chat: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>', 20),
    bag: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>', 48)
  };

  /* ---------- modo de pedido ---------- */
  function mode() {
    return Store.mode.get() || { type: 'delivery', table: '' };
  }
  function modeLabel() {
    var m = mode();
    return m.type === 'local' ? 'Comer en el local' + (m.table ? ' · Mesa ' + m.table : '') : 'Delivery';
  }

  /* ---------- líneas del pedido (solo platos que siguen vigentes) ---------- */
  function lines() {
    var m = mode();
    return Store.cart.items().map(function (i) {
      var d = Store.dishById(i.id);
      return d ? { dish: d, qty: i.qty, subtotal: d.price * i.qty } : null;
    }).filter(function (l) {
      return l && l.dish.available !== false && Store.dishVisibleIn(l.dish, m.type);
    });
  }
  /* quita del carrito platos agotados, borrados o que no son de este modo; devuelve cuántos quitó */
  function cleanCart() {
    var valid = {};
    lines().forEach(function (l) { valid[l.dish.id] = true; });
    var bad = Store.cart.items().filter(function (i) { return !valid[i.id]; });
    bad.forEach(function (i) { Store.cart.remove(i.id); });
    return bad.length;
  }

  function totals() {
    var m = mode(), ls = lines(), sub = 0, count = 0;
    ls.forEach(function (l) { sub += l.subtotal; count += l.qty; });
    var fee = (m.type === 'delivery' && ls.length) ? (Number(Store.config().deliveryFee) || 0) : 0;
    var total = sub + fee, r = Store.rate().value;
    return { count: count, sub: sub, fee: fee, total: total, rate: r,
             subBs: sub * r, feeBs: fee * r, totalBs: total * r };
  }

  /* ---------- HTML ---------- */
  function dual(usd, bs, cls) {
    return '<span class="dual ' + (cls || '') + '"><b>' + Store.fmtUSD(usd) + '</b>' +
      (Store.rate().value > 0 ? '<small>' + Store.fmtBs(bs) + '</small>' : '') + '</span>';
  }

  function lineHTML(l) {
    var d = l.dish, r = Store.rate().value;
    return '<div class="line" data-id="' + esc(d.id) + '">' +
      '<img src="' + esc(Store.dishImg(d)) + '" alt="" onerror="this.onerror=null;this.src=\'img/placeholder.svg\'">' +
      '<div class="line-main">' +
        '<h3>' + esc(d.name) + '</h3>' +
        '<div class="unit">' + Store.fmtUSD(d.price) + (r > 0 ? ' · ' + Store.fmtBs(d.price * r) : '') + ' c/u</div>' +
        '<div class="line-ctrl">' +
          '<div class="stepper sm">' +
            '<button type="button" data-step="-1" aria-label="Quitar uno">' + I.minus + '</button>' +
            '<span>' + l.qty + '</span>' +
            '<button type="button" data-step="1" aria-label="Agregar uno">' + I.plus + '</button>' +
          '</div>' +
          '<button type="button" class="trash" data-del aria-label="Eliminar ' + esc(d.name) + '">' + I.trash + '<span>Quitar</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="line-sub">' + dual(l.subtotal, l.subtotal * r) + '</div>' +
    '</div>';
  }

  function totalsHTML(t, opts) {
    opts = opts || {};
    var m = mode();
    return '<div class="totals">' +
      '<div class="t-row"><span>Subtotal</span>' + dual(t.sub, t.subBs) + '</div>' +
      (m.type === 'delivery' && Number(Store.config().deliveryFee) > 0
        ? '<div class="t-row"><span>Delivery</span>' + dual(t.fee, t.feeBs) + '</div>' : '') +
      '<div class="t-row grand"><span>' + (opts.totalLabel || 'Total') + '</span>' + dual(t.total, t.totalBs) + '</div>' +
    '</div>';
  }

  /* Pinta las líneas con botones +/-/quitar. onChange se llama tras cada cambio. */
  function mountLines(container, onChange) {
    function paint() {
      container.innerHTML = lines().map(lineHTML).join('');
    }
    container.addEventListener('click', function (e) {
      var row = e.target.closest('.line');
      if (!row) return;
      var id = row.dataset.id, q = Store.cart.qty(id);
      var step = e.target.closest('[data-step]'), del = e.target.closest('[data-del]');
      if (step) Store.cart.set(id, Math.min(99, q + parseInt(step.dataset.step, 10)));
      else if (del) Store.cart.remove(id);
      else return;
      paint();
      if (onChange) onChange();
    });
    paint();
    return paint;
  }

  /* ---------- fecha y hora (zona horaria del restaurante) ---------- */
  function timePart(date, tz) {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);   // 3:21 AM
  }
  function fmtDateTime(date) {
    var tz = Store.config().timezone || 'America/Caracas';
    try {
      var d = new Intl.DateTimeFormat('es-VE', {
        timeZone: tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      }).format(date);
      return d.charAt(0).toUpperCase() + d.slice(1) + ' · ' + timePart(date, tz);
    } catch (e) {
      return date.toLocaleString('es');
    }
  }
  function fmtDateTimeShort(date) {
    var tz = Store.config().timezone || 'America/Caracas';
    try {
      var d = new Intl.DateTimeFormat('es-VE', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
      return d + ' ' + timePart(date, tz);
    } catch (e) { return date.toLocaleString('es'); }
  }

  /* ---------- cabecera simple de las páginas del pedido ---------- */
  function renderHeader(el, title, backHref) {
    var c = Store.config();
    el.innerHTML =
      '<div class="topbar-row">' +
        '<a class="icon-btn" href="' + esc(backHref) + '" aria-label="Volver">' + I.back + '</a>' +
        '<h1 class="page-title">' + esc(title) + '</h1>' +
        '<a class="mini-logo" href="index.html" aria-label="Ir al menú"><img src="' + esc(c.logo || 'img/logo.svg') + '" alt="" width="40" height="40"></a>' +
      '</div>';
    document.title = title + ' · ' + c.name;
  }

  window.Order = {
    esc: esc, I: I, mode: mode, modeLabel: modeLabel,
    lines: lines, cleanCart: cleanCart, totals: totals,
    dual: dual, lineHTML: lineHTML, totalsHTML: totalsHTML, mountLines: mountLines,
    fmtDateTime: fmtDateTime, fmtDateTimeShort: fmtDateTimeShort, renderHeader: renderHeader
  };
})();