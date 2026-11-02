/* =====================================================
   caja-manual.js — Pedido a mano para una mesa abierta sin QR
   El cliente no pudo escanear: la caja abre la mesa, el cliente llama al mesero para todo y
   la caja registra aquí lo que pide. Va directo a la cocina (ya está confirmado) y la cuenta se cobra normal.
   ===================================================== */
(function () {
  'use strict';
  var K = window.CajaKit; if (!K) return;
  var $ = K.$, esc = K.esc;

  function open(tid) {
    var qty = {}, term = '';
    var dishes = Store.dishes().filter(function (d) { return d.available !== false; });
    var cats = Store.categories();
    var m = K.modal('<div id="cmBox"></div>');
    var box = m.querySelector('#cmBox');

    function lines() {
      return dishes.filter(function (d) { return qty[d.id] > 0; }).map(function (d) { return { dishId: d.id, name: d.name, price: d.price, qty: qty[d.id] }; });
    }
    function total() { return lines().reduce(function (t, l) { return t + l.price * l.qty; }, 0); }

    function listHTML() {
      var q = term.trim().toLowerCase(), out = '';
      cats.forEach(function (c) {
        var ds = dishes.filter(function (d) { return d.category === c.id && (!q || d.name.toLowerCase().indexOf(q) >= 0); });
        if (!ds.length) return;
        out += '<h4 class="cj-sub">' + esc(c.name || c.label || '') + '</h4><div class="cj-list">' + ds.map(function (d) {
          var n = qty[d.id] || 0;
          return '<div class="cj-line cm-line"><div><b>' + esc(d.name) + '</b><small>' + Store.fmtUSD(d.price) + '</small></div>' +
            '<div class="cm-ctrl"><button type="button" class="cj-ic" data-m="dec" data-id="' + esc(d.id) + '"' + (n ? '' : ' disabled') + '>−</button>' +
            '<span class="cm-n">' + n + '</span><button type="button" class="cj-ic" data-m="inc" data-id="' + esc(d.id) + '">+</button></div></div>';
        }).join('') + '</div>';
      });
      return out || '<p class="cj-hint">No hay platos que coincidan.</p>';
    }
    function foot() {
      var n = lines().reduce(function (t, l) { return t + l.qty; }, 0);
      return '<div class="cm-foot"><div><b>' + n + (n === 1 ? ' plato' : ' platos') + '</b> · ' + K.usdBs(total()) + '</div>' +
        '<button type="button" class="cj-btn primary" data-m="send"' + (n ? '' : ' disabled') + '>Enviar a cocina</button></div>';
    }
    function paintList() { var l = box.querySelector('#cmList'); if (l) l.innerHTML = listHTML(); var f = box.querySelector('#cmFoot'); if (f) f.innerHTML = foot(); }

    box.innerHTML = '<button type="button" class="cj-x" data-m="close" aria-label="Cerrar">✕</button><h3>Pedido · ' + esc(K.tableLabel(tid)) + '</h3>' +
      '<input id="cmQ" class="cj-select" type="search" placeholder="Buscar plato…" autocomplete="off">' +
      '<div id="cmList"></div><div id="cmFoot"></div>';
    paintList();
    box.querySelector('#cmQ').addEventListener('input', function () { term = this.value; paintList(); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var a = b.dataset.m, id = b.dataset.id;
      if (a === 'close') K.closeModal();
      else if (a === 'inc') { qty[id] = Math.min(99, (qty[id] || 0) + 1); paintList(); }
      else if (a === 'dec') { qty[id] = Math.max(0, (qty[id] || 0) - 1); paintList(); }
      else if (a === 'send') {
        b.disabled = true;
        Live.addStaffRound(tid, lines()).then(function (r) {
          K.closeModal(); K.toast(r ? 'Pedido enviado a la cocina' : 'No hay platos');
        }).catch(function (er) { b.disabled = false; K.toast('No se pudo enviar' + (er && er.code ? ' (' + er.code + ')' : '')); });
      }
    });
  }

  window.CajaManual = { open: open };
})();