/* =====================================================
   menu.js — Menú digital del cliente (index.html)
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
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function paragraphs(text) {
    return String(text || '').split(/\n\s*\n/).map(function (p) {
      p = p.trim();
      if (!p) return '';
      var m = p.match(/^##\s+(.+?)(?:\n([\s\S]*))?$/);   // "## Título" + texto
      if (m) return '<h4>' + esc(m[1]) + '</h4>' + (m[2] ? '<p>' + esc(m[2].trim()).replace(/\n/g, '<br>') + '</p>' : '');
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ---------- iconos ---------- */
  function svg(inner, size) {
    size = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var I = {
    search: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    bag: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    menu: svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
    x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 20),
    minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>', 20),
    pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 18),
    clock: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 18),
    chev: svg('<polyline points="6 9 12 15 18 9"/>', 16),
    play: svg('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>', 14),
    insta: svg('<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>'),
    tiktok: svg('<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>'),
    fb: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
    chat: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>', 18)
  };

  /* ---------- estado ---------- */
  function inTable() { return !!(window.Mesa && Mesa.active()); }   // cliente sentado en una mesa
  function qtyOf(id) { return inTable() ? Mesa.qty(id) : Store.cart.qty(id); }
  var query = '';
  var sheetEl = null;
  var els = {};

  /* =====================================================
     ENCABEZADO (hero) y estado abierto/cerrado
     ===================================================== */
  function renderHero() {
    var c = Store.config(), st = Store.status(), m = Store.mode.get(), r = Store.rate();

    document.title = c.name + ' · Menú digital';
    els.miniName.textContent = c.name;
    els.miniLogo.src = c.logo || 'img/logo.svg';

    var socials = [
      ['instagram', I.insta, 'Instagram'],
      ['tiktok', I.tiktok, 'TikTok'],
      ['facebook', I.fb, 'Facebook']
    ].map(function (s) {
      var url = Store.socialUrl(s[0], c[s[0]]);
      return url ? '<a class="social" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="' + s[2] + '">' + s[1] + '<span>' + s[2] + '</span></a>' : '';
    }).join('');

    var modeLabel = !m ? 'Elegir tipo de pedido'
      : m.type === 'local' ? 'Comer aquí' + (m.table ? ' · Mesa ' + esc(m.table) : '')
      : 'Delivery';

    els.hero.innerHTML =
      '<img class="hero-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="Logo de ' + esc(c.name) + '">' +
      '<h1>' + esc(c.name) + '</h1>' +
      (c.slogan ? '<p class="slogan">' + esc(c.slogan) + '</p>' : '') +
      '<button type="button" class="status ' + (st.open ? 'open' : 'closed') + '" id="statusBtn" aria-label="Ver horario">' +
        '<span class="dot"></span><b>' + (st.open ? 'Abierto' : 'Cerrado') + '</b><span class="st-detail">· ' + esc(st.detail) + '</span>' + I.chev +
      '</button>' +
      (c.address
        ? '<a class="meta-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) + '">' +
          I.pin + '<span>' + esc(c.address) + '</span></a>' : '') +
      (socials ? '<div class="socials">' + socials + '</div>' : '') +
      '<div class="hero-chips">' +
        '<button type="button" class="chip-btn" id="modeBtn"><b>' + modeLabel + '</b><span>Cambiar</span></button>' +
        (r.value > 0 ? '<span class="chip-static">Tasa del día: <b>' + Store.fmtBs(r.value) + '</b> por $1</span>' : '') +
      '</div>';

    $('#statusBtn').addEventListener('click', openHours);
    $('#modeBtn').addEventListener('click', function () { openGate(true); });

    var banner = els.closedBanner;
    banner.innerHTML = (!Store.canOrder() && currentModeType() !== 'local')
      ? '<div class="closed-banner">Estamos cerrados por ahora. Puedes ver el menú, pero los pedidos se habilitan cuando abramos.</div>'
      : '';
  }

  /* =====================================================
     MENÚ: categorías + platos (con búsqueda)
     ===================================================== */
  function currentModeType() {
    var m = Store.mode.get();
    return m ? m.type : 'delivery';
  }

  function matches(d, catName, q) {
    if (!q) return true;
    var hay = norm(d.name + ' ' + d.description + ' ' + catName);
    return norm(q).split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function cardHTML(d) {
    var q = qtyOf(d.id), out = d.available === false;
    return '<article class="card' + (out ? ' is-out' : '') + '" data-id="' + esc(d.id) + '" tabindex="0" role="button" aria-label="Ver ' + esc(d.name) + '">' +
      '<div class="card-body">' +
        '<h3>' + esc(d.name) + '</h3>' +
        '<p class="desc">' + esc(d.description) + '</p>' +
        '<div class="price">' + Store.priceHTML(d.price) + '</div>' +
        '<div class="who" data-who="' + esc(d.id) + '" hidden></div>' +
      '</div>' +
      '<div class="card-media">' +
        '<img loading="lazy" src="' + esc(Store.dishImg(d)) + '" alt="' + esc(d.name) + '" onerror="this.onerror=null;this.src=\'img/placeholder.svg\'">' +
        (d.video ? '<span class="vid-tag" title="Tiene video">' + I.play + '</span>' : '') +
        (out ? '<span class="out-tag">Agotado</span>'
             : '<button type="button" class="quick-add" data-add="' + esc(d.id) + '" aria-label="Agregar ' + esc(d.name) + '">' + I.plus + '</button>') +
        '<span class="qty-badge" data-badge="' + esc(d.id) + '"' + (q ? '' : ' hidden') + '>' + q + '</span>' +
      '</div>' +
    '</article>';
  }

  function renderMenu() {
    var type = currentModeType();
    var html = '', chips = '', total = 0, first = null;

    Store.categories().forEach(function (cat) {
      var list = Store.dishes().filter(function (d) {
        return d.category === cat.id && Store.dishVisibleIn(d, type) && matches(d, cat.name, query);
      });
      if (!list.length) return;
      total += list.length;
      if (!first) first = cat.id;
      chips += '<button type="button" class="cat-chip" data-cat="' + esc(cat.id) + '">' +
        (cat.icon ? '<span class="ci">' + esc(cat.icon) + '</span>' : '') + esc(cat.name) + '</button>';
      html += '<section class="cat-section" id="cat-' + esc(cat.id) + '" data-cat="' + esc(cat.id) + '">' +
        '<h2>' + (cat.icon ? '<span class="ci">' + esc(cat.icon) + '</span>' : '') + esc(cat.name) +
        '<small>' + list.length + '</small></h2>' +
        '<div class="grid">' + list.map(cardHTML).join('') + '</div></section>';
    });

    els.menu.innerHTML = html;
    els.catScroll.innerHTML = chips;
    els.catbar.hidden = !chips;

    if (!total) {
      els.noResults.hidden = false;
      els.noResults.innerHTML = query
        ? 'No encontramos platos para <b>“' + esc(query) + '”</b>.<br>Prueba con otra palabra.'
        : 'Todavía no hay platos disponibles en este menú.';
    } else {
      els.noResults.hidden = true;
    }
    layoutVars();
    spy();
  }

  /* ---------- scrollspy: la categoría activa sigue al cliente ---------- */
  var activeCat = null;
  function setActive(id) {
    if (id === activeCat) return;
    activeCat = id;
    $$('.cat-chip', els.catScroll).forEach(function (b) {
      var on = b.dataset.cat === id;
      b.classList.toggle('active', on);
      if (on) {
        var box = els.catScroll, left = b.offsetLeft - (box.clientWidth - b.offsetWidth) / 2;
        box.scrollTo({ left: left, behavior: 'smooth' });
      }
    });
  }
  var ticking = false;
  function spy() {
    var secs = $$('.cat-section');
    if (!secs.length) return;
    var off = els.topbar.offsetHeight + els.catbar.offsetHeight + 16;
    var cur = secs[0].dataset.cat;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top <= off) cur = secs[i].dataset.cat; else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      cur = secs[secs.length - 1].dataset.cat;
    }
    setActive(cur);
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; spy(); });
  }
  function layoutVars() {
    var root = document.documentElement.style;
    root.setProperty('--topbar-h', els.topbar.offsetHeight + 'px');
    root.setProperty('--catbar-h', (els.catbar.hidden ? 0 : els.catbar.offsetHeight) + 'px');
  }

  /* ---------- badges y barra del carrito ---------- */
  function renderBadges() {
    $$('[data-badge]').forEach(function (b) {
      var q = qtyOf(b.dataset.badge);
      b.textContent = q;
      b.hidden = !q;
    });
    $$('[data-who]').forEach(function (w) {
      var t = inTable() ? Mesa.whoTag(w.dataset.who) : '';
      w.textContent = t ? 'Pidió: ' + t : '';
      w.hidden = !t;
    });
  }
  function renderCartBar() {
    var table = inTable();
    var t = table ? Mesa.totals() : Store.cart.totals();
    var show = table || t.count > 0;                  // en la mesa la barra siempre está
    els.cartCount.hidden = !t.count;
    els.cartCount.textContent = t.count;
    els.cartbar.hidden = !show;
    $('#btnMesa').hidden = !table;
    $('.cb-label').textContent = table ? 'Pedido de la mesa' : 'Ver mi pedido';
    document.body.classList.toggle('has-cartbar', show);
    $('#cbCount').textContent = t.count;
    $('#cbUsd').textContent = Store.fmtUSD(t.usd);
    $('#cbBs').textContent = Store.rate().value > 0 ? Store.fmtBs(t.bs) : '';
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 1800);
  }

  function addToCart(id, n) {
    var d = Store.dishById(id);
    if (!d || d.available === false) return false;
    if (inTable()) {
      if (!Mesa.add(id, n || 1)) return false;
      toast((n && n > 1 ? n + ' × ' : '') + d.name + ' agregado a la mesa');
      return true;
    }
    if (!Store.canOrder()) { toast('Estamos cerrados por ahora'); return false; }
    Store.cart.add(id, n || 1);
    toast((n && n > 1 ? n + ' × ' : '') + d.name + ' agregado');
    return true;
  }

  /* =====================================================
     VENTANAS (sheets)
     ===================================================== */
  function openSheet(html, opts) {
    opts = opts || {};
    closeSheet();
    sheetEl = document.createElement('div');
    sheetEl.className = 'overlay';
    sheetEl.innerHTML = '<div class="sheet ' + (opts.cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    sheetEl._dismissible = opts.dismissible !== false;
    document.body.appendChild(sheetEl);
    document.body.classList.add('noscroll');
    sheetEl.addEventListener('mousedown', function (e) {
      if (e.target === sheetEl && sheetEl._dismissible) closeSheet();
    });
    $$('[data-close]', sheetEl).forEach(function (b) { b.addEventListener('click', closeSheet); });
    requestAnimationFrame(function () { if (sheetEl) sheetEl.classList.add('show'); });
    return sheetEl.firstChild;
  }
  function closeSheet() {
    if (!sheetEl) return;
    sheetEl.remove();          // al quitarlo se detiene el video
    sheetEl = null;
    document.body.classList.remove('noscroll');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheetEl && sheetEl._dismissible) closeSheet();
  });
  function closeBtn() {
    return '<button type="button" class="sheet-close" data-close aria-label="Cerrar">' + I.x + '</button>';
  }

  /* ---------- ventana del plato (con video) ---------- */
  function youtubeId(url) {
    var m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  function mediaHTML(d) {
    var img = Store.dishImg(d);
    if (d.video) {
      var yt = youtubeId(d.video);
      if (yt) {
        return '<iframe class="dish-video" src="https://www.youtube.com/embed/' + yt + '?autoplay=1&mute=1&playsinline=1&rel=0" ' +
          'title="Video de ' + esc(d.name) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
      }
      return '<video class="dish-video" src="' + esc(d.video) + '" poster="' + esc(img) + '" controls autoplay muted loop playsinline></video>';
    }
    return '<img class="dish-photo" src="' + esc(img) + '" alt="' + esc(d.name) + '">';
  }

  function openDish(id) {
    var d = Store.dishById(id);
    if (!d) return;
    var qty = 1, out = d.available === false, orderable = Store.canOrder() || currentModeType() === 'local';

    var node = openSheet(
      '<div class="dish-media">' + mediaHTML(d) + closeBtn() + '</div>' +
      '<div class="dish-info">' +
        '<div class="dish-head"><h2>' + esc(d.name) + '</h2><div class="price lg">' + Store.priceHTML(d.price) + '</div></div>' +
        '<p class="dish-desc">' + esc(d.description || 'Sin descripción.') + '</p>' +
        (out ? '<div class="dish-foot"><button class="btn" disabled>Agotado por hoy</button></div>'
          : '<div class="dish-foot">' +
              '<div class="stepper" aria-label="Cantidad"><button type="button" data-step="-1" aria-label="Menos">' + I.minus + '</button>' +
              '<span id="dq">1</span><button type="button" data-step="1" aria-label="Más">' + I.plus + '</button></div>' +
              '<button type="button" class="btn primary" id="dAdd"' + (orderable ? '' : ' disabled') + '></button>' +
            '</div>') +
      '</div>', { cls: 'dish-sheet' });

    var vid = $('video.dish-video', node);
    if (vid) {
      vid.addEventListener('error', function () {      // si el video falla, mostramos la foto
        vid.outerHTML = '<img class="dish-photo" src="' + esc(Store.dishImg(d)) + '" alt="' + esc(d.name) + '">';
      });
    }
    if (out) return;

    function paint() {
      $('#dq', node).textContent = qty;
      $('#dAdd', node).innerHTML = orderable
        ? 'Agregar · ' + Store.fmtUSD(d.price * qty)
        : 'Cerrado por ahora';
    }
    $$('[data-step]', node).forEach(function (b) {
      b.addEventListener('click', function () {
        qty = Math.max(1, Math.min(99, qty + parseInt(b.dataset.step, 10)));
        paint();
      });
    });
    $('#dAdd', node).addEventListener('click', function () {
      if (addToCart(d.id, qty)) closeSheet();
    });
    paint();
  }

  /* ---------- horario ---------- */
  function openHours() {
    var c = Store.config(), st = Store.status();
    var todayIdx = (function () { var d = new Date(); try {
      var w = new Intl.DateTimeFormat('en-US', { timeZone: c.timezone, weekday: 'short' }).format(d);
      return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[w];
    } catch (e) { return (d.getDay() + 6) % 7; } })();

    var rows = Store.DAYS.map(function (k, i) {
      var h = c.hours[k];
      return '<li class="' + (i === todayIdx ? 'today' : '') + '"><span>' + Store.DAY_NAMES[k] + '</span><b>' +
        (h && h.open ? Store.fmt12(h.from) + ' – ' + Store.fmt12(h.to) : 'Cerrado') + '</b></li>';
    }).join('');

    openSheet('<div class="sheet-pad">' + closeBtn() +
      '<h2>Horario de atención</h2>' +
      '<p class="status-line ' + (st.open ? 'open' : 'closed') + '"><span class="dot"></span>' +
      (st.open ? 'Abierto' : 'Cerrado') + ' · ' + esc(st.detail) + '</p>' +
      '<ul class="hours">' + rows + '</ul></div>', { cls: 'narrow' });
  }

  /* ---------- Conócenos ---------- */
  function openAbout() {
    var c = Store.config();
    openSheet('<div class="sheet-pad">' + closeBtn() +
      '<img class="info-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
      '<h2>Conócenos</h2><div class="prose">' + paragraphs(c.about) + '</div></div>', { cls: 'narrow' });
  }

  /* ---------- Legal: Términos y Condiciones / Privacidad / Envíos y Devoluciones ---------- */
  var LEGAL_TABS = [
    ['terms', 'Términos y Condiciones'],
    ['privacy', 'Política de Privacidad'],
    ['shipping', 'Envíos y Devoluciones']
  ];
  function legalText(key) {
    var l = Store.config().legal;
    if (typeof l === 'string') return key === 'terms' ? l : '';   // compatibilidad con datos viejos
    return (l && l[key]) || '';
  }
  function openLegal(tab) {
    var node = openSheet('<div class="sheet-pad">' + closeBtn() +
      '<h2>Términos legales</h2>' +
      '<div class="legal-tabs" role="tablist">' + LEGAL_TABS.map(function (t) {
        return '<button type="button" role="tab" class="legal-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="prose" id="lgBody"></div></div>', { cls: 'narrow' });

    function show(key) {
      $$('.legal-tab', node).forEach(function (b) {
        var on = b.dataset.tab === key;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var txt = legalText(key);
      $('#lgBody', node).innerHTML = txt ? paragraphs(txt) : '<p class="muted">Este documento aún no ha sido publicado.</p>';
      node.scrollTop = 0;
    }
    $$('.legal-tab', node).forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.tab); });
    });
    show(tab || 'terms');
  }

  /* ---------- elegir: Delivery o Comer aquí ---------- */
  function openGate(dismissible) {
    var c = Store.config(), cur = Store.mode.get();
    var node = openSheet(
      '<div class="sheet-pad gate">' + (dismissible ? closeBtn() : '') +
      '<img class="info-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
      '<h2>Bienvenido a ' + esc(c.name) + '</h2>' +
      '<p class="muted">¿Cómo quieres pedir hoy?</p>' +
      '<div class="gate-options">' +
        '<button type="button" class="gate-opt" data-mode="delivery"><span class="ge">🛵</span><b>Delivery</b><small>Te lo llevamos a tu dirección</small></button>' +
        '<button type="button" class="gate-opt" data-mode="local"><span class="ge">🍽️</span><b>Comer aquí</b><small>Estoy en el restaurante</small></button>' +
      '</div>' +
      '<div class="gate-table" hidden>' +
        '<label for="mesaInp">Número de mesa</label>' +
        '<input id="mesaInp" inputmode="numeric" maxlength="4" placeholder="Ej: 5" autocomplete="off">' +
        '<button type="button" class="btn primary block" id="mesaOk">Continuar</button>' +
      '</div></div>', { cls: 'narrow', dismissible: !!dismissible && !!cur });

    var tbl = $('.gate-table', node), inp = $('#mesaInp', node);
    if (cur && cur.table) inp.value = cur.table;

    $$('.gate-opt', node).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.mode === 'delivery') {
          closeSheet();
          Store.mode.set('delivery', '');
        } else {
          tbl.hidden = false;
          inp.focus();
        }
      });
    });
    function okTable() {
      var v = inp.value.trim();
      if (!v) { inp.classList.add('error'); inp.focus(); return; }
      closeSheet();
      Store.mode.set('local', v);
    }
    $('#mesaOk', node).addEventListener('click', okTable);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') okTable(); });
  }

  /* =====================================================
     PIE DE PÁGINA
     ===================================================== */
  function renderFooter() {
    var c = Store.config();
    var socials = [['instagram', I.insta, 'Instagram'], ['tiktok', I.tiktok, 'TikTok'], ['facebook', I.fb, 'Facebook']]
      .map(function (s) {
        var url = Store.socialUrl(s[0], c[s[0]]);
        return url ? '<a class="social round" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="' + s[2] + '">' + s[1] + '</a>' : '';
      }).join('');

    els.footer.innerHTML =
      '<div class="footer-in">' +
        '<img class="footer-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
        '<h3>' + esc(c.name) + '</h3>' +
        (c.address ? '<p class="f-line">' + I.pin + '<span>' + esc(c.address) + '</span></p>' : '') +
        (c.phone ? '<p class="f-line">' + I.chat + '<span>' + esc(c.phone) + '</span></p>' : '') +
        (socials ? '<div class="socials center">' + socials + '</div>' : '') +
        (/^https:\/\//i.test(c.reviewUrl || '') ? '<p style="text-align:center;margin-top:12px"><a class="btn" href="' + esc(c.reviewUrl) + '" target="_blank" rel="noopener">⭐ Déjanos tu reseña en Google</a></p>' : '') +
        '<div class="f-links">' +
          '<button type="button" data-about>Conócenos</button>' +
        '</div>' +
        '<div class="f-links legal">' +
          '<button type="button" data-legal="terms">Términos y Condiciones</button>' +
          '<button type="button" data-legal="privacy">Política de Privacidad</button>' +
          '<button type="button" data-legal="shipping">Envíos y Devoluciones</button>' +
        '</div>' +
        '<p class="copy">© ' + new Date().getFullYear() + ' ' + esc(c.name) + '</p>' +
      '</div>';

    $$('[data-about]', els.footer).forEach(function (b) { b.addEventListener('click', openAbout); });
    $$('[data-legal]', els.footer).forEach(function (b) {
      b.addEventListener('click', function () { openLegal(b.dataset.legal); });
    });
  }

  window.MenuUI = { openSheet: openSheet, closeSheet: closeSheet, closeBtn: closeBtn, toast: toast, esc: esc };

  /* =====================================================
     INICIO
     ===================================================== */
  /* ---------- pedido a medias: si el cliente de delivery vuelve y quedó algo en su carrito, se le pregunta ---------- */
  var ASK_KEY = 'fogon_cart_asked_v1', pendingAsk = false;
  function startAskCart() {
    var fresh = true;
    try { fresh = !sessionStorage.getItem(ASK_KEY); sessionStorage.setItem(ASK_KEY, '1'); } catch (e) {}
    if (!fresh) return;                                           // solo al abrir la página de nuevo, no en cada cambio de pantalla
    if (Store.cart.age() > 12 * 3600 * 1000) { Store.cart.clear(); return; }   // un pedido de hace medio día ya no vale
    pendingAsk = Store.cart.lines().length > 0;
  }
  function tryAskCart() {
    var m = Store.mode.get();
    if (!pendingAsk || inTable() || !m || m.type !== 'delivery') return;
    var ls = Store.cart.lines(); pendingAsk = false;
    if (!ls.length) return;
    var t = Store.cart.totals();
    var names = ls.slice(0, 3).map(function (l) { return '<li>' + l.qty + '× ' + esc(l.dish.name) + '</li>'; }).join('') +
      (ls.length > 3 ? '<li>y ' + (ls.length - 3) + ' más…</li>' : '');
    var node = openSheet('<div class="sheet-pad name-sheet">' +
      '<h2>Tienes un pedido sin terminar</h2>' +
      '<ul class="muted" style="text-align:left;margin:10px auto;max-width:300px;padding-left:20px">' + names + '</ul>' +
      '<p class="muted"><b>' + Store.fmtUSD(t.usd) + '</b>' + (Store.rate().value > 0 ? ' · ' + Store.fmtBs(t.bs) : '') + '</p>' +
      '<p class="muted">¿Quieres seguir con él o prefieres pedir otra cosa?</p>' +
      '<button type="button" class="btn primary block" id="kpKeep">Continuar con mi pedido</button>' +
      '<button type="button" class="btn block" id="kpNew" style="margin-top:8px">Empezar uno nuevo</button></div>', { cls: 'narrow', dismissible: false });
    $('#kpKeep', node).addEventListener('click', function () { closeSheet(); });
    $('#kpNew', node).addEventListener('click', function () { Store.cart.clear(); closeSheet(); toast('Pedido nuevo · el carrito está vacío'); });
  }

  function readUrlMode() {
    var p = new URLSearchParams(location.search);
    var m = (p.get('modo') || p.get('mode') || '').toLowerCase();
    var mesa = p.get('mesa') || p.get('table') || '';
    if (mesa) {
      var k = p.get('k') || '', old = Store.mode.get();
      if (!k && old && old.type === 'local' && String(old.table) === String(mesa)) k = old.key || '';
      Store.mode.set('local', mesa, k);
      try { history.replaceState(null, '', location.pathname); } catch (e) {}   // la clave no se queda a la vista en la barra
      return true;
    }
    if (m === 'delivery') { Store.mode.set('delivery', ''); return true; }
    if (m === 'local') {
      var cur = Store.mode.get();
      if (!cur || cur.type !== 'local') Store.mode.set('local', '');
      return !!(Store.mode.get() && Store.mode.get().table);
    }
    return !!Store.mode.get();
  }

  function renderAll() { renderHero(); renderMenu(); renderFooter(); renderCartBar(); }

  function init() {
    els = {
      topbar: $('#topbar'), hero: $('#hero'), catbar: $('#catbar'), catScroll: $('#catScroll'),
      menu: $('#menu'), noResults: $('#noResults'), footer: $('#footer'), closedBanner: $('#closedBanner'),
      cartbar: $('#cartbar'), cartCount: $('#cartCount'), toast: $('#toast'),
      searchRow: $('#searchRow'), q: $('#q'), miniName: $('#miniName'), miniLogo: $('#miniLogo')
    };
    $('#btnSearch').innerHTML = I.search;
    $('#btnMesa').innerHTML = I.menu;
    $('#btnMesa').addEventListener('click', function () { if (window.Mesa) Mesa.openMenu(); });
    $('#iconCart').innerHTML = I.bag;

    var hasMode = readUrlMode();
    startAskCart();
    renderAll();
    if (window.Mesa) Mesa.start(window.MenuUI);       // si es modo mesa, pide el nombre y se une

    // búsqueda (lupa)
    function toggleSearch(open) {
      els.searchRow.hidden = !open;
      $('#btnSearch').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) els.q.focus();
      else { els.q.value = ''; query = ''; renderMenu(); }
      layoutVars();
    }
    $('#btnSearch').addEventListener('click', function () { toggleSearch(els.searchRow.hidden); });
    $('#qClose').addEventListener('click', function () { toggleSearch(false); });
    els.q.addEventListener('input', function () { query = els.q.value.trim(); renderMenu(); });
    els.q.addEventListener('keydown', function (e) { if (e.key === 'Enter') els.q.blur(); });

    // categorías: clic en una pestaña lleva a esa sección
    els.catScroll.addEventListener('click', function (e) {
      var b = e.target.closest('.cat-chip');
      if (!b) return;
      var s = document.getElementById('cat-' + b.dataset.cat);
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // platos: abrir ventana o agregar rápido
    els.menu.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      if (add) { e.stopPropagation(); addToCart(add.dataset.add, 1); return; }
      var card = e.target.closest('.card');
      if (card) openDish(card.dataset.id);
    });
    els.menu.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
        e.preventDefault(); openDish(e.target.dataset.id);
      }
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { layoutVars(); spy(); });

    // cambios en vivo
    window.addEventListener('store:cart', function () { renderBadges(); renderCartBar(); });
    window.addEventListener('store:data', renderAll);
    window.addEventListener('store:mode', function () {
      renderHero(); renderMenu();
      setTimeout(function () { if (window.Mesa) Mesa.start(window.MenuUI); tryAskCart(); }, 0);
    });
    window.addEventListener('mesa:change', function () { renderBadges(); renderCartBar(); });

    // sentado en una mesa, el carrito abre el "Pedido de la mesa"
    ['#cartbar', '#btnCart'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        if (inTable()) { e.preventDefault(); Mesa.openOrder(); }
      });
    });

    // tasa automática + estado abierto/cerrado al día
    Store.refreshRate().then(function () { renderHero(); renderMenu(); renderCartBar(); });
    setInterval(function () { renderHero(); }, 60000);

    if (!hasMode) openGate(false);
    else if (new URLSearchParams(location.search).get('cambiar')) openGate(true);   // viene de "Cambiar" en el carrito
    else setTimeout(tryAskCart, 300);

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', function () { Store.ready.then(init); });
})();