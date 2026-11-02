/* =====================================================
   admin-cierres.js — Pestaña «Ventas y cierres» del panel
   Resumen de lo vendido (todas las cajas) a partir de los cierres de caja guardados,
   más lo que aún está sin cerrar. Exporta a Excel (CSV) y define cuánto tiempo se guarda el historial.
   ===================================================== */
(function () {
  'use strict';
  var K = window.AdminKit; if (!K) return;
  var $ = K.$, esc = K.esc, tabs = K.tabs;
  var METHODS = [['usd', '💵', 'Efectivo $', 'USD'], ['bs', '💰', 'Efectivo Bs', 'Bs'], ['pm', '📱', 'Pago móvil', 'Bs'], ['pos', '💳', 'Punto de venta', 'Bs']];
  var PERIODS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']];
  var period = 'hoy';

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function usd(n) { return '$' + r2(n).toFixed(2); }
  function bs(n) { return 'Bs ' + r2(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function tz() { return Store.config().timezone || 'America/Caracas'; }
  function dt(ms) { try { return new Date(ms).toLocaleString('es-VE', { timeZone: tz(), day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return new Date(ms).toLocaleString(); } }
  function dayOf(ms) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }

  function range() {
    var now = Date.now(), today = dayOf(now);
    if (period === 'todo') return { from: 0, to: Infinity };
    if (period === 'hoy') return { from: now - 36 * 3600e3, to: Infinity, day: today };
    if (period === 'ayer') return { from: now - 60 * 3600e3, to: Infinity, day: dayOf(now - 86400000) };
    var d = Number(period) || 7;
    return { from: now - d * 86400000, to: Infinity };
  }
  function inRange(c, r) {
    if (r.day) return c.day === r.day;
    return c.to >= r.from && c.to <= r.to;
  }

  function summarize(list) {
    var t = { orders: 0, usd: 0, bs: 0, voids: 0, voidUSD: 0, deliv: 0, delivUSD: 0, by: {}, cajas: {}, days: {}, expU: 0, expB: 0, cntU: 0, cntB: 0, diffN: 0 };
    METHODS.forEach(function (m) { t.by[m[0]] = { n: 0, amt: 0, usd: 0 }; });
    list.forEach(function (c) {
      t.orders += c.orders || 0; t.usd += c.totalUSD || 0; t.bs += c.totalBs || 0;
      t.voids += (c.voids && c.voids.n) || 0; t.voidUSD += (c.voids && c.voids.usd) || 0;
      t.deliv += (c.delivery && c.delivery.n) || 0; t.delivUSD += (c.delivery && c.delivery.usd) || 0;
      METHODS.forEach(function (m) { var b = (c.by || {})[m[0]]; if (b) { t.by[m[0]].n += b.n || 0; t.by[m[0]].amt += b.amt || 0; t.by[m[0]].usd += b.usd || 0; } });
      var cn = (c.caja && (c.caja.name || c.caja.id)) || '—', cj = t.cajas[cn] = t.cajas[cn] || { orders: 0, usd: 0, bs: 0, closes: 0 };
      cj.orders += c.orders || 0; cj.usd += c.totalUSD || 0; cj.bs += c.totalBs || 0; cj.closes++;
      var dk = c.day || dayOf(c.to), dd = t.days[dk] = t.days[dk] || { orders: 0, usd: 0, bs: 0 };
      dd.orders += c.orders || 0; dd.usd += c.totalUSD || 0; dd.bs += c.totalBs || 0;
      if (c.counted) {
        if (c.counted.usd != null && c.expected) { t.diffN++; t.expU += c.expected.usd; t.cntU += c.counted.usd; }
        if (c.counted.bs != null && c.expected) { t.expB += c.expected.bs; t.cntB += c.counted.bs; }
      }
    });
    return t;
  }

  function stat(label, value, sub) {
    return '<div style="background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:12px 14px"><small style="color:var(--muted)">' + label +
      '</small><div style="font:700 22px var(--font-display);margin-top:2px">' + value + '</div>' + (sub ? '<small style="color:var(--muted)">' + sub + '</small>' : '') + '</div>';
  }

  tabs.cierres = function (box) {
    box.innerHTML = K.head('Ventas y cierres') + '<p class="a-sub">Cargando…</p>';
    var r = range();
    Promise.all([
      DB.list('closings', r.from ? { field: 'to', since: r.from } : undefined).catch(function () { return {}; }),
      DB.list('sales').catch(function () { return {}; })
    ]).then(function (res) {
      var all = Object.keys(res[0] || {}).map(function (k) { return res[0][k]; }).filter(function (c) { return inRange(c, r); }).sort(function (a, b) { return b.to - a.to; });
      var open = Object.keys(res[1] || {}).map(function (k) { return res[1][k]; }).filter(function (s) { return !s.void; });
      var t = summarize(all), keep = Number(Store.config().closingRetentionDays) || 395;
      var openUSD = open.reduce(function (n, s) { return n + (s.totalUSD || 0); }, 0);

      var h = K.head('Ventas y cierres') +
        '<p class="a-sub">Lo vendido y cerrado en todas las cajas. Cada vez que una caja cierra, su resumen queda aquí.</p>' +
        '<div class="actions" style="margin-bottom:12px;flex-wrap:wrap">' + PERIODS.map(function (p) {
          return '<button class="btn sm' + (p[0] === period ? ' primary' : '') + '" data-p="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '<button class="btn sm" data-csv style="margin-left:auto">⬇️ Descargar Excel (CSV)</button></div>';
      if (open.length) h += '<div class="info-box" style="margin-bottom:12px"><b>Sin cerrar todavía:</b> ' + open.length + ' venta(s) por ' + usd(openUSD) + ' en las cajas. Se suman aquí cuando cada caja haga su cierre.</div>';

      if (!all.length) {
        h += '<div class="empty-box">No hay cierres de caja en este período.</div>';
      } else {
        h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
          stat('Total vendido', usd(t.usd), bs(t.bs)) + stat('Órdenes', String(t.orders), t.deliv ? t.deliv + ' de delivery (' + usd(t.delivUSD) + ')' : '') +
          stat('Anuladas', String(t.voids), t.voids ? usd(t.voidUSD) : '') + stat('Cierres', String(all.length), '') + '</div>';

        h += '<div class="panel"><h3>Cómo pagaron</h3><div class="list">' + METHODS.map(function (m) {
          var b = t.by[m[0]];
          return '<div class="item"><div class="ico">' + m[1] + '</div><div class="main"><b>' + m[2] + '</b><small>' + b.n + ' pago(s)</small></div>' +
            '<div style="text-align:right"><b>' + (m[3] === 'USD' ? usd(b.amt) : bs(b.amt)) + '</b>' + (m[3] === 'USD' ? '' : '<br><small>≈ ' + usd(b.usd) + '</small>') + '</div></div>';
        }).join('') + '</div></div>';

        h += '<div class="panel"><h3>Por caja</h3><div class="list">' + Object.keys(t.cajas).sort().map(function (n) {
          var c = t.cajas[n];
          return '<div class="item"><div class="ico">🧾</div><div class="main"><b>' + esc(n) + '</b><small>' + c.orders + ' orden(es) · ' + c.closes + ' cierre(s)</small></div>' +
            '<div style="text-align:right"><b>' + usd(c.usd) + '</b><br><small>' + bs(c.bs) + '</small></div></div>';
        }).join('') + '</div></div>';

        var days = Object.keys(t.days).sort().reverse();
        if (days.length > 1) h += '<div class="panel"><h3>Por día</h3><div class="list">' + days.map(function (d) {
          var x = t.days[d];
          return '<div class="item"><div class="ico">📅</div><div class="main"><b>' + esc(d) + '</b><small>' + x.orders + ' orden(es)</small></div>' +
            '<div style="text-align:right"><b>' + usd(x.usd) + '</b><br><small>' + bs(x.bs) + '</small></div></div>';
        }).join('') + '</div></div>';

        if (t.diffN || t.cntB) {
          var dU = r2(t.cntU - t.expU), dB = r2(t.cntB - t.expB);
          h += '<div class="panel"><h3>Cuadre de efectivo</h3><p class="help">Lo que contaron las cajas al cerrar contra lo que debía haber. ' +
            'Dólares: <b>' + (dU === 0 ? 'cuadra' : (dU > 0 ? 'sobran ' : 'faltan ') + usd(Math.abs(dU))) + '</b> · Bolívares: <b>' + (dB === 0 ? 'cuadra' : (dB > 0 ? 'sobran ' : 'faltan ') + bs(Math.abs(dB))) + '</b></p></div>';
        }

        h += '<div class="panel"><h3>Cierres</h3><div class="list">' + all.map(function (c) {
          var diff = '';
          if (c.counted && c.expected) {
            var a = c.counted.usd != null ? r2(c.counted.usd - c.expected.usd) : null, b = c.counted.bs != null ? r2(c.counted.bs - c.expected.bs) : null;
            diff = [a != null ? (a === 0 ? '$ cuadra' : '$ ' + (a > 0 ? '+' : '') + a.toFixed(2)) : '', b != null ? (b === 0 ? 'Bs cuadra' : 'Bs ' + (b > 0 ? '+' : '') + b.toFixed(2)) : ''].filter(Boolean).join(' · ');
          }
          return '<div class="item"><div class="ico">🔒</div><div class="main"><b>' + esc((c.caja && (c.caja.name || c.caja.id)) || '—') + ' · ' + dt(c.to) + '</b>' +
            '<small>' + (c.orders || 0) + ' orden(es)' + (c.voids && c.voids.n ? ' · ' + c.voids.n + ' anulada(s)' : '') + (diff ? ' · ' + esc(diff) : '') + '</small></div>' +
            '<div style="text-align:right"><b>' + usd(c.totalUSD) + '</b><br><small>' + bs(c.totalBs) + '</small></div></div>';
        }).join('') + '</div></div>';
      }

      h += '<div class="panel"><h3>Cuánto tiempo se guarda el historial</h3><p class="help">Solo se guardan los resúmenes de cada cierre (sin nombres ni platos). Los más viejos se borran solos al entrar al panel. ' +
        'Recomendado: 13 meses (395 días) para poder comparar con el año pasado.</p>' +
        '<div class="actions"><input type="number" id="cvKeep" min="30" max="3650" value="' + keep + '" style="width:120px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px"> <span style="align-self:center">días</span>' +
        '<button class="btn" id="cvSave">Guardar</button></div></div>';
      box.innerHTML = h;

      box.onclick = function (e) {
        var p = e.target.closest('[data-p]');
        if (p) { period = p.dataset.p; tabs.cierres(box); return; }
        if (e.target.closest('[data-csv]')) csv(all);
        if (e.target.closest('#cvSave')) {
          var n = Math.max(30, Math.min(3650, Math.round(Number($('#cvKeep', box).value) || 395)));
          K.saveData(function (d) { d.config.closingRetentionDays = n; }, 'Guardado ✓').then(function () { tabs.cierres(box); });
        }
      };
    });
  };

  function csv(list) {
    var q = function (v) { v = String(v == null ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['Fecha', 'Caja', 'Ordenes', 'Total USD', 'Total Bs', 'Efectivo USD', 'Efectivo Bs', 'Pago movil (Bs)', 'Punto de venta (Bs)', 'Delivery', 'Anuladas', 'Esperado USD', 'Contado USD', 'Esperado Bs', 'Contado Bs']];
    list.slice().reverse().forEach(function (c) {
      var by = c.by || {}, g = function (k) { return by[k] ? r2(by[k].amt) : 0; };
      rows.push([dt(c.to), (c.caja && (c.caja.name || c.caja.id)) || '', c.orders || 0, r2(c.totalUSD), r2(c.totalBs), g('usd'), g('bs'), g('pm'), g('pos'),
        (c.delivery && c.delivery.n) || 0, (c.voids && c.voids.n) || 0, c.expected ? c.expected.usd : '', c.counted && c.counted.usd != null ? c.counted.usd : '',
        c.expected ? c.expected.bs : '', c.counted && c.counted.bs != null ? c.counted.bs : '']);
    });
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(';'); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cierres-' + dayOf(Date.now()) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
})();