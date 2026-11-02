/* =====================================================
   mesa.js — El cliente sentado en una mesa
   - Entra por el QR (index.html?mesa=5), escribe su nombre y se une a la mesa
   - Todos los de la mesa suman a UN solo pedido
   - Cualquiera puede enviar el pedido; llega a la caja
   Usa Live (live.js) y las ventanas de menu.js (window.MenuUI)
   ===================================================== */
(function () {
  'use strict';

  var ME_KEY = 'fogon_me_v1';       // quién soy en esta pestaña (sessionStorage)
  var ui = null, me = null, sess = null, unsub = null, isActive = false;

  var STATUS = {
    sent:     ['Esperando confirmación', 'wait'],
    accepted: ['Confirmado', 'ok'],
    cooking:  ['En preparación', 'cook'],
    ready:    ['Listo', 'ready'],
    served:   ['Entregado', 'done']
  };

  function esc(s) { return ui ? ui.esc(s) : String(s); }
  function $(s, r) { return (r || document).querySelector(s); }

  /* ---------- identidad en este dispositivo ---------- */
  function readMe() { try { return JSON.parse(sessionStorage.getItem(ME_KEY)); } catch (e) { return null; } }
  function writeMe(o) { try { sessionStorage.setItem(ME_KEY, JSON.stringify(o)); } catch (e) {} }
  function clearMe() { try { sessionStorage.removeItem(ME_KEY); } catch (e) {} me = null; sess = null; }
  function emit() { window.dispatchEvent(new CustomEvent('mesa:change')); }

  function tables() { return Store.config().tables || []; }
  function tableLabel(id) {
    var t = tables().filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? (t.label || t.name || 'Mesa ' + id) : 'Mesa ' + id;
  }
  function tableExists(id) {
    return !tables().length || tables().some(function (x) { return String(x.id) === String(id); });
  }

  /* =====================================================
     Inicio / fin
     ===================================================== */
  function stop() {
    if (unsub) { unsub(); unsub = null; }
  }

  function start(menuUI) {
    if (menuUI) ui = menuUI;
    stop();
    var m = Store.mode.get();
    if (!m || m.type !== 'local' || !m.table) { isActive = false; sess = null; emit(); return; }
    if (!tableExists(m.table)) { isActive = false; emit(); invalidTable(m.table); return; }

    if (!m.key) { isActive = false; emit(); needKey(m.table); return; }
    Live.setKey(m.table, m.key);
    isActive = true;
    var saved = readMe();
    me = (saved && String(saved.tableId) === String(m.table)) ? saved : null;
    if (me) watch(); else askName(m.table);
    emit();
  }

  function watch() {
    unsub = Live.watch(me.tableId, function (s) {
      if (!s) { if (me) released(); return; }
      if (!s.people[me.pid]) {                       // la sesión cambió: nos volvemos a unir en silencio
        Live.join(me.tableId, me.name).then(function (r) { me.pid = r.pid; writeMe(me); });
        return;
      }
      sess = s; emit(); paintOrder(); paintMenu();
    });
  }

  /* ---------- pantallas de entrada ---------- */
  function invalidTable(id) {
    ui.openSheet('<div class="sheet-pad name-sheet">' +
      '<p class="eyebrow">MESA ' + esc(id) + '</p><h2>Esta mesa no existe</h2>' +
      '<p class="muted">Escanea de nuevo el código QR de tu mesa o pide ayuda al personal.</p>' +
      '<button type="button" class="btn primary block" id="mBack">Ver el menú</button></div>', { cls: 'narrow', dismissible: false });
    $('#mBack').addEventListener('click', function () { Store.mode.clear(); location.href = 'index.html'; });
  }

  function needKey(id) {
    ui.openSheet('<div class="sheet-pad name-sheet">' +
      '<p class="eyebrow">' + esc(tableLabel(id)).toUpperCase() + '</p><h2>Escanea el QR de tu mesa</h2>' +
      '<p class="muted">Este enlace no trae la clave de la mesa. Escanea el código QR que está en tu mesa, o pide en caja que te aparten la mesa y te den el suyo.</p>' +
      '<button type="button" class="btn primary block" id="mBack">Ver el menú</button></div>', { cls: 'narrow', dismissible: false });
    $('#mBack').addEventListener('click', function () { Store.mode.clear(); location.href = 'index.html'; });
  }
  function badKey() {
    ui.openSheet('<div class="sheet-pad name-sheet">' +
      '<h2>No pudimos abrir la mesa</h2>' +
      '<p class="muted">El código de esta mesa no es válido o cambió. Escanea de nuevo el QR de tu mesa, o pide ayuda en caja.</p>' +
      '<button type="button" class="btn primary block" id="mBack">Ver el menú</button></div>', { cls: 'narrow', dismissible: false });
    $('#mBack').addEventListener('click', function () { Store.mode.clear(); location.href = 'index.html'; });
  }

  function askName(tableId) {
    var c = Store.config();
    var node = ui.openSheet('<div class="sheet-pad name-sheet">' +
      '<img class="info-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
      '<p class="eyebrow">' + esc(tableLabel(tableId)).toUpperCase() + '</p>' +
      '<h2>¿Cómo te llamas?</h2>' +
      '<input id="mName" type="text" maxlength="20" placeholder="Tu nombre" autocomplete="given-name" enterkeyhint="go">' +
      '<p class="err" id="mErr"></p>' +
      '<button type="button" class="btn primary block" id="mGo">Entrar a la mesa</button>' +
      '<button type="button" class="link-btn" id="mOther">No es mi mesa</button></div>', { cls: 'narrow', dismissible: false });

    var inp = $('#mName', node);
    setTimeout(function () { inp.focus(); }, 250);
    function go() {
      var name = inp.value.trim();
      if (name.length < 2) { $('#mErr', node).textContent = 'Escribe tu nombre (mínimo 2 letras).'; inp.focus(); return; }
      $('#mGo', node).disabled = true;
      Live.join(tableId, name).then(function (r) {
        me = { tableId: String(tableId), pid: r.pid, name: name };
        writeMe(me);
        ui.closeSheet();
        watch();
        emit();
      }).catch(function (e) {
        ui.closeSheet();
        if (e && e.code === 'permission-denied') badKey(); else ui.toast('No se pudo entrar a la mesa. Intenta de nuevo.');
      });
    }
    $('#mGo', node).addEventListener('click', go);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('#mOther', node).addEventListener('click', function () { Store.mode.clear(); location.href = 'index.html'; });
  }

  function released() {
    stop(); clearMe(); isActive = false;
    Store.mode.clear();
    emit();
    ui.openSheet('<div class="sheet-pad name-sheet">' +
      '<h2>¡Gracias por visitarnos!</h2>' +
      '<p class="muted">Tu mesa fue liberada. Para pedir de nuevo, escanea el código QR de tu mesa.</p>' +
      '<button type="button" class="btn primary block" id="mBye">Entendido</button></div>', { cls: 'narrow', dismissible: false });
    $('#mBye').addEventListener('click', function () { location.href = 'index.html'; });
  }

  /* =====================================================
     Lo que ve el menú (cantidades, etiquetas, totales)
     ===================================================== */
  function items() { return sess ? sess.items : []; }

  function qty(dishId) {
    var n = 0;
    items().forEach(function (i) { if (i.dishId === dishId) n += i.qty; });
    return n;
  }
  function whoTag(dishId) {
    var names = [];
    items().forEach(function (i) {
      if (i.dishId === dishId && i.status === 'draft') {
        var n = (me && i.pid === me.pid) ? 'tú' : i.who;
        if (names.indexOf(n) === -1) names.push(n);
      }
    });
    return names.join(', ');
  }
  function totals() {
    var count = 0, usd = 0;
    items().forEach(function (i) { count += i.qty; usd += i.price * i.qty; });
    return { count: count, usd: usd, bs: usd * Store.rate().value };
  }

  function add(dishId, n) {
    if (!isActive || !me) return false;
    if (sess && sess.calls && sess.calls.bill) { ui.toast('La cuenta ya fue solicitada'); return false; }
    var d = Store.dishById(dishId);
    if (!d) return false;
    Live.addItem(me.tableId, me.pid, { id: d.id, name: d.name, price: d.price }, n || 1);
    return true;
  }

  /* =====================================================
     Ventana "Pedido de la mesa"
     ===================================================== */
  function openOrder() {
    if (!isActive || !me) return;
    var node = ui.openSheet('<div class="sheet-pad order-sheet">' + ui.closeBtn() +
      '<p class="eyebrow">' + esc(tableLabel(me.tableId)).toUpperCase() + '</p>' +
      '<h2>Pedido</h2>' +
      '<span class="people-chip" id="mPeople"></span>' +
      '<div id="mWaiter"></div>' +
      '<div id="mBody"></div>' +
      '<div class="order-foot" id="mFoot"></div></div>', { cls: 'order' });

    node.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !me) return;
      var id = b.dataset.iid, it = items().filter(function (i) { return i.id === id; })[0];
      if (b.dataset.act === 'inc' && it) Live.setQty(me.tableId, id, it.qty + 1);
      if (b.dataset.act === 'dec' && it) Live.setQty(me.tableId, id, it.qty - 1);
      if (b.dataset.act === 'del') Live.setQty(me.tableId, id, 0);
      if (b.dataset.act === 'send') sendOrder();
      if (QUICK.indexOf(b.dataset.act) >= 0) onAction(b.dataset.act);
    });
    paintOrder();
  }

  function sendOrder() {
    Live.send(me.tableId).then(function (round) {
      if (round) ui.toast('Pedido enviado · esperando confirmación');
    }).catch(function (e) {
      ui.toast('No se pudo enviar el pedido' + (e && e.code ? ' (' + e.code + ')' : '') + '. Intenta de nuevo.');
      if (window.console) console.warn('send', e);
    });
  }

  function lineDraft(i) {
    return '<div class="m-item"><div class="m-name">' + esc(i.name) + '</div>' +
      '<div class="m-ctrl"><button type="button" data-act="dec" data-iid="' + i.id + '" aria-label="Quitar uno">−</button>' +
      '<span>' + i.qty + '</span>' +
      '<button type="button" data-act="inc" data-iid="' + i.id + '" aria-label="Agregar uno">+</button></div></div>';
  }

  function paintOrder() {
    var body = document.getElementById('mBody');
    if (!body) return;                              // la ventana no está abierta
    if (!sess) return;

    var n = Object.keys(sess.people).length;
    $('#mPeople').textContent = n + (n === 1 ? ' persona en la mesa' : ' personas en la mesa');
    $('#mWaiter').innerHTML = waiterCard();

    var html = '', drafts = items().filter(function (i) { return i.status === 'draft'; });

    // por enviar, agrupado por persona
    if (drafts.length) {
      html += '<h3 class="m-title">Por enviar</h3>';
      var byPid = {};
      drafts.forEach(function (i) { (byPid[i.pid] = byPid[i.pid] || []).push(i); });
      Object.keys(byPid).forEach(function (pid) {
        html += '<div class="m-group"><div class="m-who">' + esc(byPid[pid][0].who) +
          (me && pid === me.pid ? ' <span>(tú)</span>' : '') + '</div>' + byPid[pid].map(lineDraft).join('') + '</div>';
      });
    } else if (!sess.round) {
      html += '<p class="m-empty">Todavía no hay platos. Agrega desde el menú y luego toca <b>Enviar pedido</b>.</p>';
    }

    // rondas ya enviadas
    for (var r = sess.round; r >= 1; r--) {
      var list = items().filter(function (i) { return i.round === r; });
      if (!list.length) continue;
      var st = STATUS[list[0].status] || STATUS.sent;
      html += '<div class="m-round"><div class="m-round-head"><h3 class="m-title">Ronda ' + r + '</h3>' +
        '<span class="pill ' + st[1] + '">' + st[0] + '</span></div>' +
        list.map(function (i) {
          return '<div class="m-item sent"><div class="m-name">' + i.qty + '× ' + esc(i.name) + ' <small>' + esc(i.who) + '</small></div>' +
            '<div class="m-price">' + Store.fmtUSD(i.price * i.qty) + '</div></div>';
        }).join('') + '</div>';
    }
    body.innerHTML = html;

    var t = totals();
    var billAsked = sess.calls && sess.calls.bill;
    $('#mFoot').innerHTML =
      '<div class="m-total"><span>Total de la mesa</span><span class="dual"><b>' + Store.fmtUSD(t.usd) + '</b>' +
      (Store.rate().value > 0 ? '<small>' + Store.fmtBs(t.bs) + '</small>' : '') + '</span></div>' +
      (billAsked
        ? '<p class="m-note">Cuenta solicitada. El mesero se acerca a tu mesa.</p>'
        : '<button type="button" class="btn primary block lg" data-act="send"' + (drafts.length ? '' : ' disabled') + '>Enviar pedido</button>') +
      '<div class="m-quick">' + quickButtons() + '</div>';
    paintMenu();
  }

  /* =====================================================
     Mesero y cuenta
     ===================================================== */
  var QUICK = ['waiter', 'waiter-cancel', 'bill', 'bill-cancel', 'order'];

  function calls() { return (sess && sess.calls) || {}; }

  /* tarjeta "Tu mesero" (se asigna al enviar el primer pedido y dura toda la estadía) */
  function waiterCard() {
    var w = sess && sess.waiter;
    return w
      ? '<div class="waiter-card"><span class="wc-ava">' + esc(w.name.charAt(0).toUpperCase()) + '</span>' +
        '<div><small>Tu mesero</small><b>' + esc(w.name) + '</b></div></div>'
      : '<p class="waiter-pending">Te asignaremos un mesero cuando envíes tu primer pedido.</p>';
  }
  function ago(at) {
    var m = Math.max(0, Math.round((Date.now() - at) / 60000));
    return m < 1 ? 'hace un momento' : 'hace ' + m + (m === 1 ? ' minuto' : ' minutos');
  }

  function quickButtons() {
    var c = calls();
    return (c.waiter
        ? '<button type="button" class="btn ghost on" data-act="waiter-cancel">🛎️ Mesero avisado · cancelar</button>'
        : '<button type="button" class="btn ghost" data-act="waiter">🛎️ Llamar al mesero</button>') +
      (c.bill
        ? '<button type="button" class="btn ghost on" data-act="bill-cancel">🧾 Cuenta pedida · cancelar</button>'
        : '<button type="button" class="btn ghost" data-act="bill">🧾 Pedir la cuenta</button>');
  }

  function onAction(act) {
    if (!me) return;
    if (act === 'order') { ui.closeSheet(); openOrder(); return; }
    if (act === 'waiter') {
      Live.callWaiter(me.tableId, me.pid).then(function () {
        ui.toast('Avisamos a ' + (sess && sess.waiter ? sess.waiter.name : 'un mesero') + ' · va para tu mesa');
      });
    } else if (act === 'waiter-cancel') {
      Live.dismissCall(me.tableId, 'waiter').then(function () { ui.toast('Llamado cancelado'); });
    } else if (act === 'bill') {
      openBill();
    } else if (act === 'bill-cancel') {
      Live.dismissCall(me.tableId, 'bill').then(function () { ui.toast('Ya puedes seguir pidiendo'); });
    }
  }

  /* ---------- menú ☰ de la mesa ---------- */
  function openMenu() {
    if (!isActive || !me) return;
    var node = ui.openSheet('<div class="sheet-pad">' + ui.closeBtn() +
      '<p class="eyebrow">' + esc(tableLabel(me.tableId)).toUpperCase() + '</p>' +
      '<h2>Hola, ' + esc(me.name) + '</h2><div id="mMenuBody"></div></div>', { cls: 'narrow' });
    node.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) onAction(b.dataset.act);
    });
    paintMenu();
  }

  function actionRow(act, icon, title, sub, on) {
    return '<button type="button" class="m-action' + (on ? ' on' : '') + '" data-act="' + act + '">' +
      '<span class="ma-ico">' + icon + '</span><span class="ma-txt"><b>' + title + '</b><small>' + sub + '</small></span></button>';
  }

  function paintMenu() {
    var box = document.getElementById('mMenuBody');
    if (!box || !sess) return;
    var c = calls(), t = totals();
    box.innerHTML = waiterCard() +
      actionRow('order', '🍽️', 'Ver pedido de la mesa', t.count ? t.count + (t.count === 1 ? ' plato · ' : ' platos · ') + Store.fmtUSD(t.usd) : 'Todavía no hay platos', false) +
      (c.waiter
        ? actionRow('waiter-cancel', '🛎️', 'Mesero avisado', ago(c.waiter.at) + ' · toca para cancelar', true)
        : actionRow('waiter', '🛎️', 'Llamar al mesero', 'Un mesero se acerca a tu mesa', false)) +
      (c.bill
        ? actionRow('bill-cancel', '🧾', 'Cuenta solicitada', ago(c.bill.at) + ' · toca para cancelar', true)
        : actionRow('bill', '🧾', 'Pedir la cuenta', 'Ver el total y avisar al mesero', false));
  }

  /* ---------- pedir la cuenta ---------- */
  function openBill() {
    if (!sess) return;
    var sent = items().filter(function (i) { return i.status !== 'draft'; });
    var drafts = items().filter(function (i) { return i.status === 'draft'; });
    var total = 0, dishes = 0;
    sent.forEach(function (i) { total += i.price * i.qty; dishes += i.qty; });
    var r = Store.rate().value;

    var node = ui.openSheet('<div class="sheet-pad">' + ui.closeBtn() +
      '<p class="eyebrow">' + esc(tableLabel(me.tableId)).toUpperCase() + '</p><h2>Pedir la cuenta</h2>' +
      (sent.length
        ? '<p class="muted" style="margin:0 0 12px">' + dishes + (dishes === 1 ? ' plato pedido' : ' platos pedidos') + ' · la cuenta es una sola para toda la mesa.</p>' +
          '<div class="m-total"><span>Total de la mesa</span><span class="dual"><b>' + Store.fmtUSD(total) + '</b>' +
          (r > 0 ? '<small>' + Store.fmtBs(total * r) + '</small>' : '') + '</span></div>' +
          (drafts.length ? '<p class="m-warn">Tienes platos por enviar que no están incluidos en esta cuenta.</p>' : '') +
          '<button type="button" class="btn primary block lg" id="bConfirm">Pedir la cuenta</button>'
        : '<p class="m-empty">Todavía no han pedido nada, así que no hay cuenta que pedir.</p>') +
      '<button type="button" class="link-btn" data-close style="margin:10px auto 0;display:block">Volver</button></div>', { cls: 'narrow' });

    var ok = document.getElementById('bConfirm');
    if (ok) ok.addEventListener('click', function () {
      ok.disabled = true;
      Live.requestBill(me.tableId, me.pid).then(function () {
        ui.closeSheet();
        ui.toast('Cuenta solicitada · el mesero se acerca');
      });
    });
  }

  window.Mesa = {
    start: start, stop: stop, active: function () { return isActive && !!me; },
    add: add, qty: qty, whoTag: whoTag, totals: totals,
    openOrder: openOrder, openMenu: openMenu, tableLabel: tableLabel
  };
})();