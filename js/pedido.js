/* =====================================================
   pedido.js — Datos del cliente y envío del pedido por WhatsApp
   (pedido.html)
   ===================================================== */
(function () {
  'use strict';

  var O = Order, esc = O.esc;
  var CUST_KEY = 'fogon_customer_v1';
  var LAST_KEY = 'fogon_last_order_v1';
  var $ = function (s) { return document.querySelector(s); };

  var gps = null;                       // { lat, lng, acc }
  var isDelivery = true;
  var form;

  /* ---------- datos del cliente guardados en el dispositivo ---------- */
  function readCust() {
    try { return JSON.parse(localStorage.getItem(CUST_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCust() {
    var o = {
      nombre: form.nombre.value.trim(), apellido: form.apellido.value.trim(),
      telefono: form.telefono.value.trim(), direccion: form.direccion.value.trim(), detalle: form.detalle.value.trim()
    };
    try { localStorage.setItem(CUST_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* =====================================================
     Método de pago y monto
     ===================================================== */
  var BS_METHOD = /pago\s*m[oó]vil|bol[ií]var|\bbs\b|punto|transferencia/i;

  function selectedPay() {
    var r = document.querySelector('input[name="pago"]:checked');
    return r ? r.value : '';
  }

  function renderPayList() {
    var methods = Store.config().paymentMethods || [];
    $('#payList').innerHTML = methods.map(function (m, i) {
      return '<label class="pay-opt"><input type="radio" name="pago" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>';
    }).join('') || '<p class="muted">El restaurante aún no configuró métodos de pago.</p>';
  }

  function renderPayTotal() {
    var t = O.totals(), pay = selectedPay(), bsType = BS_METHOD.test(pay);
    $('#payTotal').innerHTML =
      '<div class="lbl">Monto a pagar (en divisa)</div>' +
      '<div class="amt">' + Store.fmtUSD(t.total) + ' <small>USD</small></div>' +
      (t.rate > 0
        ? '<div class="ref' + (bsType ? ' strong' : '') + '">' +
          (bsType ? 'En bolívares: ' + Store.fmtBs(t.totalBs) : 'Equivale a ' + Store.fmtBs(t.totalBs)) +
          ' · tasa Bs ' + t.rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' por $1</div>'
        : '');
  }

  function renderTotals() {
    $('#totals').innerHTML = O.totalsHTML(O.totals(), { totalLabel: 'Total a pagar' });
    $('#btnSend').innerHTML = O.I.chat + '<span>Enviar pedido por WhatsApp</span>';
    renderPayTotal();
  }

  /* =====================================================
     GPS
     ===================================================== */
  function paintGps() {
    var btn = $('#btnGps'), st = $('#gpsStatus');
    if (gps) {
      btn.classList.add('ok');
      $('#gpsLabel').textContent = 'Ubicación capturada';
      st.hidden = false;
      st.innerHTML = 'Precisión aproximada: ' + gps.acc + ' m · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
        gps.lat + ',' + gps.lng + '">Ver en el mapa</a><button type="button" id="gpsClear">Quitar</button>';
      $('#gpsClear').addEventListener('click', function () { gps = null; paintGps(); });
    } else {
      btn.classList.remove('ok');
      $('#gpsLabel').textContent = 'Usar mi ubicación actual (GPS)';
      if (!st.dataset.msg) st.hidden = true;
    }
  }
  function askGps() {
    var st = $('#gpsStatus'), btn = $('#btnGps');
    st.dataset.msg = '';
    if (!navigator.geolocation) {
      st.hidden = false; st.dataset.msg = '1'; st.textContent = 'Tu navegador no permite usar el GPS. Escribe tu dirección.';
      return;
    }
    btn.disabled = true; $('#gpsLabel').textContent = 'Obteniendo ubicación…';
    navigator.geolocation.getCurrentPosition(function (p) {
      btn.disabled = false;
      gps = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0) };
      st.dataset.msg = '';
      setErr('direccion', '');
      paintGps();
    }, function (err) {
      btn.disabled = false; gps = null;
      var msg = err.code === 1 ? 'No diste permiso para usar tu ubicación. Actívalo en tu navegador o escribe tu dirección.'
        : err.code === 3 ? 'La ubicación tardó demasiado. Inténtalo de nuevo o escribe tu dirección.'
        : 'No pudimos obtener tu ubicación. Escribe tu dirección.';
      st.hidden = false; st.dataset.msg = '1'; st.textContent = msg;
      paintGps();
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }

  /* =====================================================
     Validación
     ===================================================== */
  function setErr(name, msg) {
    var p = document.querySelector('[data-err="' + name + '"]');
    if (!p) return;
    p.textContent = msg || '';
    var f = p.closest('.field');
    if (f) f.classList.toggle('invalid', !!msg);
  }

  function validate() {
    var bad = [];
    function fail(name, msg) { setErr(name, msg); bad.push(name); }
    ['nombre', 'apellido', 'telefono', 'direccion', 'mesa', 'pago'].forEach(function (n) { setErr(n, ''); });

    if (form.nombre.value.trim().length < 2) fail('nombre', 'Escribe tu nombre.');
    if (form.apellido.value.trim().length < 2) fail('apellido', 'Escribe tu apellido.');

    var digits = form.telefono.value.replace(/\D/g, '');
    if (isDelivery || digits.length) {
      if (digits.length < 10 || digits.length > 15) fail('telefono', 'Escribe un número de teléfono válido (ej: 0414 1234567).');
    }
    if (isDelivery) {
      if (!gps && form.direccion.value.trim().length < 5) fail('direccion', 'Comparte tu ubicación GPS o escribe tu dirección.');
    } else if (!form.mesa.value.trim()) {
      fail('mesa', 'Indica tu número de mesa.');
    }
    if (!selectedPay()) fail('pago', 'Elige un método de pago.');

    if (bad.length) {
      var first = document.querySelector('[data-err="' + bad[0] + '"]');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Revisa los campos marcados');
    }
    return !bad.length;
  }

  /* =====================================================
     Mensaje de WhatsApp
     ===================================================== */
  function orderCode(now) {
    // solo se usa si no hay conexión para pedir el número de secuencia: 5 dígitos según la hora
    return ('0000' + (Math.floor(now.getTime() / 1000) % 100000)).slice(-5);
  }

  function buildMessage(now, code) {
    var cfg = Store.config(), m = O.mode(), t = O.totals(), ls = O.lines();
    var nombre = (form.nombre.value.trim() + ' ' + form.apellido.value.trim()).trim();
    var L = [];

    L.push(cfg.whatsappMessage || 'Hola, quiero hacer un pedido:');
    L.push('');
    L.push('*PEDIDO #' + code + '*');
    L.push('🕒 Fecha y hora: ' + O.fmtDateTimeShort(now));
    L.push(isDelivery ? '🛵 Tipo: *Delivery*' : '🍽️ Tipo: *Comer en el local* · Mesa ' + form.mesa.value.trim());
    L.push('');
    L.push('👤 Cliente: ' + nombre);
    if (form.telefono.value.trim()) L.push('📞 Teléfono: ' + form.telefono.value.trim());
    if (isDelivery) {
      if (form.direccion.value.trim()) L.push('📍 Dirección: ' + form.direccion.value.trim());
      if (form.detalle.value.trim()) L.push('🏠 Detalle: ' + form.detalle.value.trim());
      if (gps) L.push('🗺️ Ubicación GPS: https://www.google.com/maps?q=' + gps.lat + ',' + gps.lng);
    }
    if (form.nota.value.trim()) L.push('📝 Nota: ' + form.nota.value.trim());
    L.push('');
    L.push('*Detalle del pedido:*');
    ls.forEach(function (l) {
      L.push('• ' + l.qty + ' x ' + l.dish.name + ' — ' + Store.fmtUSD(l.subtotal));
    });
    L.push('');
    L.push('Subtotal: ' + Store.fmtUSD(t.sub));
    if (t.fee > 0) L.push('Delivery: ' + Store.fmtUSD(t.fee));
    L.push('*TOTAL A PAGAR: ' + Store.fmtUSD(t.total) + '*');
    if (t.rate > 0) L.push('Referencia: ' + Store.fmtBs(t.totalBs) + ' (tasa Bs ' + t.rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' por $1)');
    L.push('💳 Método de pago: ' + selectedPay());
    return L.join('\n');
  }

  /* =====================================================
     Envío
     ===================================================== */
  function openWhatsApp(url) {
    var w = window.open(url, '_blank');
    if (!w) window.location.href = url;     // si el navegador bloquea la ventana nueva
  }

  function showDone(url, code, registered) {
    document.title = 'Pedido listo';
    $('#page').innerHTML =
      '<section class="box done">' +
        '<div class="ok-ico">' + O.I.check + '</div>' +
        '<h2>¡Tu pedido está listo!</h2>' +
        '<div class="code">PEDIDO #' + esc(code) + '</div>' +
        '<p>Para terminar, <b>envía el mensaje en WhatsApp</b>. El restaurante lo confirmará por ahí.</p>' +
        '<p class="hint" id="regNote">' + (registered === true ? '✅ Tu pedido también quedó registrado en el restaurante.'
          : registered === false ? '⚠️ No pudimos registrarlo en el sistema del restaurante. Envía el WhatsApp: es lo que cuenta.' : 'Registrando tu pedido…') + '</p>' +
        '<a class="btn wa primary" id="doneWa" href="' + esc(url) + '" target="_blank" rel="noopener">' + O.I.chat + ' Abrir WhatsApp</a>' +
        '<button type="button" class="btn block" id="doneEnd">Volver al menú</button>' +
      '</section>';
    window.scrollTo(0, 0);
    Store.cart.clear();                     // el pedido ya salió: el carrito queda vacío y limpio para el próximo
    $('#doneEnd').addEventListener('click', function () { location.href = 'index.html'; });
  }

  /* el pedido tal como lo ve la caja y la cocina */
  function buildOrder(now, code) {
    var t = O.totals(), ls = O.lines();
    var c = {
      name: (form.nombre.value.trim() + ' ' + form.apellido.value.trim()).trim(),
      phone: form.telefono.value.trim(),
      address: form.direccion.value.trim(), detail: form.detalle.value.trim(), note: form.nota.value.trim()
    };
    if (gps) c.gps = { lat: gps.lat, lng: gps.lng };
    return {
      id: 'd' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), code: code, at: now.getTime(), status: 'new',
      customer: c,
      items: ls.map(function (l) { return { id: l.dish.id, name: l.dish.name, qty: l.qty, price: l.dish.price }; }),
      plates: t.count, subUSD: t.sub, feeUSD: t.fee, totalUSD: t.total, rate: t.rate, pay: selectedPay()
    };
  }
  function setReg(ok) {
    var n = $('#regNote'); if (!n) return;
    n.textContent = ok ? '✅ Tu pedido también quedó registrado en el restaurante.' : '⚠️ No pudimos registrarlo en el sistema del restaurante. Envía el WhatsApp: es lo que cuenta.';
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!Store.canOrder()) { toast('Estamos cerrados por ahora'); return; }
    if (!O.lines().length) { location.replace('carrito.html'); return; }
    if (!validate()) return;

    var phone = String(Store.config().whatsapp || '').replace(/\D/g, '');
    if (!phone) { toast('El restaurante aún no configuró su WhatsApp'); return; }

    if (!isDelivery) {
      var cm = Store.mode.get(), tb = form.mesa.value.trim();
      Store.mode.set('local', tb, cm && String(cm.table) === tb ? cm.key : '');     // conserva la clave de la mesa
    }

    var now = new Date();
    var win = window.open('', '_blank');      // se abre ya (el navegador lo exige dentro del toque); se llena al tener el número
    var numP = (isDelivery && window.Delivery)
      ? Promise.race([Delivery.nextNumber(), new Promise(function (_, no) { setTimeout(no, 6000); })]).catch(function () { return orderCode(now); })
      : Promise.resolve(orderCode(now));

    numP.then(function (code) {
      var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(buildMessage(now, code));
      var order = (isDelivery && window.Delivery) ? buildOrder(now, code) : null;   // antes de cambiar la pantalla
      if (win && !win.closed) { try { win.location.href = url; } catch (x) { win = null; } }
      showDone(url, code, order ? undefined : true);
      if (order) Delivery.create(order).then(function () { setReg(true); }).catch(function () { setReg(false); });
    });
  }

  /* =====================================================
     Inicio
     ===================================================== */
  function tickClock() { $('#fechaHora').innerHTML = O.I.lock + '<span>' + esc(O.fmtDateTime(new Date())) + '</span>'; }

  function init() {
    form = $('#form');

    // sin tipo de pedido elegido → vuelve al menú para elegirlo
    var md = Store.mode.get();
    if (!md || md.type === 'local') { location.replace('index.html'); return; }
    // privacidad: no se guarda ningún dato del cliente en el dispositivo
    try { localStorage.removeItem(CUST_KEY); localStorage.removeItem(LAST_KEY); } catch (e) {}
    O.cleanCart();
    if (!O.lines().length) { location.replace('carrito.html'); return; }

    var m = O.mode();
    isDelivery = m.type !== 'local';
    O.renderHeader($('#topbar'), 'Datos del pedido', 'carrito.html');
    $('#modePill').textContent = O.modeLabel();
    $('#addrBox').hidden = !isDelivery;
    $('#mesaBox').hidden = isDelivery;
    $('#telOpt').textContent = isDelivery ? '' : '(opcional)';
    $('#gpsIcon').innerHTML = O.I.pin;
    if (!isDelivery) form.mesa.value = m.table || '';

    if (!Store.canOrder()) {
      $('#closedBanner').innerHTML = '<div class="closed-banner" style="margin:0 0 14px">Estamos cerrados por ahora. Podrás enviar tu pedido cuando abramos.</div>';
      $('#btnSend').disabled = true;
    }

    // datos guardados de la vez anterior

    renderPayList();
    O.mountLines($('#lines'), function () {
      if (!O.lines().length) { location.replace('carrito.html'); return; }
      renderTotals();
    });
    renderTotals();
    tickClock(); setInterval(tickClock, 15000);

    $('#btnGps').addEventListener('click', askGps);
    $('#payList').addEventListener('change', function () { setErr('pago', ''); renderPayTotal(); });
    form.addEventListener('input', function (e) {
      if (e.target.name) setErr(e.target.name, '');
    });
    form.addEventListener('submit', onSubmit);

    Store.refreshRate().then(renderTotals);
  }

  document.addEventListener('DOMContentLoaded', function () { Store.ready.then(init); });
})();