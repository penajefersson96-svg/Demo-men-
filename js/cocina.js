/* =====================================================
   cocina.js — Pantalla de la cocina (cocina.html)

   Es OPCIONAL (config.kitchenEnabled). La caja confirma el pedido y llega aquí:
     Por empezar  →  En preparación  →  Terminado
   Al marcar "Terminado" la caja se entera y avisa al mesero.
   La cocina no ve precios ni datos de los clientes: solo mesa, platos y mesero.
   ===================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var app, session = null, sessions = {}, deliveries = {}, unsub = null, timer = null;
  var soundOn = false, actx = null, seen = null;

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function tableLabel(id) {
    var t = (Store.config().tables || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? (t.label || t.name || 'Mesa ' + id) : 'Mesa ' + id;
  }
  function kitchenOn() { return Store.config().kitchenEnabled !== false; }
  function mins(at) { return at ? Math.max(0, Math.round((Date.now() - at) / 60000)) : 0; }

  /* rondas visibles para la cocina: confirmadas por la caja en adelante (sin las ya entregadas) */
  function orders() {
    var out = { todo: [], doing: [], done: [] };
    Object.keys(sessions).forEach(function (tid) {
      var s = sessions[tid], map = {};
      (s.items || []).forEach(function (i) {
        if (['accepted', 'cooking', 'ready'].indexOf(i.status) < 0) return;
        var r = map[i.round] = map[i.round] || { n: i.round, status: i.status, items: [], at: i.sentAt || i.at };
        r.items.push(i);
      });
      Object.keys(map).forEach(function (k) {
        var r = map[k], o = { tid: tid, s: s, r: r };
        if (r.status === 'accepted') out.todo.push(o);
        else if (r.status === 'cooking') out.doing.push(o);
        else out.done.push(o);
      });
    });
    /* pedidos de delivery confirmados por la caja */
    Object.keys(deliveries).forEach(function (id) {
      var d = deliveries[id];
      if (['accepted', 'cooking', 'ready'].indexOf(d.status) < 0) return;
      var o = { tid: null, del: d, s: {}, r: { n: 0, status: d.status, at: d.acceptedAt || d.at,
        items: (d.items || []).map(function (i) { return { name: i.name, qty: i.qty }; }) } };
      (d.status === 'accepted' ? out.todo : d.status === 'cooking' ? out.doing : out.done).push(o);
    });
    ['todo', 'doing'].forEach(function (k) { out[k].sort(function (a, b) { return (a.r.at || 0) - (b.r.at || 0); }); });
    out.done.sort(function (a, b) { return (b.r.at || 0) - (a.r.at || 0); });
    return out;
  }

  function beep() {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = 660; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, actx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.5);
      o.start(); o.stop(actx.currentTime + 0.5);
    } catch (e) {}
  }

  function card(o, kind) {
    var m = mins(o.r.at);
    var cls = 'kt-card' + (kind === 'done' ? ' is-ready' : m >= 25 ? ' alert' : m >= 12 ? ' late' : '');
    var plates = o.r.items.reduce(function (n, i) { return n + i.qty; }, 0);
    var btns = '';
    var d = o.del ? 'data-del="' + esc(o.del.id) + '"' : 'data-t="' + esc(o.tid) + '" data-r="' + o.r.n + '"';
    if (kind === 'todo') btns = '<button type="button" class="cj-btn primary lg" data-a="cooking" ' + d + '>Empezar a preparar</button>';
    else if (kind === 'doing') btns = '<button type="button" class="cj-btn back" data-a="accepted" ' + d + ' title="Devolver a «Por empezar»">↩</button>' +
      '<button type="button" class="cj-btn primary lg" data-a="ready" ' + d + '>✔ Terminado</button>';
    else btns = '<button type="button" class="cj-btn sm" data-a="cooking" ' + d + '>↩ Volver a preparación</button>';
    if (o.del) cls += ' is-delivery';
    return '<article class="' + cls + '"><header><h3>' + (o.del ? '🛵 Delivery <small>#' + esc(o.del.code) + '</small>' : esc(tableLabel(o.tid)) + '<small>Ronda ' + o.r.n + '</small>') + '</h3>' +
      '<span class="kt-time">' + (kind === 'done' ? 'listo' : m < 1 ? 'ahora' : m + ' min') + '</span></header>' +
      '<ul class="kt-items">' + o.r.items.map(function (i) {
        return '<li><b>' + i.qty + '×</b><span>' + esc(i.name) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="kt-meta">' + plates + (plates === 1 ? ' plato' : ' platos') + (o.del ? ' · para llevar' : o.s.waiter ? ' · Mesero: ' + esc(o.s.waiter.name) : '') + '</div>' +
      '<div class="kt-actions">' + btns + '</div></article>';
  }

  function col(cls, title, list, kind, empty) {
    return '<section class="kt-col ' + cls + '"><h2>' + title + '<span>' + list.length + '</span></h2>' +
      (list.length ? list.map(function (o) { return card(o, kind); }).join('') : '<div class="kt-empty">' + empty + '</div>') + '</section>';
  }

  function paintBoard() {
    var board = $('#ktBoard'); if (!board) return;
    var c = orders();
    var keys = c.todo.map(function (o) { return o.del ? 'del:' + o.del.id : o.tid + ':' + o.r.n; });
    if (seen && keys.some(function (k) { return seen.indexOf(k) < 0; })) beep();
    seen = keys;
    var pending = c.todo.length;
    document.title = (pending ? '(' + pending + ') ' : '') + 'Cocina';
    board.innerHTML =
      col('todo', 'Por empezar', c.todo, 'todo', 'Sin pedidos nuevos') +
      col('doing', 'En preparación', c.doing, 'doing', 'Nada en preparación') +
      col('done', 'Terminados', c.done, 'done', 'Aquí aparecen los platos listos hasta que el mesero los entrega');
  }

  function shell() {
    var c = Store.config();
    app.innerHTML =
      '<header class="cj-head"><div class="cj-brand"><img src="' + esc(c.logo || 'img/logo.svg') + '" alt="" width="36" height="36">' +
      '<div><b>Cocina</b><small>' + esc(c.name || '') + '</small></div></div>' +
      '<div class="cj-head-actions"><button type="button" class="cj-btn" id="ktSound">🔔 Sonido</button>' +
      '<button type="button" class="cj-btn" id="ktOut">Salir</button></div></header>' +
      (kitchenOn() ? '<main class="kt-board" id="ktBoard"></main>' :
        '<div class="kt-off"><div>🍳</div><h2>La cocina está desactivada</h2><p>Este restaurante trabaja sin pantalla de cocina. Se activa desde el panel del administrador.</p></div>');
    $('#ktOut').onclick = function () { StaffUI.logout(); };
    $('#ktSound').onclick = function () {
      soundOn = !soundOn; this.classList.toggle('on', soundOn);
      this.textContent = soundOn ? '🔔 Sonido activado' : '🔔 Sonido';
      if (soundOn) beep();
    };
    if (!kitchenOn()) return;
    $('#ktBoard').onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      var job = b.dataset.del ? Delivery.setStatus(b.dataset.del, a) : Live.setRoundStatus(b.dataset.t, Number(b.dataset.r), a);
      job.then(function () {
        toast(a === 'ready' ? 'Listo · la caja avisa al mesero' : a === 'cooking' ? 'En preparación' : 'Devuelto a «Por empezar»');
      });
    };
    unsub = Live.watchAll(function (all) { sessions = all || {}; paintBoard(); });
    if (window.Delivery) Delivery.watchAll(function (all) { deliveries = all || {}; paintBoard(); });
    timer = setInterval(paintBoard, 30000);            // refresca los minutos de espera
  }

  document.addEventListener('DOMContentLoaded', function () {
    app = $('#app');
    Store.ready.then(function () {
      StaffUI.start(app, {
        roles: ['cocina'], title: 'Cocina', demoUser: 'cocina', demoPass: 'cocina123',
        onReady: function (s) { session = s; shell(); }
      });
    });
  });
})();