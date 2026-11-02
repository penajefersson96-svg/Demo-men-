/* =====================================================
   caja.js — Pantalla de la caja (caja.html)

   La caja recibe los pedidos de las mesas, los confirma y le avisa al mesero.
   Ve qué mesas están libres u ocupadas, atiende llamados y cuentas,
   arma el turno de meseros del día y libera las mesas (lo que BORRA sus datos).
   ===================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var app, session = null;
  var sessions = {};            // mesas ocupadas: { tableId: sesión }
  var shift = null;             // turno del día
  var tab = 'pend';
  var soundOn = false, actx = null;
  var seen = null;              // avisos ya vistos (para sonar solo con los nuevos)
  var unsubs = [];

  var STATUS = {
    sent:     ['Nuevo', 'wait'],
    accepted: ['Confirmado', 'ok'],
    cooking:  ['En preparación', 'cook'],
    ready:    ['Listo', 'ready'],
    served:   ['Entregado', 'done']
  };

  /* =====================================================
     Utilidades
     ===================================================== */
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function ago(at) {
    if (!at) return '';
    var m = Math.max(0, Math.round((Date.now() - at) / 60000));
    return m < 1 ? 'ahora' : 'hace ' + m + ' min';
  }
  function tables() { return Store.config().tables || []; }
  function tableLabel(id) {
    var t = tables().filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? (t.label || t.name || 'Mesa ' + id) : 'Mesa ' + id;
  }
  function kitchenOn() { return Store.config().kitchenEnabled !== false; }
  function usdBs(usd) {
    var r = Store.rate().value;
    return Store.fmtUSD(usd) + (r > 0 ? ' · ' + Store.fmtBs(usd * r) : '');
  }

  /* rondas enviadas de una mesa (sin los platos "por enviar") */
  function rounds(s) {
    var map = {};
    (s.items || []).forEach(function (i) {
      if (i.status === 'draft') return;
      var r = map[i.round] = map[i.round] || { n: i.round, status: i.status, items: [], total: 0, at: i.sentAt || i.at };
      r.items.push(i); r.total += i.price * i.qty;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.n - b.n; });
  }
  function tableTotal(s) {
    var t = 0;
    (s.items || []).forEach(function (i) { if (i.status !== 'draft') t += i.price * i.qty; });
    return t;
  }
  function waiterName(s) { return s.waiter ? s.waiter.name : ''; }

  /* =====================================================
     Sonido (aviso de pedidos nuevos)
     ===================================================== */
  function beep() {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); g.connect(actx.destination);
        var t0 = actx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.start(t0); o.stop(t0 + 0.18);
      });
    } catch (e) {}
  }

  /* =====================================================
     Qué hay pendiente
     ===================================================== */
  function collect() {
    var out = { bills: [], calls: [], news: [], ready: [], going: [] };
    Object.keys(sessions).forEach(function (tid) {
      var s = sessions[tid];
      if (s.calls && s.calls.bill) out.bills.push({ tid: tid, s: s, at: s.calls.bill.at });
      if (s.calls && s.calls.waiter) out.calls.push({ tid: tid, s: s, at: s.calls.waiter.at });
      rounds(s).forEach(function (r) {
        var o = { tid: tid, s: s, r: r, at: r.at };
        if (r.status === 'sent') out.news.push(o);
        else if (r.status === 'ready') out.ready.push(o);
        else if (r.status === 'accepted' || r.status === 'cooking') out.going.push(o);
      });
    });
    ['bills', 'calls', 'news', 'ready', 'going'].forEach(function (k) {
      out[k].sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    });
    return out;
  }

  function pendingCount(c) { return c.bills.length + c.calls.length + c.news.length + c.ready.length; }

  /* detecta avisos nuevos para sonar y marcar la pestaña del navegador */
  function detectNew(c) {
    var keys = [];
    c.bills.forEach(function (o) { keys.push('b:' + o.tid + ':' + o.at); });
    c.calls.forEach(function (o) { keys.push('c:' + o.tid + ':' + o.at); });
    c.news.forEach(function (o) { keys.push('n:' + o.tid + ':' + o.r.n); });
    c.ready.forEach(function (o) { keys.push('r:' + o.tid + ':' + o.r.n); });
    if (seen === null) { seen = {}; keys.forEach(function (k) { seen[k] = 1; }); return; }
    var fresh = keys.filter(function (k) { return !seen[k]; });
    keys.forEach(function (k) { seen[k] = 1; });
    if (fresh.length) beep();
  }

  /* =====================================================
     Pintar
     ===================================================== */
  function shell() {
    var c = Store.config();
    app.innerHTML =
      '<header class="cj-head">' +
        '<div class="cj-brand"><img src="' + esc(c.logo || 'img/logo.svg') + '" alt="" width="38" height="38"><div><b>Caja</b><small>' + esc(c.name) + ' · ' + esc((session && (session.name || session.user)) || '') + '</small></div></div>' +
        '<div class="cj-counts" id="cjCounts"></div>' +
        '<div class="cj-head-actions">' +
          '<button type="button" class="cj-btn" id="cjSound"></button>' +
          '<button type="button" class="cj-btn" id="cjOut">Salir</button>' +
        '</div>' +
      '</header>' +
      '<nav class="cj-tabs" id="cjTabs"></nav>' +
      '<main class="cj-main" id="cjMain"></main>' +
      '<div id="cjModal"></div>';

    $('#cjSound').addEventListener('click', function () {
      soundOn = !soundOn;
      if (soundOn) { beep(); toast('Sonido activado'); }
      paintHead();
    });
    $('#cjOut').addEventListener('click', function () { StaffUI.logout(); });
    $('#cjTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      tab = b.dataset.tab; paint();
    });
    $('#cjMain').addEventListener('click', onClick);

    unsubs.push(Live.watchAll(function (all) { sessions = all || {}; paint(); }));
    unsubs.push(Live.watchShift(function (sh) { shift = sh; paint(); }));
    if (window.CajaCierre) CajaCierre.start();
    if (window.CajaDelivery) CajaDelivery.start();
    Store.refreshRate().then(paint);
    Live.purgeOlderThan(14);                        // limpia mesas abandonadas (más de 14 horas sin actividad)
    Live.ensureKeys(tables().map(function (t) { return t.id; })).then(paint);   // clave secreta de cada mesa (va dentro del QR)
    setInterval(paint, 30000);                      // actualiza los "hace X min"
    paint();
  }

  function paintHead() {
    var total = tables().length, busy = 0;
    Object.keys(sessions).forEach(function (k) { busy++; });
    var free = Math.max(0, total - tables().filter(function (t) { return sessions[String(t.id)]; }).length);
    var extra = Object.keys(sessions).filter(function (k) { return !tables().some(function (t) { return String(t.id) === k; }); }).length;
    $('#cjCounts').innerHTML =
      '<span class="cj-count free"><b>' + free + '</b> libres</span>' +
      '<span class="cj-count busy"><b>' + (busy) + '</b> ocupadas</span>';
    $('#cjSound').textContent = soundOn ? '🔔 Sonido activado' : '🔕 Activar sonido';
    $('#cjSound').classList.toggle('on', soundOn);
  }

  function paint() {
    if (!$('#cjMain')) return;
    var c = collect();
    detectNew(c);
    var n = pendingCount(c), dn = window.CajaDelivery ? CajaDelivery.pending() : 0;
    document.title = (n + dn ? '(' + (n + dn) + ') ' : '') + 'Caja';
    paintHead();

    $('#cjTabs').innerHTML =
      tabBtn('pend', 'Pendientes', n) + tabBtn('mesas', 'Mesas', 0) + tabBtn('turno', 'Turno de hoy', shiftNeedsSetup() ? '!' : 0) +
      (window.CajaDelivery ? tabBtn('delivery', '🛵 Delivery', dn) : '') +
      (window.CajaCierre ? tabBtn('cierre', 'Cierre de caja', 0) : '');

    var box = $('#cjMain');
    if (tab === 'pend') box.innerHTML = pendHTML(c);
    else if (tab === 'mesas') box.innerHTML = mesasHTML();
    else if (tab === 'delivery' && window.CajaDelivery) box.innerHTML = CajaDelivery.html();
    else if (tab === 'cierre' && window.CajaCierre) {
      var ae = document.activeElement;                     // no se pisa lo que la caja está escribiendo
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && box.contains(ae)) return;
      box.innerHTML = CajaCierre.html(); if (CajaCierre.after) CajaCierre.after();
    }
    else box.innerHTML = turnoHTML();
    refreshDetail();
  }
  function tabBtn(id, label, badge) {
    return '<button type="button" class="cj-tab' + (tab === id ? ' active' : '') + '" data-tab="' + id + '">' + label +
      (badge ? '<span class="cj-badge">' + badge + '</span>' : '') + '</button>';
  }

  /* ---------- Pendientes ---------- */
  function itemsHTML(items) {
    return items.map(function (i) {
      return '<li><b>' + i.qty + '×</b> ' + esc(i.name) + '<small>' + esc(i.who) + '</small></li>';
    }).join('');
  }
  function waiterChip(s) {
    return s.waiter
      ? '<span class="cj-waiter">Mesero: <b>' + esc(s.waiter.name) + '</b></span>'
      : '<span class="cj-waiter none">Sin mesero · <button type="button" class="cj-link" data-a="detail" data-t="' + esc(s.tableId) + '">asignar</button></span>';
  }

  function pendHTML(c) {
    var html = '';
    if (shiftNeedsSetup()) {
      html += '<div class="cj-alert warn"><b>Aún no hay meseros de turno hoy.</b> Los pedidos llegarán sin mesero asignado. ' +
        '<button type="button" class="cj-link" data-tab="turno">Armar el turno</button></div>';
    }

    c.bills.forEach(function (o) {
      html += '<section class="cj-card bill"><header><h3>🧾 ' + esc(tableLabel(o.tid)) + ' pidió la cuenta</h3><span class="cj-ago">' + ago(o.at) + '</span></header>' +
        '<div class="cj-total">' + usdBs(tableTotal(o.s)) + '</div>' + waiterChip(o.s) +
        '<p class="cj-hint">Avisa al mesero para llevar la cuenta. Cuando paguen, registra el cobro.</p>' +
        '<div class="cj-actions"><button type="button" class="cj-btn primary" data-a="pay" data-t="' + esc(o.tid) + '">💵 Cobrar</button>' +
        '<button type="button" class="cj-btn" data-a="cancel-bill" data-t="' + esc(o.tid) + '">Cancelar solicitud</button></div></section>';
    });

    c.calls.forEach(function (o) {
      html += '<section class="cj-card call"><header><h3>🛎️ ' + esc(tableLabel(o.tid)) + ' llama al mesero</h3><span class="cj-ago">' + ago(o.at) + '</span></header>' +
        '<p class="cj-by">Lo pidió ' + esc(o.s.calls.waiter.by) + '</p>' + waiterChip(o.s) +
        '<div class="cj-actions"><button type="button" class="cj-btn primary" data-a="call-done" data-t="' + esc(o.tid) + '">Mesero avisado</button></div></section>';
    });

    c.news.forEach(function (o) {
      html += '<section class="cj-card new"><header><h3>' + esc(tableLabel(o.tid)) + ' · Ronda ' + o.r.n + (o.r.n > 1 ? ' <em>extra</em>' : '') + '</h3>' +
        '<span class="cj-pill wait">Nuevo · ' + ago(o.at) + '</span></header>' +
        '<ul class="cj-items">' + itemsHTML(o.r.items) + '</ul>' +
        '<div class="cj-row"><span class="cj-total sm">' + usdBs(o.r.total) + '</span>' + waiterChip(o.s) + '</div>' +
        '<div class="cj-actions"><button type="button" class="cj-btn primary lg" data-a="accept" data-t="' + esc(o.tid) + '" data-r="' + o.r.n + '">' +
        'Confirmar pedido' + (o.s.waiter ? ' y avisar a ' + esc(o.s.waiter.name) : '') + '</button></div></section>';
    });

    c.ready.forEach(function (o) {
      html += '<section class="cj-card ready"><header><h3>✅ ' + esc(tableLabel(o.tid)) + ' · Ronda ' + o.r.n + ' lista</h3><span class="cj-pill ready">Listo</span></header>' +
        '<ul class="cj-items">' + itemsHTML(o.r.items) + '</ul>' + waiterChip(o.s) +
        '<p class="cj-hint">Avisa al mesero que recoja el pedido.</p>' +
        '<div class="cj-actions"><button type="button" class="cj-btn primary" data-a="served" data-t="' + esc(o.tid) + '" data-r="' + o.r.n + '">Entregado a la mesa</button></div></section>';
    });

    if (!pendingCount(c)) {
      html += '<div class="cj-empty"><div>☕</div><h3>Todo al día</h3><p>Cuando una mesa pida, llame al mesero o pida la cuenta, aparecerá aquí.</p></div>';
    }

    if (c.going.length) {
      html += '<h4 class="cj-sub">En marcha</h4><div class="cj-list">' + c.going.map(function (o) {
        var st = STATUS[o.r.status];
        return '<div class="cj-line"><div><b>' + esc(tableLabel(o.tid)) + '</b> · Ronda ' + o.r.n +
          '<small>' + o.r.items.reduce(function (n, i) { return n + i.qty; }, 0) + ' platos · ' + esc(waiterName(o.s) || 'sin mesero') + '</small></div>' +
          '<span class="cj-pill ' + st[1] + '">' + st[0] + '</span>' +
          (o.r.status === 'accepted' && !kitchenOn()
            ? '<button type="button" class="cj-btn sm" data-a="served" data-t="' + esc(o.tid) + '" data-r="' + o.r.n + '">Entregado</button>' : '') +
          '</div>';
      }).join('') + '</div>';
    }
    return html;
  }

  /* ---------- Mesas ---------- */
  function mesasHTML() {
    var list = tables().map(function (t) { return { id: String(t.id), label: t.label || t.name || 'Mesa ' + t.id }; });
    Object.keys(sessions).forEach(function (k) {                    // mesas con clientes que ya no existen en la configuración
      if (!list.some(function (t) { return t.id === k; })) list.push({ id: k, label: 'Mesa ' + k });
    });
    if (!list.length) return '<div class="cj-empty"><h3>No hay mesas configuradas</h3><p>El administrador las crea desde su panel.</p></div>';

    return '<div class="cj-grid">' + list.map(function (t) {
      var s = sessions[t.id];
      if (!s) return '<button type="button" class="cj-table free" data-a="detail" data-t="' + esc(t.id) + '"><b>' + esc(t.label) + '</b><span class="cj-state">Libre</span></button>';
      var people = Object.keys(s.people || {}).length, flags = '';
      if (s.reserved && !people) return '<button type="button" class="cj-table busy" data-a="detail" data-t="' + esc(t.id) + '"><b>' + esc(t.label) + '</b><span class="cj-state">🔖 Apartada</span><span class="cj-mini">' + esc(s.reserved.name || 'Esperando al cliente') + '</span></button>';
      if (s.calls && s.calls.bill) flags += '<span class="cj-flag bill">🧾 Cuenta</span>';
      if (s.calls && s.calls.waiter) flags += '<span class="cj-flag call">🛎️ Llama</span>';
      if (rounds(s).some(function (r) { return r.status === 'sent'; })) flags += '<span class="cj-flag new">Nuevo</span>';
      return '<button type="button" class="cj-table busy' + (s.calls && s.calls.bill ? ' bill' : '') + '" data-a="detail" data-t="' + esc(t.id) + '">' +
        '<b>' + esc(t.label) + '</b><span class="cj-state">Ocupada · ' + people + (people === 1 ? ' persona' : ' personas') + '</span>' +
        '<span class="cj-mini">' + esc(waiterName(s) || 'Sin mesero') + ' · ' + Store.fmtUSD(tableTotal(s)) + '</span>' +
        (flags ? '<span class="cj-flags">' + flags + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /* ---------- Turno de meseros ---------- */
  function shiftIsToday() { return !!(shift && shift.day === Live.dayKey()); }
  function shiftNeedsSetup() { return !shiftIsToday() || !shift.waiters || !shift.waiters.length; }
  function shiftList() { return shiftIsToday() ? (shift.waiters || []).slice() : []; }

  function turnoHTML() {
    var today = shiftIsToday(), list = shiftList();
    var nextIdx = today && list.length ? ((shift.cursor || 0) % list.length) : -1;
    var html = '';

    if (!today && shift && shift.waiters && shift.waiters.length) {
      html += '<div class="cj-alert warn"><b>Es un día nuevo.</b> Elige quiénes trabajan hoy, o repite el turno de ayer: ' +
        esc(shift.waiters.map(function (w) { return w.name; }).join(', ')) + '. ' +
        '<button type="button" class="cj-btn sm primary" data-a="shift-repeat">Repetir turno de ayer</button></div>';
    }

    html += '<section class="cj-card"><header><h3>Meseros de hoy</h3></header>' +
      '<p class="cj-hint">Se asignan <b>por orden</b>: la primera mesa que pida recibe al #1, la siguiente al #2, y así en rotación. El mesero se queda con la mesa hasta que se libere.</p>';
    if (!list.length) html += '<p class="cj-by">Todavía no hay meseros en el turno.</p>';
    else html += '<ol class="cj-shift">' + list.map(function (w, i) {
      return '<li' + (i === nextIdx ? ' class="next"' : '') + '><span class="n">' + (i + 1) + '</span><b>' + esc(w.name) + '</b>' +
        (i === nextIdx ? '<span class="cj-pill ok">Siguiente</span>' : '') +
        '<span class="cj-mv"><button type="button" class="cj-ic" data-a="shift-up" data-i="' + i + '" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="cj-ic" data-a="shift-down" data-i="' + i + '" aria-label="Bajar"' + (i === list.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button type="button" class="cj-ic del" data-a="shift-del" data-i="' + i + '" aria-label="Quitar">✕</button></span></li>';
    }).join('') + '</ol>';
    html += '</section>';

    var known = (Store.config().waiters || []).filter(function (w) {
      return w.active !== false && !list.some(function (x) { return x.id === w.id; });
    });
    html += '<section class="cj-card"><header><h3>Agregar al turno</h3></header>' +
      (known.length ? '<div class="cj-chips">' + known.map(function (w) {
        return '<button type="button" class="cj-chip" data-a="shift-add" data-id="' + esc(w.id) + '" data-name="' + esc(w.name) + '">＋ ' + esc(w.name) + '</button>';
      }).join('') + '</div>' : '') +
      '<form class="cj-addform" id="cjAdd" novalidate><input id="cjAddName" type="text" maxlength="30" placeholder="Otro mesero (nombre)" autocomplete="off">' +
      '<button type="submit" class="cj-btn">Agregar</button></form></section>';
    return html;
  }

  function saveShift(list, cursor) {
    return Live.setShift(list, cursor).catch(function (e) { toast('No se pudo guardar el turno' + (e && e.code ? ' (' + e.code + ')' : '')); if (window.console) console.warn('turno', e); });
  }

  /* =====================================================
     Acciones
     ===================================================== */
  function onClick(e) {
    var tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; paint(); return; }
    var b = e.target.closest('[data-a]');
    if (!b) return;
    var a = b.dataset.a, t = b.dataset.t, r = Number(b.dataset.r), i = Number(b.dataset.i);
    var list = shiftList(), cur = shift ? (shift.cursor || 0) : 0;

    if (a === 'accept') Live.setRoundStatus(t, r, 'accepted').then(function () {
      var s = sessions[t];
      toast(s && s.waiter ? 'Confirmado · avisa a ' + s.waiter.name : 'Pedido confirmado');
    });
    else if (a === 'served') Live.setRoundStatus(t, r, 'served').then(function () { toast('Marcado como entregado'); });
    else if (a === 'call-done') Live.dismissCall(t, 'waiter');
    else if (a === 'cancel-bill') Live.dismissCall(t, 'bill');
    else if (a === 'release') confirmRelease(t);
    else if (a === 'pay' && window.CajaCierre) CajaCierre.openPay(t);
    else if (window.CajaDelivery && CajaDelivery.onAction(a, b)) { /* lo atendió el delivery */ }
    else if (window.CajaCierre && CajaCierre.onAction && CajaCierre.onAction(a, b)) { /* lo atendió el cierre de caja */ }
    else if (a === 'detail') openDetail(t);
    else if (a === 'shift-repeat') saveShift(shift.waiters, 0);
    else if (a === 'shift-add') { list.push({ id: b.dataset.id, name: b.dataset.name }); saveShift(list, cur); }
    else if (a === 'shift-del') { list.splice(i, 1); saveShift(list, cur > i ? cur - 1 : cur); }
    else if (a === 'shift-up' && i > 0) { var x = list[i]; list[i] = list[i - 1]; list[i - 1] = x; saveShift(list, cur); }
    else if (a === 'shift-down' && i < list.length - 1) { var y = list[i]; list[i] = list[i + 1]; list[i + 1] = y; saveShift(list, cur); }
  }

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'cjAdd') return;
    e.preventDefault();
    var inp = $('#cjAddName'), name = inp.value.trim();
    if (name.length < 2) { inp.focus(); return; }
    var list = shiftList();
    if (list.some(function (w) { return w.name.toLowerCase() === name.toLowerCase(); })) { toast('Ya está en el turno'); return; }
    list.push({ id: 'x' + Date.now().toString(36), name: name });
    saveShift(list, shift ? (shift.cursor || 0) : 0);
  });

  /* ---------- ventanas ---------- */
  var detailId = null;
  function modal(html, onClose) {
    closeModal();
    var box = $('#cjModal');
    box.innerHTML = '<div class="cj-overlay"><div class="cj-modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('.cj-overlay', box).addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });
    document.body.classList.add('noscroll');
    return $('.cj-modal', box);
  }
  function closeModal() {
    detailId = null;
    var box = $('#cjModal'); if (box) box.innerHTML = '';
    document.body.classList.remove('noscroll');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function confirmRelease(tid) {
    var s = sessions[tid];
    var m = modal('<h3>Liberar ' + esc(tableLabel(tid)) + '</h3>' +
      '<p>Se <b>borrarán</b> el pedido, los nombres y los avisos de esta mesa.' + (s ? ' Total consumido: <b>' + usdBs(tableTotal(s)) + '</b>.' : '') + ' ¿Ya pagaron?</p>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="no">Cancelar</button>' +
      '<button type="button" class="cj-btn primary" data-x="ok">Sí, liberar mesa</button></div>');
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'ok') Live.release(tid).then(function () { toast(tableLabel(tid) + ' liberada'); });
      closeModal();
    });
  }

  function openDetail(tid) {
    modal('<div id="cjDetail"></div>');      // modal() reinicia detailId, por eso se asigna después
    detailId = tid;
    refreshDetail();
  }
  function refreshDetail() {
    var box = $('#cjDetail'); if (!box || !detailId) return;
    var tid = detailId, s = sessions[tid];
    if (!s) {
      box.innerHTML = '<button type="button" class="cj-x" data-x="close" aria-label="Cerrar">✕</button><h3>' + esc(tableLabel(tid)) + '</h3>' +
        '<p><span class="cj-pill ok">Libre</span></p><p class="cj-hint">Se ocupa sola cuando un cliente escanea el QR de la mesa. Si un cliente no puede escanear, apártale la mesa: tú le muestras el QR de esa mesa en esta pantalla.</p>' +
        '<label class="cj-lbl" for="cjResName">Nombre del cliente (opcional)</label><input id="cjResName" class="cj-select" type="text" maxlength="30" placeholder="Ej: Sr. Pérez" autocomplete="off">' +
        '<div class="cj-actions"><button type="button" class="cj-btn primary" data-x="reserve">🔖 Apartar mesa y mostrar QR</button></div>';
    } else {
      var people = Object.keys(s.people || {}).map(function (k) { return s.people[k].name; });
      var opts = shiftList().map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (s.waiter && s.waiter.id === w.id ? ' selected' : '') + '>' + esc(w.name) + '</option>';
      }).join('');
      if (s.waiter && !shiftList().some(function (w) { return w.id === s.waiter.id; })) {
        opts = '<option value="' + esc(s.waiter.id) + '" selected>' + esc(s.waiter.name) + '</option>' + opts;
      }
      var drafts = (s.items || []).filter(function (i) { return i.status === 'draft'; });
      box.innerHTML =
        '<button type="button" class="cj-x" data-x="close" aria-label="Cerrar">✕</button>' +
        '<h3>' + esc(tableLabel(tid)) + ' <span class="cj-pill wait">Ocupada</span></h3>' +
        '<p class="cj-by">' + people.map(esc).join(', ') + ' · desde ' + ago(s.openedAt).replace('hace ', 'hace ') + '</p>' +
        '<label class="cj-lbl" for="cjW">Mesero de la mesa</label>' +
        '<select id="cjW" class="cj-select"><option value="">Sin mesero</option>' + opts + '</select>' +
        (rounds(s).length ? rounds(s).map(function (r) {
          var st = STATUS[r.status] || STATUS.sent;
          return '<div class="cj-round"><div class="cj-row"><b>Ronda ' + r.n + '</b><span class="cj-pill ' + st[1] + '">' + st[0] + '</span></div>' +
            '<ul class="cj-items">' + itemsHTML(r.items) + '</ul></div>';
        }).join('') : '<p class="cj-hint">Todavía no han enviado pedidos.</p>') +
        (drafts.length ? '<p class="cj-hint">Tienen ' + drafts.reduce(function (n, i) { return n + i.qty; }, 0) + ' platos por enviar (aún no pedidos).</p>' : '') +
        '<div class="cj-total">' + usdBs(tableTotal(s)) + '</div>' +
        '<div class="cj-actions">' +
          (window.CajaCierre && tableTotal(s) > 0 ? '<button type="button" class="cj-btn primary" data-x="pay">💵 Cobrar</button>' : '') +
          '<button type="button" class="cj-btn" data-x="qr">🔑 Ver QR de la mesa</button>' +
          (s.calls && s.calls.waiter ? '<button type="button" class="cj-btn" data-x="call">Quitar llamado</button>' : '') +
          '<button type="button" class="cj-btn danger" data-x="release">Liberar sin cobrar</button></div>';
      $('#cjW', box).addEventListener('change', function () {
        var id = this.value, w = shiftList().filter(function (x) { return x.id === id; })[0] || (s.waiter && s.waiter.id === id ? s.waiter : null);
        Live.setWaiter(tid, w || null).then(function () { toast(w ? 'Mesero: ' + w.name : 'Sin mesero'); });
      });
    }
    box.onclick = function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'close') closeModal();
      else if (b.dataset.x === 'call') Live.dismissCall(tid, 'waiter');
      else if (b.dataset.x === 'qr') showQR(tid);
      else if (b.dataset.x === 'reserve') {
        var nm = ($('#cjResName', box) || {}).value || '';
        b.disabled = true;
        Live.ensureKeys([tid]).then(function () { return Live.reserve(tid, nm); }).then(function () { showQR(tid); toast(tableLabel(tid) + ' apartada'); })
          .catch(function (e) { b.disabled = false; toast('No se pudo apartar la mesa' + (e && e.code ? ' (' + e.code + ')' : '')); });
      }
      else if (b.dataset.x === 'release') confirmRelease(tid);
      else if (b.dataset.x === 'pay' && window.CajaCierre) CajaCierre.openPay(tid);
    };
  }

  /* ---------- QR de una mesa (para clientes que no pueden escanear el de la mesa) ---------- */
  function tableLink(tid) {
    var u = (Store.config().publicUrl || '').trim();
    if (!u) u = location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '');
    if (!/\/$/.test(u)) u += '/';
    return u + 'index.html?modo=local&mesa=' + encodeURIComponent(tid) + '&k=' + encodeURIComponent(Live.keyFor(tid));
  }
  function showQR(tid) {
    if (!Live.keyFor(tid)) { toast('La clave de la mesa aún no está lista. Intenta de nuevo en unos segundos.'); return; }
    var link = tableLink(tid), qr = window.QRLib ? QRLib.svg(link, 260) : '';
    var m = modal('<button type="button" class="cj-x" data-x="close" aria-label="Cerrar">✕</button><h3>' + esc(tableLabel(tid)) + ' · QR</h3>' +
      '<p class="cj-hint">El cliente escanea este código con la cámara de su celular y entra a su mesa. No lo compartas con otras personas.</p>' +
      '<div style="display:grid;place-items:center;padding:8px 0;background:#fff;border-radius:14px">' + qr + '</div>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="copy">Copiar enlace</button>' +
      '<a class="cj-btn" style="display:grid;place-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Tu mesa: ' + link) + '">Enviar por WhatsApp</a>' +
      '<button type="button" class="cj-btn primary" data-x="close">Listo</button></div>');
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'copy') { try { navigator.clipboard.writeText(link).then(function () { toast('Enlace copiado'); }); } catch (x) { toast('No se pudo copiar'); } }
      else if (b.dataset.x === 'close') closeModal();
    });
  }

  /* herramientas para js/caja-cierre.js */
  window.CajaKit = {
    $: $, esc: esc, toast: toast, beep: beep, modal: modal, closeModal: closeModal, tableLabel: tableLabel, tableTotal: tableTotal,
    rounds: rounds, waiterName: waiterName, usdBs: usdBs, repaint: function () { paint(); },
    session: function () { return session; }, sessions: function () { return sessions; }, tab: function () { return tab; }
  };

  /* =====================================================
     Inicio
     ===================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    app = $('#app');
    Store.ready.then(function () {
      StaffUI.start(app, {
        roles: ['caja'], title: 'Caja', demoUser: 'caja', demoPass: 'caja123',
        onReady: function (s) { session = s; shell(); }
      });
    });
  });
})();