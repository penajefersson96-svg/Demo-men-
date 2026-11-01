/* =====================================================
   caja-delivery.js — Pestaña «Delivery» de la caja

   Flujo: llega → la caja CONFIRMA → la caja COBRA → pasa a la COCINA → cuando está listo,
   la caja lo marca ENVIADO (y se borran los datos del cliente). El cobro entra al cierre de caja.
   ===================================================== */
(function () {
  'use strict';
  var K = window.CajaKit; if (!K || !window.Delivery) return;
  var $ = K.$, esc = K.esc;
  var list = {}, seen = null;

  function arr() { return Object.keys(list).map(function (k) { return list[k]; }); }
  function kitchenOn() { return Store.config().kitchenEnabled !== false; }
  function ago(at) { var m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? 'ahora' : 'hace ' + m + ' min'; }
  function pending() { return arr().filter(function (d) { return d.status === 'new' || d.status === 'confirmed' || d.status === 'ready'; }).length; }

  function start() {
    Delivery.watchAll(function (all) { list = all || {}; detect(); K.repaint(); });
    Delivery.purgeOlderThan(24).catch(function () {});          // limpia pedidos olvidados (con datos del cliente)
  }
  function detect() {
    var keys = arr().filter(function (d) { return d.status === 'new' || d.status === 'confirmed' || d.status === 'ready'; }).map(function (d) { return d.id + ':' + d.status; });
    if (seen === null) { seen = {}; keys.forEach(function (k) { seen[k] = 1; }); return; }
    var fresh = keys.filter(function (k) { return !seen[k]; });
    keys.forEach(function (k) { seen[k] = 1; });
    if (fresh.length && K.beep) K.beep();
  }

  var ORDER = { new: 0, confirmed: 1, ready: 2, onway: 2, accepted: 3, cooking: 4 };

  function card(d) {
    var st = Delivery.STATUS[d.status] || Delivery.STATUS.new, c = d.customer || {}, id = esc(d.id), b = '';
    var map = c.gps ? 'https://www.google.com/maps?q=' + c.gps.lat + ',' + c.gps.lng
      : (c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) : '');
    var wa = c.phone ? 'https://wa.me/' + Delivery.waNumber(c.phone) : '';

    var cancelBtn = '<button type="button" class="cj-btn danger" data-a="dl-cancel" data-id="' + id + '">' + (d.paid ? 'Anular pedido' : 'Cancelar') + '</button>';
    if (d.status === 'new') {
      b = '<button type="button" class="cj-btn primary" data-a="dl-accept" data-id="' + id + '">✅ Confirmar pedido</button>' +
          '<button type="button" class="cj-btn danger" data-a="dl-cancel" data-id="' + id + '">Rechazar</button>';
    } else if (d.status === 'confirmed') {
      b = '<button type="button" class="cj-btn primary" data-a="dl-pay" data-id="' + id + '">💵 Cobrar' + (kitchenOn() ? ' y enviar a cocina' : '') + '</button>' + cancelBtn;
    } else if (d.status === 'accepted' && !kitchenOn()) {
      b = '<button type="button" class="cj-btn primary" data-a="dl-ready" data-id="' + id + '">Listo para despachar</button>' + cancelBtn;
    } else if (d.status === 'accepted' || d.status === 'cooking') {
      b = '<p class="cj-hint dl-wait">' + (d.status === 'accepted' ? 'Cobrado · esperando a la cocina…' : 'La cocina lo está preparando…') + '</p>' + cancelBtn;
    } else if (d.status === 'ready' || d.status === 'onway') {
      b = '<button type="button" class="cj-btn primary" data-a="dl-sent" data-id="' + id + '">🛵 Marcar enviado</button>' + cancelBtn;
    }

    return '<section class="cj-card dl ' + (d.status === 'new' || d.status === 'confirmed' ? 'new' : d.status === 'ready' ? 'ready' : '') + '">' +
      '<header><h3>🛵 #' + esc(d.code) + ' <em>' + esc(st[0]) + '</em></h3><span class="cj-ago">' + ago(d.at) + '</span></header>' +
      '<div class="dl-who"><b>' + esc(c.name) + '</b>' +
        (c.phone ? ' · <a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' + (wa ? ' · <a href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') : '') + '</div>' +
      (c.address || c.gps ? '<div class="dl-addr">📍 ' + esc(c.address || 'Ubicación GPS') + (c.detail ? ' — ' + esc(c.detail) : '') +
        (map ? ' · <a href="' + esc(map) + '" target="_blank" rel="noopener">Ver en el mapa</a>' : '') + '</div>' : '') +
      '<ul class="cj-items">' + (d.items || []).map(function (i) { return '<li><b>' + i.qty + '×</b> ' + esc(i.name) + '</li>'; }).join('') + '</ul>' +
      (c.note ? '<div class="dl-note">📝 ' + esc(c.note) + '</div>' : '') +
      '<div class="cj-total">' + K.usdBs(d.totalUSD) + '</div>' +
      '<p class="cj-hint">' + (d.paid ? '✅ <b>Cobrado</b> · ' : '') + 'Pago indicado: <b>' + esc(d.pay || '—') + '</b>' + (d.feeUSD > 0 ? ' · incluye delivery ' + Store.fmtUSD(d.feeUSD) : '') + '</p>' +
      '<div class="cj-actions">' + b + '</div></section>';
  }

  function html() {
    var a = arr().sort(function (x, y) { return (ORDER[x.status] - ORDER[y.status]) || (x.at - y.at); });
    var h = '<div class="cc-head"><h2>Pedidos de delivery</h2><p class="cj-hint">Orden: confirmar → cobrar → cocina → marcar enviado. Los datos del cliente se borran al marcarlo enviado o al cancelar.</p></div>';
    if (!a.length) return h + '<div class="cj-empty"><div>🛵</div><h3>Sin pedidos de delivery</h3><p>Cuando un cliente haga un pedido, aparecerá aquí.</p></div>';
    return h + a.map(card).join('');
  }

  function cancel(id) {
    var d = list[id]; if (!d) return;
    var m = K.modal('<h3>¿' + (d.paid ? 'Anular' : 'Cancelar') + ' el pedido #' + esc(d.code) + '?</h3><p>Se <b>borrarán</b> los datos del cliente y el pedido.' + (d.paid ? ' La venta ya cobrada quedará marcada como <b>anulada</b>.' : '') + ' Avísale por WhatsApp si hace falta.</p>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="no">Volver</button><button type="button" class="cj-btn primary" data-x="ok">Sí, cancelar</button></div>');
    m.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'ok') {
        var voidIt = d.paid ? DB.update('sales', 'v' + id, function (cur) {
          if (!cur || cur.void) return undefined; cur.void = true; cur.voidAt = Date.now(); cur.voidBy = (Auth.current() || {}).user || ''; return cur;
        }).catch(function () {}) : Promise.resolve();
        voidIt.then(function () { return Delivery.remove(id); }).then(function () { K.toast('Pedido cancelado'); });
      }
      K.closeModal();
    });
  }

  function onAction(a, b) {
    if (a.indexOf('dl-') !== 0) return false;
    var id = b.dataset.id, d = list[id];
    if (!d) return true;
    if (a === 'dl-accept') Delivery.setStatus(id, 'confirmed').then(function () { K.toast('Confirmado · ahora cóbralo para enviarlo a cocina'); });
    else if (a === 'dl-ready') Delivery.setStatus(id, 'ready');
    else if (a === 'dl-sent') Delivery.remove(id).then(function () { K.toast('Pedido #' + d.code + ' enviado · datos del cliente borrados'); });
    else if (a === 'dl-pay') CajaCierre.payDelivery(d);
    else if (a === 'dl-cancel') cancel(id);
    return true;
  }

  window.CajaDelivery = { start: start, html: html, pending: pending, onAction: onAction };
})();