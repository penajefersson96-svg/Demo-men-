/* =====================================================
   store.js — Capa de datos compartida
   La usan: el menú (index.html), el carrito, el pedido y el panel admin.
   Guarda todo en el navegador (localStorage).
   ===================================================== */
(function () {
  'use strict';

  var CART_KEY = 'fogon_cart_v1';
  var MODE_KEY = 'fogon_mode_v1';
  var RATE_KEY = 'fogon_rate_v1';

  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_NAMES = {
    mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
    fri: 'Viernes', sat: 'Sábado', sun: 'Domingo'
  };

  /* ---------- utilidades ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function read(k, fb) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function deepMerge(base, extra) {
    var out = clone(base);
    Object.keys(extra || {}).forEach(function (k) {
      out[k] = (isObj(out[k]) && isObj(extra[k])) ? deepMerge(out[k], extra[k]) : extra[k];
    });
    return out;
  }
  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  /* ---------- datos del restaurante (viven en DB: menu/main) ---------- */
  function normalize(doc) {
    var base = clone(window.DEFAULT_DATA);
    var out = { config: deepMerge(base.config, (doc && doc.config) || {}),
                categories: (doc && doc.categories) || base.categories,
                dishes: (doc && doc.dishes) || base.dishes };
    return out;
  }
  var data = normalize(null);
  var lastJson = JSON.stringify(data);

  function applyRemote(doc) {
    var next = normalize(doc);
    var j = JSON.stringify(next);
    if (j === lastJson) return;
    lastJson = j; data = next;
    emit('store:data');
  }

  /* Store.ready: se cumple cuando ya se cargaron los datos. Todas las páginas esperan esto. */
  var ready = DB.ready.then(function () { return DB.get('menu', 'main'); }).then(function (doc) {
    if (!doc && DB.mode === 'local') {
      // primera vez en este navegador: se guarda el menú de ejemplo
      return DB.set('menu', 'main', clone(data)).then(function () { return null; });
    }
    if (doc) applyRemote(doc);
  }).catch(function () { /* sin conexión: se queda con los datos de ejemplo */ }).then(function () {
    DB.watchDoc('menu', 'main', function (doc) { if (doc) applyRemote(doc); });
  });

  function save() {
    lastJson = JSON.stringify(data);
    return DB.set('menu', 'main', clone(data)).then(function () { emit('store:data'); });
  }

  window.addEventListener('storage', function (e) {
    if (e.key === CART_KEY) emit('store:cart');
  });

  /* ---------- tasa del dólar ---------- */
  function rate() {
    var c = data.config.rate || {};
    var cached = read(RATE_KEY, null);
    if (c.mode === 'auto' && cached && cached.value > 0) {
      return { value: cached.value, source: 'auto', updatedAt: cached.at };
    }
    return { value: Number(c.manual) || 0, source: 'manual', updatedAt: c.updatedAt || null };
  }

  function refreshRate() {
    var c = data.config.rate || {};
    if (c.mode !== 'auto' || !c.apiUrl) return Promise.resolve(rate());
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6000);
    return fetch(c.apiUrl, { signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var v = Number(j.promedio != null ? j.promedio : j.venta);
        if (v > 0) write(RATE_KEY, { value: v, at: j.fechaActualizacion || new Date().toISOString() });
      })
      .catch(function () { /* sin internet o API caída: se usa la tasa manual */ })
      .then(function () { clearTimeout(timer); return rate(); });
  }

  /* ---------- formato de dinero ---------- */
  function fmtUSD(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtBs(n) {
    return 'Bs ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function toBs(usd) { return Number(usd || 0) * rate().value; }
  function priceHTML(usd) {
    var r = rate().value;
    return '<span class="usd">' + fmtUSD(usd) + '</span>' +
      (r > 0 ? '<span class="bs">' + fmtBs(usd * r) + '</span>' : '');
  }

  /* ---------- horario y estado abierto/cerrado ---------- */
  function fmt12(hhmm) {
    var p = String(hhmm || '00:00').split(':');
    var h = parseInt(p[0], 10), m = p[1] || '00';
    var suf = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + suf;
  }
  function toMin(hhmm) {
    var p = String(hhmm || '0:0').split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10);
  }
  function nowInZone(tz) {
    var map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      return { day: map[o.weekday], min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
    } catch (e) {
      var d = new Date();
      return { day: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function status() {
    var c = data.config;
    if (c.forceStatus === 'open')   return { open: true,  detail: 'Atendiendo ahora', forced: true };
    if (c.forceStatus === 'closed') return { open: false, detail: 'Cerrado temporalmente', forced: true };

    var now = nowInZone(c.timezone || 'America/Caracas');
    var today = c.hours[DAYS[now.day]];
    var yest = c.hours[DAYS[(now.day + 6) % 7]];

    // horario que cruza la medianoche (ej. 18:00 a 02:00) del día anterior
    if (yest && yest.open && toMin(yest.to) <= toMin(yest.from) && now.min < toMin(yest.to)) {
      return { open: true, detail: 'Hasta las ' + fmt12(yest.to) };
    }
    if (today && today.open) {
      var f = toMin(today.from), t = toMin(today.to);
      var isOpen = t > f ? (now.min >= f && now.min < t) : (now.min >= f);
      if (isOpen) return { open: true, detail: 'Hasta las ' + fmt12(today.to) };
      if (now.min < f) return { open: false, detail: 'Abre hoy a las ' + fmt12(today.from) };
    }
    for (var i = 1; i <= 7; i++) {
      var idx = (now.day + i) % 7, h = c.hours[DAYS[idx]];
      if (h && h.open) {
        var when = i === 1 ? 'mañana' : 'el ' + DAY_NAMES[DAYS[idx]].toLowerCase();
        return { open: false, detail: 'Abre ' + when + ' a las ' + fmt12(h.from) };
      }
    }
    return { open: false, detail: 'Sin horario disponible' };
  }

  function canOrder() {
    return status().open || !!data.config.allowClosedOrders;
  }

  /* ---------- modo de pedido: delivery o comer en el local ---------- */
  var mode = {
    get: function () { return read(MODE_KEY, null); },
    set: function (type, table, key) {
      write(MODE_KEY, { type: type === 'local' ? 'local' : 'delivery', table: table ? String(table) : '', key: key ? String(key) : '' });
      emit('store:mode');
    },
    clear: function () { try { localStorage.removeItem(MODE_KEY); } catch (e) {} emit('store:mode'); }
  };

  /* ---------- platos y categorías ---------- */
  function categories() {
    return data.categories.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function dishes() { return data.dishes; }
  function dishById(id) {
    for (var i = 0; i < data.dishes.length; i++) if (data.dishes[i].id === id) return data.dishes[i];
    return null;
  }
  function dishVisibleIn(d, type) {
    var m = d.modes || { delivery: true, local: true };
    return !!m[type === 'local' ? 'local' : 'delivery'];
  }
  function dishImg(d) { return d.photo || 'img/placeholder.svg'; }

  /* ---------- carrito ---------- */
  function cartItems() { return read(CART_KEY, []); }
  function cartSave(items) { write(CART_KEY, items); emit('store:cart'); }

  var cart = {
    items: cartItems,
    qty: function (id) {
      var it = cartItems().filter(function (i) { return i.id === id; })[0];
      return it ? it.qty : 0;
    },
    add: function (id, n) {
      var items = cartItems(), it = items.filter(function (i) { return i.id === id; })[0];
      if (it) it.qty += (n || 1); else items.push({ id: id, qty: n || 1 });
      cartSave(items);
    },
    set: function (id, n) {
      var items = cartItems();
      items.forEach(function (i) { if (i.id === id) i.qty = n; });
      cartSave(items.filter(function (i) { return i.qty > 0; }));
    },
    remove: function (id) { cartSave(cartItems().filter(function (i) { return i.id !== id; })); },
    clear: function () { cartSave([]); },
    lines: function () {
      var out = [];
      cartItems().forEach(function (i) {
        var d = dishById(i.id);
        if (d && d.available !== false) out.push({ dish: d, qty: i.qty, subtotal: d.price * i.qty });
      });
      return out;
    },
    totals: function () {
      var lines = cart.lines(), usd = 0, count = 0;
      lines.forEach(function (l) { usd += l.subtotal; count += l.qty; });
      return { count: count, usd: usd, bs: usd * rate().value };
    }
  };

  /* ---------- redes sociales ---------- */
  function socialUrl(kind, v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    v = v.replace(/^@/, '');
    var base = { instagram: 'https://instagram.com/', tiktok: 'https://www.tiktok.com/@', facebook: 'https://facebook.com/' };
    return (base[kind] || 'https://') + v;
  }

  /* ---------- API pública ---------- */
  window.Store = {
    DAYS: DAYS, DAY_NAMES: DAY_NAMES,
    // datos
    ready: ready,
    get data() { return data; },
    config: function () { return data.config; },
    update: function (fn) { fn(data); return save(); },    // el panel admin usa esto (devuelve una promesa)
    replace: function (obj) { data = normalize(obj); return save(); },
    reset: function () { data = normalize(null); return save(); },
    // catálogo
    categories: categories, dishes: dishes, dishById: dishById,
    dishVisibleIn: dishVisibleIn, dishImg: dishImg,
    // tasa y dinero
    rate: rate, refreshRate: refreshRate,
    fmtUSD: fmtUSD, fmtBs: fmtBs, toBs: toBs, priceHTML: priceHTML,
    // horario
    status: status, canOrder: canOrder, fmt12: fmt12,
    // pedido
    mode: mode, cart: cart,
    socialUrl: socialUrl
  };
})();