/* =====================================================
   caja-cierre.js — Cobro de cuentas y cierre de caja (caja.html)

   • Cobrar: la caja registra cómo pagó la mesa (efectivo $, efectivo Bs, pago móvil, punto de venta;
     se pueden combinar). Se guarda UNA venta (sin nombres ni platos) y la mesa se libera.
   • Varias cajas: cada venta queda marcada con el usuario de la caja que cobró, y cada caja cierra
     solo lo suyo. Si dos cajas intentan cobrar la misma mesa, solo la primera lo logra.
   • Cierre: suma las ventas de esa caja, calcula el efectivo esperado, compara con lo contado,
     guarda un resumen y manda el comprobante a la impresora (58 u 80 mm).
   • Privacidad: al cerrar se borra el detalle de cada venta; queda solo el resumen.
   ===================================================== */
(function () {
  'use strict';
  var K = window.CajaKit; if (!K) return;
  var $ = K.$, esc = K.esc;

  var METHODS = [
    { id: 'usd', label: 'Efectivo $',     cur: 'USD', icon: '💵' },
    { id: 'bs',  label: 'Efectivo Bs',    cur: 'Bs',  icon: '💰' },
    { id: 'pm',  label: 'Pago móvil',     cur: 'Bs',  icon: '📱' },
    { id: 'pos', label: 'Punto de venta', cur: 'Bs',  icon: '💳' }
  ];
  var MBYID = {}; METHODS.forEach(function (m) { MBYID[m.id] = m; });
  var PRINT_KEY = 'fogon_print_w';

  var sales = {}, closings = {}, started = false;
  var counted = { usd: '', bs: '' };
  var printW = '80';
  try { printW = localStorage.getItem(PRINT_KEY) === '58' ? '58' : '80'; } catch (e) {}

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function usd(n) { return Store.fmtUSD(n); }
  function bs(n) { return Store.fmtBs(n); }
  function me() { var s = K.session() || {}; return { id: s.user || '?', name: s.name || s.user || '?' }; }
  function tz() { return Store.config().timezone || 'America/Caracas'; }
  function hhmm(ms) { try { return new Date(ms).toLocaleTimeString('es-VE', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } }
  function ddmm(ms) { try { return new Date(ms).toLocaleDateString('es-VE', { timeZone: tz(), day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } }

  /* =====================================================
     Datos
     ===================================================== */
  function start() {
    if (started) return; started = true;
    DB.watchCollection('sales', function (all) { sales = all || {}; K.repaint(); });
    loadClosings();
  }
  function loadClosings() {
    return DB.list('closings', { field: 'to', since: Date.now() - 45 * 86400000 }).then(function (m) { closings = m || {}; K.repaint(); }).catch(function () {});
  }
  function closedIds() {
    var o = {};
    Object.keys(closings).forEach(function (k) { (closings[k].saleIds || []).forEach(function (id) { o[id] = 1; }); });
    return o;
  }
  /* ventas abiertas de ESTA caja (si un cierre se cortó a medias, las ya cerradas no se cuentan) */
  function mySales() {
    var mine = me().id, done = closedIds();
    return Object.keys(sales).map(function (k) { return sales[k]; }).filter(function (s) {
      return s.caja && s.caja.id === mine && !done[s.id];
    }).sort(function (a, b) { return a.at - b.at; });
  }

  function totals(list) {
    var t = { orders: 0, totalUSD: 0, totalBs: 0, by: {}, change: { usd: 0, bs: 0 }, voids: { n: 0, usd: 0 }, from: 0 };
    METHODS.forEach(function (m) { t.by[m.id] = { n: 0, amt: 0, usd: 0 }; });
    list.forEach(function (s) {
      if (s.void) { t.voids.n++; t.voids.usd += s.totalUSD; return; }
      t.orders++; t.totalUSD += s.totalUSD; t.totalBs += s.totalBs;
      if (!t.from || s.at < t.from) t.from = s.at;
      (s.payments || []).forEach(function (p) { var b = t.by[p.m]; if (b) { b.n++; b.amt += p.amt; b.usd += p.usd; } });
      if (s.change && t.change[s.change.m] != null) t.change[s.change.m] += s.change.amt;
    });
    t.totalUSD = r2(t.totalUSD); t.totalBs = r2(t.totalBs); t.voids.usd = r2(t.voids.usd);
    METHODS.forEach(function (m) { t.by[m.id].amt = r2(t.by[m.id].amt); t.by[m.id].usd = r2(t.by[m.id].usd); });
    t.change.usd = r2(t.change.usd); t.change.bs = r2(t.change.bs);
    t.expected = { usd: r2(t.by.usd.amt - t.change.usd), bs: r2(t.by.bs.amt - t.change.bs) };
    return t;
  }

  /* =====================================================
     Cobrar una mesa
     ===================================================== */
  function openPay(tid) {
    var s = K.sessions()[tid];
    if (!s) { K.toast('Esa mesa ya no está ocupada.'); return; }
    var total = r2(K.tableTotal(s));
    if (!(total > 0)) { K.toast('Esta mesa no tiene consumo. Usa «Liberar sin cobrar».'); return; }
    var rate = Store.rate().value || 0;

    var m = K.modal('<button type="button" class="cj-x" data-x="close" aria-label="Cerrar">✕</button>' +
      '<h3>Cobrar · ' + esc(K.tableLabel(tid)) + '</h3>' +
      '<div class="pay-total"><b>' + usd(total) + '</b>' + (rate > 0 ? '<span>' + bs(total * rate) + '</span>' : '') + '</div>' +
      (rate > 0 ? '<p class="cj-hint">Tasa: Bs ' + rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' por $1</p>'
                : '<div class="cj-alert warn">No hay tasa del dólar. Solo puedes cobrar en dólares hasta que la pongas en el panel (pestaña Tasa).</div>') +
      '<p class="cj-hint">Escribe lo que recibiste. Si pagan combinado, llena varios. Toca «Todo» para completar lo que falta.</p>' +
      METHODS.map(function (x) {
        var off = x.cur === 'Bs' && !(rate > 0);
        return '<div class="pay-row' + (off ? ' off' : '') + '"><label for="pay_' + x.id + '"><span>' + x.icon + '</span> ' + x.label + '<small>' + (x.cur === 'USD' ? 'en dólares' : 'en bolívares') + '</small></label>' +
          '<input id="pay_' + x.id + '" data-m="' + x.id + '" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"' + (off ? ' disabled' : '') + '>' +
          '<button type="button" class="cj-btn sm" data-all="' + x.id + '"' + (off ? ' disabled' : '') + '>Todo</button></div>';
      }).join('') +
      '<div class="pay-sum" id="paySum"></div>' +
      '<div id="payChange"></div>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="close">Cancelar</button>' +
      '<button type="button" class="cj-btn primary" id="payOk" disabled>Confirmar cobro</button></div>');

    function read() {
      var lines = [], got = 0;
      METHODS.forEach(function (x) {
        var amt = r2(num($('#pay_' + x.id, m).value));
        if (amt > 0) { var u = x.cur === 'USD' ? amt : (rate > 0 ? amt / rate : 0); lines.push({ m: x.id, amt: amt, usd: r2(u) }); got += u; }
      });
      return { lines: lines, got: got };
    }
    function recalc() {
      var r = read(), diff = r2(r.got - total), ok = r.got > 0 && diff >= -0.005;
      var sum = $('#paySum', m);
      sum.className = 'pay-sum ' + (ok ? 'ok' : 'miss');
      sum.innerHTML = '<span>Recibido: <b>' + usd(r.got) + '</b></span>' + (ok
        ? (diff > 0.005 ? '<span>Vuelto: <b>' + usd(diff) + '</b></span>' : '<span><b>✔ Exacto</b></span>')
        : '<span>Falta: <b>' + usd(Math.max(0, total - r.got)) + '</b>' + (rate > 0 ? ' · ' + bs(Math.max(0, total - r.got) * rate) : '') + '</span>');
      var ch = $('#payChange', m);
      if (ok && diff > 0.005) {
        var keep = $('input[name=chM]:checked', m); var cur = keep ? keep.value : (r.lines.some(function (l) { return l.m === 'usd'; }) || !(rate > 0) ? 'usd' : 'bs');
        ch.innerHTML = '<p class="cj-lbl">El vuelto lo entregas en:</p><div class="pay-ch">' +
          '<label><input type="radio" name="chM" value="usd"' + (cur === 'usd' ? ' checked' : '') + '> Efectivo $ · ' + usd(diff) + '</label>' +
          (rate > 0 ? '<label><input type="radio" name="chM" value="bs"' + (cur === 'bs' ? ' checked' : '') + '> Efectivo Bs · ' + bs(diff * rate) + '</label>' : '') + '</div>';
      } else ch.innerHTML = '';
      $('#payOk', m).disabled = !ok;
    }
    m.addEventListener('input', recalc);
    m.addEventListener('change', function (e) { if (e.target.name === 'chM') recalc(); });
    m.addEventListener('click', function (e) {
      var all = e.target.closest('[data-all]');
      if (all) {
        var x = MBYID[all.dataset.all], inp = $('#pay_' + x.id, m);
        inp.value = ''; var rest = Math.max(0, total - read().got);
        if (rest > 0) inp.value = (x.cur === 'USD' ? rest : rest * rate).toFixed(2);
        recalc(); return;
      }
      if (e.target.closest('[data-x="close"]')) { K.closeModal(); return; }
      if (e.target.id === 'payOk') confirm();
    });
    function confirm() {
      var r = read(), diff = r2(r.got - total), change = null;
      if (diff > 0.005) {
        var c = $('input[name=chM]:checked', m), cm = c ? c.value : 'usd';
        change = { m: cm, amt: cm === 'usd' ? diff : r2(diff * rate) };
      }
      var btn = $('#payOk', m); btn.disabled = true; btn.textContent = 'Guardando…';
      paySale(tid, total, rate, r, change).then(function () {
        K.closeModal(); K.toast('Cobrado · ' + K.tableLabel(tid) + ' liberada');
      }).catch(function (ex) { K.toast(ex.message || 'No se pudo registrar el cobro.'); K.closeModal(); });
    }
    $('#pay_usd', m).focus();
    recalc();
  }

  function paySale(tid, total, rate, got, change) {
    var s = K.sessions()[tid];
    if (!s) return Promise.reject(new Error('La mesa ya fue cobrada.'));
    var who = me(), plates = 0;
    (s.items || []).forEach(function (i) { if (i.status !== 'draft') plates += i.qty; });
    var id = 'v' + s.openedAt + '_' + String(tid);
    var sale = {
      id: id, tableId: String(tid), tableLabel: K.tableLabel(tid), waiter: s.waiter ? s.waiter.name : '',
      caja: { id: who.id, name: who.name }, at: Date.now(), day: Live.dayKey(), rate: rate,
      totalUSD: total, totalBs: r2(total * rate), plates: plates, payments: got.lines, receivedUSD: r2(got.got),
      change: change, void: false
    };
    var created = false;
    return DB.update('sales', id, function (cur) {
      created = false;
      if (cur) return undefined;                      // ya la cobró otra caja
      created = true; return sale;
    }).then(function () {
      if (!created) throw new Error('Esta cuenta ya fue cobrada desde otra caja.');
      return Live.release(tid);
    });
  }

  /* =====================================================
     Pestaña «Cierre de caja»
     ===================================================== */
  function methodRows(t) {
    return METHODS.map(function (x) {
      var b = t.by[x.id];
      return '<tr><td>' + x.icon + ' ' + x.label + ' <small>(' + b.n + ')</small></td><td class="r">' + (x.cur === 'USD' ? usd(b.amt) : bs(b.amt)) + '</td><td class="r muted">' + (x.cur === 'USD' ? '' : usd(b.usd)) + '</td></tr>';
    }).join('');
  }

  function html() {
    var who = me(), list = mySales(), t = totals(list);
    var pendingBills = Object.keys(K.sessions()).filter(function (k) { var s = K.sessions()[k]; return s.calls && s.calls.bill; }).length;
    var isAdmin = (K.session() || {}).role === 'admin';
    var h = '<div class="cc-head"><div><h2>Cierre de caja</h2><p class="cj-hint">Caja: <b>' + esc(who.name) + '</b>' + (who.name !== who.id ? ' (' + esc(who.id) + ')' : '') +
      ' · cada caja cierra solo sus propias ventas</p></div></div>';

    if (list.length && ddmm(list[0].at) !== ddmm(Date.now())) {
      h += '<div class="cj-alert warn">Tienes ventas desde el <b>' + ddmm(list[0].at) + '</b> sin cerrar. Al cerrar se incluyen todas.</div>';
    }
    if (pendingBills) h += '<div class="cj-alert warn">Hay ' + pendingBills + ' cuenta(s) pedida(s) sin cobrar. Cóbralas antes de cerrar si ya pagaron.</div>';

    if (!list.length) {
      h += '<div class="cj-empty"><div>🧾</div><h3>Sin ventas por cerrar</h3><p>Cuando cobres mesas aparecerán aquí hasta que cierres la caja.</p></div>';
    } else {
      h += '<div class="cc-big"><div><small>Órdenes atendidas</small><b>' + t.orders + '</b></div>' +
        '<div><small>Total en dólares</small><b>' + usd(t.totalUSD) + '</b></div>' +
        '<div><small>Total en bolívares</small><b>' + bs(t.totalBs) + '</b></div></div>' +
        '<div class="cc-card"><h4>Cobrado por método</h4><table class="cc-t"><thead><tr><th></th><th class="r">Recibido</th><th class="r">Equivale</th></tr></thead><tbody>' + methodRows(t) +
        '<tr class="sep"><td>Vuelto entregado</td><td class="r">' + (t.change.usd ? '−' + usd(t.change.usd) : '') + (t.change.usd && t.change.bs ? ' · ' : '') + (t.change.bs ? '−' + bs(t.change.bs) : '') + (!t.change.usd && !t.change.bs ? '—' : '') + '</td><td></td></tr>' +
        (t.voids.n ? '<tr><td>Ventas anuladas</td><td class="r">' + t.voids.n + ' · ' + usd(t.voids.usd) + '</td><td></td></tr>' : '') +
        '</tbody></table></div>' +
        '<div class="cc-card"><h4>Efectivo que debe haber en caja</h4>' +
        '<div class="cc-exp"><span>Dólares: <b>' + usd(t.expected.usd) + '</b></span><span>Bolívares: <b>' + bs(t.expected.bs) + '</b></span></div>' +
        '<p class="cj-hint">Opcional: escribe lo que contaste para ver si cuadra.</p>' +
        '<div class="cc-count"><div><label for="cjCntUsd">Dólares contados</label><input id="cjCntUsd" type="text" inputmode="decimal" value="' + esc(counted.usd) + '" placeholder="0.00"><div class="cc-diff" id="cjDiffUsd"></div></div>' +
        '<div><label for="cjCntBs">Bolívares contados</label><input id="cjCntBs" type="text" inputmode="decimal" value="' + esc(counted.bs) + '" placeholder="0.00"><div class="cc-diff" id="cjDiffBs"></div></div></div></div>' +
        '<div class="cj-actions"><button type="button" class="cj-btn primary lg" data-a="cc-close">🔒 Cerrar caja e imprimir comprobante</button></div>' +
        '<h4 class="cj-sub">Ventas por cerrar (' + list.length + ')</h4><div class="cj-list">' + list.slice().reverse().map(function (s) {
          return '<div class="cj-line' + (s.void ? ' void' : '') + '"><div><b>' + esc(s.tableLabel) + '</b> · ' + hhmm(s.at) +
            '<small>' + (s.payments || []).map(function (p) { return (MBYID[p.m] || {}).icon + ' ' + (MBYID[p.m] || {}).label; }).join(' + ') + (s.void ? ' · ANULADA' : '') + '</small></div>' +
            '<b>' + usd(s.totalUSD) + '</b>' + (s.void ? '' : '<button type="button" class="cj-btn sm danger" data-a="cc-void" data-id="' + esc(s.id) + '">Anular</button>') + '</div>';
        }).join('') + '</div>';
    }

    /* cierres anteriores */
    var past = Object.keys(closings).map(function (k) { return closings[k]; }).filter(function (c) { return isAdmin || (c.caja && c.caja.id === who.id); })
      .sort(function (a, b) { return b.to - a.to; });
    h += '<h4 class="cj-sub">Cierres anteriores (últimos 45 días)</h4>' + (past.length ? '<div class="cj-list">' + past.slice(0, 40).map(function (c) {
      return '<div class="cj-line"><div><b>' + ddmm(c.to) + ' ' + hhmm(c.to) + '</b> · ' + esc(c.caja ? c.caja.name : '') +
        '<small>' + c.orders + ' órdenes · ' + usd(c.totalUSD) + ' · ' + bs(c.totalBs) + '</small></div>' +
        '<button type="button" class="cj-btn sm" data-a="cc-reprint" data-id="' + esc(c.id) + '">🖨 Reimprimir</button></div>';
    }).join('') + '</div>' : '<p class="cj-hint">Todavía no hay cierres guardados.</p>');

    /* impresora */
    h += '<div class="cc-card"><h4>Impresora térmica</h4><div class="cc-print"><label for="cjW2">Ancho del papel</label>' +
      '<select id="cjW2" class="cj-select"><option value="80"' + (printW === '80' ? ' selected' : '') + '>80 mm (la más común)</option><option value="58"' + (printW === '58' ? ' selected' : '') + '>58 mm</option></select>' +
      '<button type="button" class="cj-btn" data-a="cc-preview">🖨 Imprimir resumen actual (sin cerrar)</button></div>' +
      '<p class="cj-hint">Se imprime con la impresora instalada en este equipo. En el celular, elige tu impresora (o «Guardar como PDF») en la ventana de impresión.</p></div>';
    return h;
  }

  function updateDiffs() {
    var list = mySales(), t = totals(list);
    [['usd', 'Usd', usd], ['bs', 'Bs', bs]].forEach(function (x) {
      var el = $('#cjDiff' + x[1]), v = counted[x[0]];
      if (!el) return;
      if (String(v).trim() === '') { el.textContent = ''; el.className = 'cc-diff'; return; }
      var d = r2(num(v) - t.expected[x[0]]);
      el.className = 'cc-diff ' + (Math.abs(d) < 0.005 ? 'ok' : 'bad');
      el.textContent = Math.abs(d) < 0.005 ? '✔ Cuadra' : (d > 0 ? 'Sobran ' : 'Faltan ') + x[2](Math.abs(d));
    });
  }
  document.addEventListener('input', function (e) {
    if (e.target.id === 'cjCntUsd') { counted.usd = e.target.value; updateDiffs(); }
    else if (e.target.id === 'cjCntBs') { counted.bs = e.target.value; updateDiffs(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'cjW2') { printW = e.target.value === '58' ? '58' : '80'; try { localStorage.setItem(PRINT_KEY, printW); } catch (x) {} K.toast('Papel de ' + printW + ' mm'); }
  });

  /* =====================================================
     Cerrar caja
     ===================================================== */
  function openClose() {
    var list = mySales(), t = totals(list);
    if (!t.orders && !list.length) { K.toast('No hay ventas para cerrar.'); return; }
    var m = K.modal('<h3>Cerrar caja</h3><p>Vas a cerrar <b>' + t.orders + '</b> orden(es) por <b>' + usd(t.totalUSD) + '</b> · <b>' + bs(t.totalBs) + '</b>.</p>' +
      '<p class="cj-hint">Se imprime el comprobante y se guarda el resumen. El detalle de cada venta se borra. Las ventas de otras cajas no se tocan.</p>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="no">Cancelar</button><button type="button" class="cj-btn primary" data-x="ok">Cerrar e imprimir</button></div>');
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'ok') { b.disabled = true; b.textContent = 'Cerrando…'; doClose(); } else K.closeModal();
    });
  }

  function doClose() {
    var list = mySales(), t = totals(list), who = me(), now = Date.now();
    if (!list.length) { K.closeModal(); return; }
    var hasCount = String(counted.usd).trim() !== '' || String(counted.bs).trim() !== '';
    var cl = {
      id: 'c' + now + '_' + who.id, caja: who, day: Live.dayKey(), from: list[0].at, to: now,
      orders: t.orders, totalUSD: t.totalUSD, totalBs: t.totalBs, by: t.by, change: t.change, voids: t.voids, expected: t.expected,
      counted: hasCount ? { usd: String(counted.usd).trim() === '' ? null : r2(num(counted.usd)), bs: String(counted.bs).trim() === '' ? null : r2(num(counted.bs)) } : null,
      saleIds: list.map(function (s) { return s.id; }),
      lines: list.filter(function (s) { return !s.void; }).slice(0, 300).map(function (s) {
        return { t: s.tableLabel, at: s.at, usd: s.totalUSD, m: (s.payments || []).map(function (p) { return p.m; }).join('+') };
      })
    };
    DB.set('closings', cl.id, cl).then(function () {
      return Promise.all(list.map(function (s) { return DB.remove('sales', s.id); }));
    }).then(function () {
      closings[cl.id] = cl; counted = { usd: '', bs: '' };
      showDone(cl);
      setTimeout(function () { printClosing(cl); }, 250);
    }).catch(function (ex) { K.toast('No se pudo cerrar: ' + (ex.message || 'error')); K.closeModal(); });
  }

  function showDone(cl) {
    var m = K.modal('<h3>✅ Caja cerrada</h3><p><b>' + cl.orders + '</b> órdenes · <b>' + usd(cl.totalUSD) + '</b> · <b>' + bs(cl.totalBs) + '</b></p>' +
      '<p class="cj-hint">Si el comprobante no salió, toca «Imprimir de nuevo».</p>' +
      '<div class="cj-actions"><button type="button" class="cj-btn" data-x="again">🖨 Imprimir de nuevo</button><button type="button" class="cj-btn primary" data-x="done">Listo</button></div>');
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'again') printClosing(cl); else K.closeModal();
    });
    K.repaint();
  }

  /* =====================================================
     Comprobante (impresora térmica)
     ===================================================== */
  function receiptHTML(c, preview) {
    function row(a, b) { return '<div class="rc-row"><span>' + a + '</span><span>' + b + '</span></div>'; }
    var cfg = Store.config(), by = c.by || {};
    var h = '<div class="rc-c rc-b rc-big">' + esc(cfg.name || '') + '</div>' +
      '<div class="rc-c rc-b">' + (preview ? 'RESUMEN (SIN CERRAR)' : 'CIERRE DE CAJA') + '</div>' +
      '<div class="rc-hr"></div>' +
      row('Caja:', esc(c.caja.name)) + row('Fecha:', ddmm(c.to)) + row('Desde:', hhmm(c.from)) + row('Hasta:', hhmm(c.to)) +
      '<div class="rc-hr"></div>' +
      row('<b>Órdenes atendidas</b>', '<b>' + c.orders + '</b>') +
      '<div class="rc-b" style="margin-top:6px">TOTAL GENERADO</div>' +
      row('En dólares', '<b>' + usd(c.totalUSD) + '</b>') + row('En bolívares', '<b>' + bs(c.totalBs) + '</b>') +
      '<div class="rc-hr"></div><div class="rc-b">COBRADO POR MÉTODO</div>' +
      METHODS.map(function (x) {
        var b = by[x.id] || { n: 0, amt: 0 };
        return row(x.label + ' (' + b.n + ')', x.cur === 'USD' ? usd(b.amt) : bs(b.amt));
      }).join('');
    if (c.change && (c.change.usd || c.change.bs)) h += row('Vuelto entregado', (c.change.usd ? '-' + usd(c.change.usd) : '') + (c.change.usd && c.change.bs ? ' ' : '') + (c.change.bs ? '-' + bs(c.change.bs) : ''));
    h += '<div class="rc-hr"></div><div class="rc-b">EFECTIVO EN CAJA</div>' +
      row('Esperado $', usd(c.expected.usd)) + row('Esperado Bs', bs(c.expected.bs));
    if (c.counted) {
      if (c.counted.usd != null) h += row('Contado $', usd(c.counted.usd)) + row('Diferencia $', (r2(c.counted.usd - c.expected.usd) >= 0 ? '+' : '-') + usd(Math.abs(r2(c.counted.usd - c.expected.usd))));
      if (c.counted.bs != null) h += row('Contado Bs', bs(c.counted.bs)) + row('Diferencia Bs', (r2(c.counted.bs - c.expected.bs) >= 0 ? '+' : '-') + bs(Math.abs(r2(c.counted.bs - c.expected.bs))));
    }
    if (c.voids && c.voids.n) h += '<div class="rc-hr"></div>' + row('Anuladas (' + c.voids.n + ')', usd(c.voids.usd));
    h += '<div class="rc-hr"></div>' + row('Cerró:', esc(c.caja.name)) + row('Impreso:', ddmm(Date.now()) + ' ' + hhmm(Date.now())) +
      '<div style="margin-top:22px;border-top:1px solid #000;text-align:center;padding-top:2px">Firma</div><div style="height:14px"></div>';
    return h;
  }

  function printReceipt(c, preview) {
    var old = $('#cjPrint'); if (old) old.remove();
    var oldS = $('#cjPrintCss'); if (oldS) oldS.remove();
    var st = document.createElement('style'); st.id = 'cjPrintCss';
    st.textContent = '@page{size:' + printW + 'mm auto;margin:0}';
    document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'cjPrint'; d.className = 'w' + printW; d.innerHTML = receiptHTML(c, preview);
    document.body.appendChild(d);
    var clean = function () { setTimeout(function () { d.remove(); st.remove(); }, 500); window.removeEventListener('afterprint', clean); };
    window.addEventListener('afterprint', clean);
    try { window.print(); } catch (e) { K.toast('No se pudo abrir la impresión.'); clean(); }
  }
  function printClosing(c) { printReceipt(c, false); }

  function previewClosing() {
    var list = mySales(), t = totals(list), who = me();
    if (!list.length) { K.toast('No hay ventas para imprimir.'); return; }
    printReceipt({ caja: who, from: list[0].at, to: Date.now(), orders: t.orders, totalUSD: t.totalUSD, totalBs: t.totalBs, by: t.by, change: t.change, expected: t.expected, voids: t.voids,
      counted: (String(counted.usd).trim() !== '' || String(counted.bs).trim() !== '') ? { usd: String(counted.usd).trim() === '' ? null : r2(num(counted.usd)), bs: String(counted.bs).trim() === '' ? null : r2(num(counted.bs)) } : null }, true);
  }

  /* =====================================================
     Acciones de la pestaña
     ===================================================== */
  function onAction(a, b) {
    if (a === 'cc-close') { openClose(); return true; }
    if (a === 'cc-preview') { previewClosing(); return true; }
    if (a === 'cc-reprint') { var c = closings[b.dataset.id]; if (c) printClosing(c); return true; }
    if (a === 'cc-void') {
      var id = b.dataset.id, s = sales[id]; if (!s) return true;
      var m = K.modal('<h3>Anular venta</h3><p>' + esc(s.tableLabel) + ' · ' + usd(s.totalUSD) + '. Quedará marcada como <b>anulada</b> y no se suma en el cierre (aparece en el comprobante).</p>' +
        '<div class="cj-actions"><button type="button" class="cj-btn" data-x="no">Cancelar</button><button type="button" class="cj-btn primary" data-x="ok">Anular</button></div>');
      m.addEventListener('click', function (e) {
        var x = e.target.closest('[data-x]'); if (!x) return;
        if (x.dataset.x === 'ok') DB.update('sales', id, function (cur) {
          if (!cur || cur.void) return undefined; cur.void = true; cur.voidAt = Date.now(); cur.voidBy = me().id; return cur;
        }).then(function () { K.toast('Venta anulada'); });
        K.closeModal();
      });
      return true;
    }
    return false;
  }

  window.CajaCierre = { start: start, html: html, after: updateDiffs, openPay: openPay, onAction: onAction, _totals: totals };
})();