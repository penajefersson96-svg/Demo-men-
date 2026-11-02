/* =====================================================
   admin.js — Panel del administrador (admin.html)
   Aquí se configura TODO el sistema: platos, categorías,
   importar carta, mesas y QR, meseros, datos del negocio,
   horario, tasa, textos legales, equipo y cuenta.
   ===================================================== */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  let app, main, session;
  const TABS = [
    ['platos', 'Platos', '🍽️'], ['categorias', 'Categorías', '🗂️'], ['importar', 'Importar carta', '📷'], ['mesas', 'Mesas y QR', '🔳'], ['meseros', 'Meseros', '🧑‍🍳'],
    ['negocio', 'Negocio', '🏪'], ['horario', 'Horario', '🕒'], ['tasa', 'Tasa', '💱'],
    ['textos', 'Textos legales', '📄'], ['cuenta', 'Equipo y cuenta', '🔐']
  ];
  const tabs = {};

  /* =====================================================
     Utilidades de interfaz
     ===================================================== */
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function modal(html) {
    const ov = document.createElement('div');
    ov.className = 'm-overlay';
    ov.innerHTML = '<div class="m-box" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('noscroll');
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() { ov.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); }
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    return { el: ov.firstChild, close };
  }

  function confirmBox(msg, okLabel, danger) {
    return new Promise(res => {
      const m = modal('<h3>¿Seguro?</h3><p style="margin:0 0 18px">' + esc(msg) + '</p>' +
        '<div class="m-foot"><button class="btn" data-no>Cancelar</button>' +
        '<button class="btn ' + (danger === false ? 'primary' : 'primary') + '" style="' + (danger === false ? '' : 'background:var(--bad);border-color:var(--bad)') + '" data-yes>' + esc(okLabel || 'Sí, continuar') + '</button></div>');
      $('[data-no]', m.el).onclick = () => { m.close(); res(false); };
      $('[data-yes]', m.el).onclick = () => { m.close(); res(true); };
    });
  }

  function copyText(text) {
    const done = () => toast('Enlace copiado ✓');
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, () => fallback()); }
    else fallback();
    function fallback() {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar. Cópialo a mano.'); }
      t.remove();
    }
  }

  function saveData(fn, okMsg) {
    return Store.update(fn).then(() => { toast(okMsg || 'Guardado ✓'); }).catch(e => { toast(e.message || 'No se pudo guardar'); throw e; });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* Campo de imagen reutilizable (subir a imgBB o pegar un enlace) */
  function photoField(host, url) {
    const st = { url: url || '' };
    host.innerHTML =
      '<div class="photo-row"><div class="photo-prev"></div><div class="actions">' +
      '<button type="button" class="btn sm" data-pick>Subir imagen</button>' +
      '<button type="button" class="btn sm danger" data-clear>Quitar</button>' +
      '<input type="file" accept="image/*" hidden></div></div>' +
      '<input type="url" class="pf-url" placeholder="o pega el enlace de una imagen" style="margin-top:10px">' +
      '<div class="err" data-pf-err></div>';
    const prev = $('.photo-prev', host), file = $('input[type=file]', host), pick = $('[data-pick]', host), urlIn = $('.pf-url', host), err = $('[data-pf-err]', host);
    function paint() {
      prev.style.backgroundImage = st.url ? 'url("' + st.url.replace(/"/g, '%22') + '")' : 'none';
      urlIn.value = st.url.indexOf('data:') === 0 ? '' : st.url;
    }
    pick.onclick = () => file.click();
    $('[data-clear]', host).onclick = () => { st.url = ''; paint(); };
    urlIn.oninput = () => { st.url = urlIn.value.trim(); prev.style.backgroundImage = st.url ? 'url("' + st.url.replace(/"/g, '%22') + '")' : 'none'; };
    file.onchange = () => {
      const f = file.files[0]; if (!f) return;
      err.textContent = ''; pick.disabled = true; pick.textContent = 'Subiendo…';
      Img.upload(f).then(u => { st.url = u; paint(); })
        .catch(e => { err.textContent = e.message; })
        .then(() => { pick.disabled = false; pick.textContent = 'Subir imagen'; file.value = ''; });
    };
    paint();
    return { get: () => st.url };
  }

  const head = (title, right) => '<div class="a-title"><h2>' + title + '</h2>' + (right || '') + '</div>';

  /* =====================================================
     PLATOS
     ===================================================== */
  const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/;

  tabs.platos = function (box) {
    let q = '', cat = '';
    box.innerHTML = head('Platos', '<button class="btn primary sm" id="newDish">＋ Nuevo plato</button>') +
      '<div class="toolbar"><input type="search" id="dq" placeholder="Buscar plato…">' +
      '<select id="dc"><option value="">Todas las categorías</option>' +
      Store.categories().map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="list" id="dl"></div>';

    function paint() {
      const cats = {}; Store.categories().forEach(c => { cats[c.id] = c; });
      const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const list = Store.dishes().filter(d => (!cat || d.category === cat) && (!q || norm(d.name + ' ' + d.description).includes(norm(q))));
      $('#dl').innerHTML = list.length ? list.map(d => {
        const m = d.modes || { delivery: true, local: true };
        const badges = [];
        if (d.available === false) badges.push('<span class="badge warn">Agotado</span>');
        if (!m.delivery && !m.local) badges.push('<span class="badge warn">Oculto</span>');
        else if (!m.delivery) badges.push('<span class="badge">Solo en el local</span>');
        else if (!m.local) badges.push('<span class="badge">Solo delivery</span>');
        if (d.video) badges.push('<span class="badge ok">Video</span>');
        return '<div class="item' + (d.available === false ? ' off' : '') + '" data-id="' + esc(d.id) + '">' +
          '<img class="th" src="' + esc(Store.dishImg(d)) + '" alt="" onerror="this.onerror=null;this.src=\'img/placeholder.svg\'">' +
          '<div class="main"><b>' + esc(d.name) + '</b><small>' + esc((cats[d.category] || {}).name || 'Sin categoría') + ' · ' + Store.fmtUSD(d.price) + '</small>' +
          '<div class="badges">' + badges.join('') + '</div></div>' +
          '<div class="acts"><label class="switch" title="Disponible"><input type="checkbox" data-av ' + (d.available !== false ? 'checked' : '') + '><span></span></label>' +
          '<button class="btn sm" data-edit>Editar</button><button class="btn sm danger" data-del>Eliminar</button></div></div>';
      }).join('') : '<div class="empty-box">No hay platos que mostrar.</div>';
    }
    paint();

    $('#dq').oninput = e => { q = e.target.value.trim(); paint(); };
    $('#dc').onchange = e => { cat = e.target.value; paint(); };
    $('#newDish').onclick = () => dishForm(null, paint);
    $('#dl').onclick = e => {
      const row = e.target.closest('.item'); if (!row) return;
      const id = row.dataset.id, d = Store.dishById(id);
      if (e.target.closest('[data-edit]')) dishForm(d, paint);
      else if (e.target.closest('[data-del]')) {
        confirmBox('Vas a eliminar «' + d.name + '». Esto no se puede deshacer.', 'Eliminar').then(ok => {
          if (ok) saveData(data => { data.dishes = data.dishes.filter(x => x.id !== id); }, 'Plato eliminado').then(paint);
        });
      }
    };
    $('#dl').onchange = e => {
      const sw = e.target.closest('[data-av]'); if (!sw) return;
      const id = e.target.closest('.item').dataset.id;
      saveData(data => { data.dishes.forEach(x => { if (x.id === id) x.available = sw.checked; }); }, sw.checked ? 'Disponible ✓' : 'Marcado como agotado').then(paint);
    };
  };

  function dishForm(d, done) {
    const cats = Store.categories();
    if (!cats.length) { toast('Primero crea una categoría.'); return; }
    const isNew = !d;
    d = d || { name: '', description: '', price: '', category: cats[0].id, photo: '', video: '', available: true, modes: { delivery: true, local: true } };
    const modes = d.modes || { delivery: true, local: true };

    const m = modal('<h3>' + (isNew ? 'Nuevo plato' : 'Editar plato') + '</h3><form id="df" novalidate>' +
      '<div class="f"><label for="dfN">Nombre</label><input id="dfN" type="text" value="' + esc(d.name) + '" maxlength="80"><div class="err" data-e="name"></div></div>' +
      '<div class="f"><label for="dfD">Descripción</label><textarea id="dfD" maxlength="500">' + esc(d.description) + '</textarea></div>' +
      '<div class="grid2"><div class="f"><label for="dfP">Precio en dólares ($)</label><input id="dfP" type="text" inputmode="decimal" value="' + esc(d.price) + '" placeholder="Ej: 8.50"><div class="err" data-e="price"></div></div>' +
      '<div class="f"><label for="dfC">Categoría</label><select id="dfC">' + cats.map(c => '<option value="' + esc(c.id) + '"' + (c.id === d.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div></div>' +
      '<div class="f"><span class="lbl">Foto del plato</span><div id="dfPhoto"></div></div>' +
      '<div class="f"><label for="dfV">Video (enlace de YouTube)</label><input id="dfV" type="url" value="' + esc(d.video) + '" placeholder="https://www.youtube.com/watch?v=…">' +
      '<small class="h">Se muestra al tocar el plato, en lugar de la foto. Súbelo a YouTube y pega aquí el enlace.</small><div class="err" data-e="video"></div></div>' +
      '<div class="f"><span class="lbl">Aparece en</span>' +
      '<label class="check"><input type="checkbox" id="dfMd" ' + (modes.delivery !== false ? 'checked' : '') + '> Menú de delivery</label>' +
      '<label class="check"><input type="checkbox" id="dfMl" ' + (modes.local !== false ? 'checked' : '') + '> Menú para comer en el local</label>' +
      '<label class="check"><input type="checkbox" id="dfA" ' + (d.available !== false ? 'checked' : '') + '> Disponible hoy</label></div>' +
      '<div class="m-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>');

    const photo = photoField($('#dfPhoto', m.el), d.photo);
    $('[data-cancel]', m.el).onclick = m.close;
    $('#df', m.el).onsubmit = e => {
      e.preventDefault();
      const err = k => $('[data-e="' + k + '"]', m.el);
      ['name', 'price', 'video'].forEach(k => { err(k).textContent = ''; });
      const name = $('#dfN', m.el).value.trim();
      const price = parseFloat(String($('#dfP', m.el).value).replace(',', '.'));
      const video = $('#dfV', m.el).value.trim();
      let bad = false;
      if (name.length < 2) { err('name').textContent = 'Escribe el nombre del plato.'; bad = true; }
      if (!(price >= 0)) { err('price').textContent = 'Escribe un precio válido (ej: 8.50).'; bad = true; }
      if (video && !YT.test(video) && !/^https?:\/\/.+\.(mp4|webm)(\?.*)?$/i.test(video)) { err('video').textContent = 'Pega un enlace de YouTube (youtube.com o youtu.be).'; bad = true; }
      if (bad) return;
      const dish = Object.assign({}, d, {
        id: d.id || uid('d'), name, description: $('#dfD', m.el).value.trim(), price: Math.round(price * 100) / 100,
        category: $('#dfC', m.el).value, photo: photo.get(), video,
        available: $('#dfA', m.el).checked, modes: { delivery: $('#dfMd', m.el).checked, local: $('#dfMl', m.el).checked }
      });
      saveData(data => {
        const i = data.dishes.findIndex(x => x.id === dish.id);
        if (i >= 0) data.dishes[i] = dish; else data.dishes.push(dish);
      }, 'Plato guardado ✓').then(() => { m.close(); if (done) done(); }).catch(() => {});
    };
  }

  /* =====================================================
     CATEGORÍAS
     ===================================================== */
  tabs.categorias = function (box) {
    box.innerHTML = head('Categorías') +
      '<div class="panel"><h3>Agregar categoría</h3><p class="help">El emoji es opcional; aparece junto al nombre en el menú.</p>' +
      '<form id="cf" class="actions" novalidate><input type="text" id="cI" maxlength="4" placeholder="🍕" style="width:64px;height:46px;text-align:center;font-size:22px;border:1.5px solid var(--line);border-radius:12px">' +
      '<input type="text" id="cN" maxlength="40" placeholder="Nombre (ej: Pizzas)" style="flex:1;min-width:150px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px">' +
      '<button class="btn primary" type="submit">Agregar</button></form></div>' +
      '<div class="list" id="cl"></div>';

    function paint() {
      const cats = Store.categories(), counts = {};
      Store.dishes().forEach(d => { counts[d.category] = (counts[d.category] || 0) + 1; });
      $('#cl').innerHTML = cats.length ? cats.map((c, i) =>
        '<div class="item" data-id="' + esc(c.id) + '"><div class="ico">' + esc(c.icon || '•') + '</div>' +
        '<div class="main"><b>' + esc(c.name) + '</b><small>' + (counts[c.id] || 0) + ' plato(s)</small></div>' +
        '<div class="acts"><button class="btn sm" data-up ' + (i === 0 ? 'disabled' : '') + ' aria-label="Subir">↑</button>' +
        '<button class="btn sm" data-down ' + (i === cats.length - 1 ? 'disabled' : '') + ' aria-label="Bajar">↓</button>' +
        '<button class="btn sm" data-edit>Editar</button><button class="btn sm danger" data-del>Eliminar</button></div></div>').join('')
        : '<div class="empty-box">Aún no hay categorías.</div>';
    }
    paint();

    $('#cf').onsubmit = e => {
      e.preventDefault();
      const name = $('#cN').value.trim(), icon = $('#cI').value.trim();
      if (name.length < 2) { toast('Escribe el nombre de la categoría.'); return; }
      saveData(data => {
        let id = slug(name) || uid('c'); while (data.categories.some(c => c.id === id)) id += '-2';
        const max = data.categories.reduce((a, c) => Math.max(a, c.order || 0), 0);
        data.categories.push({ id, name, icon, order: max + 1 });
      }, 'Categoría agregada ✓').then(() => { $('#cN').value = ''; $('#cI').value = ''; paint(); });
    };

    $('#cl').onclick = e => {
      const row = e.target.closest('.item'); if (!row) return;
      const id = row.dataset.id;
      const move = dir => saveData(data => {
        const list = data.categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        const i = list.findIndex(c => c.id === id), j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        list.forEach((c, k) => { c.order = k + 1; });
      }, 'Orden actualizado').then(paint);
      if (e.target.closest('[data-up]')) move(-1);
      else if (e.target.closest('[data-down]')) move(1);
      else if (e.target.closest('[data-edit]')) {
        const c = Store.categories().find(x => x.id === id);
        const m = modal('<h3>Editar categoría</h3><form id="ef" novalidate><div class="f"><label>Emoji</label><input type="text" id="eI" maxlength="4" value="' + esc(c.icon || '') + '"></div>' +
          '<div class="f"><label>Nombre</label><input type="text" id="eN" maxlength="40" value="' + esc(c.name) + '"></div>' +
          '<div class="m-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>');
        $('[data-cancel]', m.el).onclick = m.close;
        $('#ef', m.el).onsubmit = ev => {
          ev.preventDefault();
          const n = $('#eN', m.el).value.trim(); if (n.length < 2) return;
          saveData(data => { data.categories.forEach(x => { if (x.id === id) { x.name = n; x.icon = $('#eI', m.el).value.trim(); } }); }).then(() => { m.close(); paint(); });
        };
      } else if (e.target.closest('[data-del]')) {
        const n = Store.dishes().filter(d => d.category === id).length;
        if (n) { toast('Primero mueve o elimina los ' + n + ' plato(s) de esta categoría.'); return; }
        confirmBox('Vas a eliminar esta categoría.', 'Eliminar').then(ok => { if (ok) saveData(data => { data.categories = data.categories.filter(c => c.id !== id); }, 'Categoría eliminada').then(paint); });
      }
    };
  };

  /* =====================================================
     MESAS Y QR
     ===================================================== */
  function baseUrl() {
    let u = (Store.config().publicUrl || '').trim();
    if (!u) u = location.href.replace(/[#?].*$/, '').replace(/[^\/]*$/, '');
    if (!/\/$/.test(u)) u += '/';
    return u;
  }
  const tableLink = t => baseUrl() + 'index.html?modo=local&mesa=' + encodeURIComponent(t.id) + '&k=' + encodeURIComponent(window.Live ? Live.keyFor(t.id) : '');
  const deliveryLink = () => baseUrl() + 'index.html?modo=delivery';

  function qrPNG(label, link, filename) {
    const svg = QRLib.svg(link, 800), img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 1080;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#241a14'; x.textAlign = 'center';
      x.font = '700 52px "Fraunces", Georgia, serif'; x.fillText(Store.config().name, 450, 80);
      x.drawImage(img, 50, 120, 800, 800);
      x.font = '700 64px "Fraunces", Georgia, serif'; x.fillText(label, 450, 990);
      x.font = '400 32px "DM Sans", Arial, sans-serif'; x.fillStyle = '#7a6a5c'; x.fillText('Escanea y pide desde tu celular', 450, 1046);
      c.toBlob(b => downloadBlob(b, filename), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function printAll() {
    const cfg = Store.config(), tbs = cfg.tables || [];
    if (!tbs.length) { toast('Primero crea las mesas.'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('Tu navegador bloqueó la ventana. Permítela e inténtalo de nuevo.'); return; }
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Códigos QR de las mesas</title><style>' +
      '@page{margin:12mm}body{font-family:Arial,sans-serif;margin:0;color:#241a14}.g{display:grid;grid-template-columns:1fr 1fr;gap:10mm}' +
      '.c{border:2px solid #241a14;border-radius:14px;padding:8mm;text-align:center;page-break-inside:avoid;break-inside:avoid}' +
      '.c h2{margin:0 0 4mm;font-size:20pt}.c h3{margin:4mm 0 1mm;font-size:26pt}.c p{margin:0;color:#555;font-size:11pt}.c svg{width:62mm;height:62mm}' +
      '</style></head><body><div class="g">' +
      tbs.map(t => '<div class="c"><h2>' + esc(cfg.name) + '</h2>' + QRLib.svg(tableLink(t), 300) + '<h3>' + esc(t.label) + '</h3><p>Escanea y pide desde tu celular</p></div>').join('') +
      '</div></body></html>');
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 500);
  }

  tabs.mesas = function (box) {
    function paint() {
      const cfg = Store.config(), tbs = cfg.tables || [];
      const base = baseUrl(), notPublic = /^(file:|http:\/\/(localhost|127\.|192\.168\.|10\.))/.test(base);
      box.innerHTML = head('Mesas y códigos QR', '<button class="btn sm" id="printAll">🖨️ Imprimir todos los QR</button>') +
        '<p class="a-sub">Cada mesa tiene su propio enlace y QR, con una <b>clave secreta</b> dentro: así nadie puede pedir en una mesa sin haber escaneado su QR. Se imprime una sola vez: sigue funcionando aunque cambies precios o platos.</p>' +
        (notPublic ? '<div class="warn-box"><b>Estás en modo de prueba.</b> Los QR apuntarán a <code>' + esc(base) + '</code>, que solo funciona en este equipo. Escribe abajo la dirección real de tu menú (ej: https://tuusuario.github.io/menu/) antes de imprimir.</div>' : '') +
        '<div class="panel"><h3>Dirección pública del menú</h3><p class="help">Es la dirección donde publicaste el sistema (termina en la carpeta, sin index.html). Los QR se generan con ella.</p>' +
        '<div class="actions"><input type="url" id="pubUrl" value="' + esc(cfg.publicUrl || '') + '" placeholder="' + esc(base) + '" style="flex:1;min-width:200px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px">' +
        '<button class="btn primary" id="pubSave">Guardar</button></div></div>' +

        '<div class="grid2"><div class="panel"><h3>Servicio en mesa</h3><p class="help">Pantallas del personal que se abren con su propio usuario.</p>' +
        '<label class="check"><span class="switch"><input type="checkbox" id="kitchenSw" ' + (cfg.kitchenEnabled ? 'checked' : '') + '><span></span></span> Usar pantalla de cocina (opcional)</label>' +
        '<div class="link-box" style="margin-top:10px"><input readonly value="' + esc(base + 'caja.html') + '"><button class="btn sm" data-copy="' + esc(base + 'caja.html') + '">Caja</button></div>' +
        '<div class="link-box"><input readonly value="' + esc(base + 'cocina.html') + '"><button class="btn sm" data-copy="' + esc(base + 'cocina.html') + '">Cocina</button></div></div>' +

        '<div class="panel"><h3>Enlace de delivery</h3><p class="help">Para tu bio de Instagram, WhatsApp o un QR en la puerta.</p>' +
        '<div style="display:flex;gap:12px;align-items:center"><div class="qr" style="width:92px;height:92px;flex:none">' + QRLib.svg(deliveryLink(), 92) + '</div>' +
        '<div style="flex:1;min-width:0"><div class="link-box"><input readonly value="' + esc(deliveryLink()) + '"><button class="btn sm" data-copy="' + esc(deliveryLink()) + '">Copiar</button></div>' +
        '<button class="btn sm" data-png="delivery">Descargar QR</button></div></div></div></div>' +

        '<div class="panel"><h3>Agregar mesas</h3><div class="actions">' +
        '<input type="text" inputmode="numeric" id="addN" placeholder="Cantidad" style="width:110px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px">' +
        '<button class="btn" id="addNum">Agregar mesas numeradas</button>' +
        '<span style="color:var(--muted);padding:0 6px">o</span>' +
        '<input type="text" id="addL" maxlength="30" placeholder="Nombre (ej: Terraza 1)" style="flex:1;min-width:150px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px">' +
        '<button class="btn" id="addNamed">Agregar</button></div></div>' +

        (tbs.length ? '<div class="qr-grid">' + tbs.map(t =>
          '<div class="qr-card" data-id="' + esc(t.id) + '"><div class="qr">' + QRLib.svg(tableLink(t), 160) + '</div><h4>' + esc(t.label) + '</h4>' +
          '<div class="link-box"><input readonly value="' + esc(tableLink(t)) + '"><button class="btn sm" data-copy="' + esc(tableLink(t)) + '">Copiar</button></div>' +
          '<div class="actions"><button class="btn sm" data-png="' + esc(t.id) + '">Descargar QR</button><a class="btn sm" href="' + esc(tableLink(t)) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">Abrir</a>' +
          '<button class="btn sm" data-ren>Renombrar</button><button class="btn sm" data-renew title="Cambia la clave secreta de esta mesa">Renovar clave</button><button class="btn sm danger" data-del>Quitar</button></div></div>').join('') + '</div>'
          : '<div class="empty-box">Aún no hay mesas. Agrégalas arriba.</div>');
      bind();
    }

    function addTables(list) {
      return saveData(data => { data.config.tables = (data.config.tables || []).concat(list); }, 'Mesas agregadas ✓').then(paint);
    }
    function bind() {
      $('#printAll').onclick = printAll;
      $('#pubSave').onclick = () => saveData(d => { d.config.publicUrl = $('#pubUrl').value.trim(); }, 'Dirección guardada ✓').then(paint);
      $('#kitchenSw').onchange = e => saveData(d => { d.config.kitchenEnabled = e.target.checked; }, e.target.checked ? 'Cocina activada' : 'Cocina desactivada');
      $('#addNum').onclick = () => {
        const n = parseInt($('#addN').value, 10);
        if (!(n >= 1 && n <= 100)) { toast('Escribe cuántas mesas (de 1 a 100).'); return; }
        const tb = Store.config().tables || [];
        let max = tb.reduce((a, t) => /^\d+$/.test(t.id) ? Math.max(a, +t.id) : a, 0);
        const list = []; for (let i = 1; i <= n; i++) { max++; list.push({ id: String(max), label: 'Mesa ' + max }); }
        addTables(list);
      };
      $('#addNamed').onclick = () => {
        const label = $('#addL').value.trim(); if (label.length < 1) { toast('Escribe el nombre de la mesa.'); return; }
        const tb = Store.config().tables || []; let id = slug(label) || uid('m');
        while (tb.some(t => t.id === id)) id += '-2';
        addTables([{ id, label }]);
      };
      box.onclick = e => {
        const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
        const png = e.target.closest('[data-png]');
        if (png) {
          const k = png.dataset.png;
          if (k === 'delivery') qrPNG('Delivery', deliveryLink(), 'qr-delivery.png');
          else { const t = (Store.config().tables || []).find(x => x.id === k); qrPNG(t.label, tableLink(t), 'qr-' + slug(t.label) + '.png'); }
          return;
        }
        const card = e.target.closest('.qr-card'); if (!card) return;
        const id = card.dataset.id, t = (Store.config().tables || []).find(x => x.id === id);
        if (e.target.closest('[data-del]')) {
          confirmBox('Vas a quitar «' + t.label + '». Su QR impreso dejará de funcionar.', 'Quitar').then(ok => { if (ok) saveData(d => { d.config.tables = d.config.tables.filter(x => x.id !== id); }, 'Mesa quitada').then(paint); });
        } else if (e.target.closest('[data-renew]')) {
          confirmBox('Se cambiará la clave secreta de «' + t.label + '». El QR impreso de esa mesa dejará de servir y tendrás que imprimir el nuevo. Úsalo si alguien que ya no está en el restaurante tiene el enlace.', 'Renovar clave').then(ok => { if (ok) Live.renewKey(id).then(() => { toast('Clave renovada ✓ · imprime el QR nuevo'); paint(); }); });
        } else if (e.target.closest('[data-ren]')) {
          const m = modal('<h3>Renombrar mesa</h3><form id="rf"><div class="f"><label>Nombre</label><input type="text" id="rN" maxlength="30" value="' + esc(t.label) + '"><small class="h">El enlace y el QR no cambian, solo el nombre que se muestra.</small></div>' +
            '<div class="m-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>');
          $('[data-cancel]', m.el).onclick = m.close;
          $('#rf', m.el).onsubmit = ev => { ev.preventDefault(); const v = $('#rN', m.el).value.trim(); if (!v) return; saveData(d => { d.config.tables.forEach(x => { if (x.id === id) x.label = v; }); }).then(() => { m.close(); paint(); }); };
        }
      };
    }
    paint();
    if (window.Live) Live.ensureKeys((Store.config().tables || []).map(t => t.id)).then(paint);   // crea la clave secreta de cada mesa
  };

  /* =====================================================
     NEGOCIO
     ===================================================== */
  tabs.negocio = function (box) {
    const c = Store.config();
    const inp = (id, label, val, extra) => '<div class="f"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" value="' + esc(val) + '" ' + (extra || '') + '></div>';
    box.innerHTML = head('Datos del negocio') +
      '<form id="nf" novalidate>' +
      '<div class="panel"><h3>Identidad</h3><div class="f"><span class="lbl">Logo</span><div id="logoF"></div></div>' +
      inp('nName', 'Nombre del restaurante', c.name, 'maxlength="60"') + inp('nSlogan', 'Eslogan (opcional)', c.slogan, 'maxlength="90"') +
      inp('nAddr', 'Dirección', c.address, 'maxlength="160"') + '</div>' +
      '<div class="panel"><h3>Contacto y pedidos</h3>' +
      inp('nPhone', 'Teléfono (para mostrar)', c.phone, 'inputmode="tel"') +
      '<div class="f"><label for="nWa">WhatsApp que recibe los pedidos de delivery</label><input id="nWa" type="text" inputmode="tel" value="' + esc(c.whatsapp) + '" placeholder="584141234567"><small class="h">Con código de país, solo números, sin + ni espacios. Ej: 584141234567</small></div>' +
      '<div class="f"><label for="nMsg">Mensaje con el que empieza el pedido</label><input id="nMsg" type="text" value="' + esc(c.whatsappMessage) + '" maxlength="120"></div>' +
      '<div class="f"><label for="nFee">Costo de delivery (USD, 0 = sin costo)</label><input id="nFee" type="text" inputmode="decimal" value="' + esc(c.deliveryFee) + '"></div>' +
      '<div class="f"><label for="nPay">Métodos de pago (uno por línea)</label><textarea id="nPay" style="min-height:130px">' + esc((c.paymentMethods || []).join('\n')) + '</textarea></div></div>' +
      '<div class="panel"><h3>Redes sociales</h3><p class="help">Solo se muestran las que llenes. Puedes poner el usuario o el enlace completo.</p>' +
      inp('nIg', 'Instagram', c.instagram, 'placeholder="usuario"') + inp('nTt', 'TikTok', c.tiktok, 'placeholder="usuario"') + inp('nFb', 'Facebook', c.facebook, 'placeholder="página o enlace"') + '</div>' +
      '<div class="actions end"><button class="btn primary lg" type="submit" style="padding:0 28px">Guardar cambios</button></div></form>';

    const logo = photoField($('#logoF'), c.logo === 'img/logo.svg' ? '' : c.logo);
    $('#nf').onsubmit = e => {
      e.preventDefault();
      const name = $('#nName').value.trim();
      if (name.length < 2) { toast('Escribe el nombre del restaurante.'); return; }
      const fee = parseFloat(String($('#nFee').value).replace(',', '.')) || 0;
      saveData(d => {
        Object.assign(d.config, {
          name, slogan: $('#nSlogan').value.trim(), address: $('#nAddr').value.trim(), logo: logo.get() || 'img/logo.svg',
          phone: $('#nPhone').value.trim(), whatsapp: $('#nWa').value.replace(/\D/g, ''), whatsappMessage: $('#nMsg').value.trim() || 'Hola, quiero hacer un pedido:',
          deliveryFee: Math.max(0, fee), paymentMethods: $('#nPay').value.split('\n').map(s => s.trim()).filter(Boolean),
          instagram: $('#nIg').value.trim(), tiktok: $('#nTt').value.trim(), facebook: $('#nFb').value.trim()
        });
      }).then(() => { $('.a-head h1 small').textContent = name; });
    };
  };

  /* =====================================================
     HORARIO
     ===================================================== */
  tabs.horario = function (box) {
    const c = Store.config(), st = Store.status();
    box.innerHTML = head('Horario y estado') +
      '<div class="panel"><h3>Estado ahora</h3><p class="help">Ahora mismo el menú muestra: <b>' + (st.open ? 'Abierto' : 'Cerrado') + '</b> · ' + esc(st.detail) + '</p>' +
      '<div class="radio-list" id="fs">' +
      '<label><input type="radio" name="fs" value="auto" ' + (c.forceStatus === 'auto' ? 'checked' : '') + '><span>Automático<small>Abre y cierra solo según el horario de abajo.</small></span></label>' +
      '<label><input type="radio" name="fs" value="open" ' + (c.forceStatus === 'open' ? 'checked' : '') + '><span>Forzar ABIERTO<small>Ignora el horario hasta que lo cambies.</small></span></label>' +
      '<label><input type="radio" name="fs" value="closed" ' + (c.forceStatus === 'closed' ? 'checked' : '') + '><span>Forzar CERRADO<small>Para feriados o imprevistos.</small></span></label></div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" id="hClosedOrders" ' + (c.allowClosedOrders ? 'checked' : '') + '> Aceptar pedidos aunque esté cerrado</label></div>' +
      '<div class="panel"><h3>Horario semanal</h3><p class="help">Si cierras después de medianoche (ej: 6:00 PM a 2:00 AM), el sistema lo entiende.</p><div id="days"></div>' +
      '<div class="f" style="margin-top:12px"><label for="hTz">Zona horaria</label><input id="hTz" type="text" value="' + esc(c.timezone) + '"><small class="h">Venezuela: America/Caracas</small></div></div>' +
      '<div class="actions end"><button class="btn primary lg" id="hSave" style="padding:0 28px">Guardar cambios</button></div>';

    $('#days').innerHTML = Store.DAYS.map(k => {
      const h = c.hours[k] || { open: false, from: '11:00', to: '22:00' };
      return '<div class="day-row' + (h.open ? '' : ' closed') + '" data-k="' + k + '"><b>' + Store.DAY_NAMES[k] + '</b>' +
        '<label class="switch"><input type="checkbox" data-open ' + (h.open ? 'checked' : '') + '><span></span></label>' +
        '<div class="times"><input type="time" data-from value="' + esc(h.from) + '"> a <input type="time" data-to value="' + esc(h.to) + '"></div></div>';
    }).join('');
    $('#days').onchange = e => { const sw = e.target.closest('[data-open]'); if (sw) sw.closest('.day-row').classList.toggle('closed', !sw.checked); };

    $('#hSave').onclick = () => {
      const hours = {};
      $$('.day-row').forEach(r => { hours[r.dataset.k] = { open: $('[data-open]', r).checked, from: $('[data-from]', r).value || '11:00', to: $('[data-to]', r).value || '22:00' }; });
      const tz = $('#hTz').value.trim() || 'America/Caracas';
      try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch (e) { toast('La zona horaria no es válida.'); return; }
      saveData(d => {
        d.config.hours = hours; d.config.timezone = tz;
        d.config.forceStatus = ($('input[name=fs]:checked') || {}).value || 'auto';
        d.config.allowClosedOrders = $('#hClosedOrders').checked;
      }).then(() => tabs.horario(box));
    };
  };

  /* =====================================================
     TASA DEL DÓLAR
     ===================================================== */
  tabs.tasa = function (box) {
    const c = Store.config(), r = c.rate;
    box.innerHTML = head('Tasa del dólar') +
      '<div class="panel"><h3>Tasa actual</h3><p style="font-size:28px;font-weight:700;margin:4px 0" id="rNow"></p><p class="help" id="rSrc"></p>' +
      '<button class="btn sm" id="rRefresh">Actualizar ahora</button></div>' +
      '<div class="panel"><h3>¿Cómo se calcula?</h3><div class="radio-list">' +
      '<label><input type="radio" name="rm" value="auto" ' + (r.mode === 'auto' ? 'checked' : '') + '><span>Automática<small>El menú consulta la tasa oficial por internet. Si falla, usa la manual.</small></span></label>' +
      '<label><input type="radio" name="rm" value="manual" ' + (r.mode === 'manual' ? 'checked' : '') + '><span>Manual<small>Tú escribes la tasa y la cambias cuando quieras.</small></span></label></div>' +
      '<div class="f" style="margin-top:14px"><label for="rMan">Tasa manual (Bs por $1)</label><input id="rMan" type="text" inputmode="decimal" value="' + esc(r.manual) + '"><small class="h">También se usa como respaldo si la automática no responde.</small></div>' +
      '<details><summary style="cursor:pointer;color:var(--muted);font-size:14px">Avanzado</summary><div class="f" style="margin-top:10px"><label for="rApi">Dirección de la consulta automática</label><input id="rApi" type="url" value="' + esc(r.apiUrl) + '"></div></details></div>' +
      '<div class="actions end"><button class="btn primary lg" id="rSave" style="padding:0 28px">Guardar cambios</button></div>';

    function paintNow() {
      const x = Store.rate();
      $('#rNow').textContent = x.value > 0 ? 'Bs ' + x.value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' por $1' : 'Sin tasa';
      $('#rSrc').textContent = x.source === 'auto' ? 'Fuente: automática' + (x.updatedAt ? ' · actualizada ' + new Date(x.updatedAt).toLocaleString('es-VE') : '') : 'Fuente: manual';
    }
    paintNow();
    $('#rRefresh').onclick = () => { $('#rRefresh').textContent = 'Consultando…'; Store.refreshRate().then(() => { paintNow(); $('#rRefresh').textContent = 'Actualizar ahora'; toast(Store.rate().source === 'auto' ? 'Tasa actualizada ✓' : 'No se pudo consultar; se usa la manual'); }); };
    $('#rSave').onclick = () => {
      const man = parseFloat(String($('#rMan').value).replace(',', '.'));
      if (!(man > 0)) { toast('Escribe una tasa manual válida (la usamos de respaldo).'); return; }
      saveData(d => {
        const was = d.config.rate.manual;
        d.config.rate.mode = $('input[name=rm]:checked').value; d.config.rate.manual = man;
        d.config.rate.apiUrl = $('#rApi').value.trim() || 'https://ve.dolarapi.com/v1/dolares/oficial';
        if (was !== man) d.config.rate.updatedAt = new Date().toISOString();
      }).then(() => Store.refreshRate()).then(paintNow);
    };
  };

  /* =====================================================
     TEXTOS (Conócenos + legales)
     ===================================================== */
  tabs.textos = function (box) {
    const c = Store.config(), l = typeof c.legal === 'object' ? c.legal : { terms: c.legal || '' };
    const ta = (id, label, v, rows) => '<div class="panel"><h3>' + label + '</h3><div class="f" style="margin:0"><textarea id="' + id + '" style="min-height:' + (rows || 200) + 'px">' + esc(v) + '</textarea></div></div>';
    box.innerHTML = head('Textos del menú') +
      '<p class="a-sub">Separa los párrafos con una línea en blanco. Una línea que empiece con <code>## </code> se muestra como subtítulo.</p>' +
      ta('tAbout', 'Conócenos', c.about, 180) + ta('tTerms', 'Términos y Condiciones', l.terms, 260) +
      ta('tPriv', 'Política de Privacidad', l.privacy, 260) + ta('tShip', 'Envíos y Devoluciones', l.shipping, 260) +
      '<div class="info-box">Los textos de ejemplo son una base. Adáptalos a tu negocio y, si puedes, que los revise un abogado.</div>' +
      '<div class="actions end"><button class="btn primary lg" id="tSave" style="padding:0 28px">Guardar cambios</button></div>';
    $('#tSave').onclick = () => saveData(d => {
      d.config.about = $('#tAbout').value.trim();
      d.config.legal = { terms: $('#tTerms').value.trim(), privacy: $('#tPriv').value.trim(), shipping: $('#tShip').value.trim() };
    });
  };

  /* =====================================================
     EQUIPO Y CUENTA
     ===================================================== */
  const ROLE_NAMES = { admin: 'Administrador', caja: 'Caja', cocina: 'Cocina' };

  tabs.cuenta = function (box) {
    box.innerHTML = head('Equipo y cuenta') +
      '<div id="modeBox"></div><div id="demoWarn"></div>' +
      '<div class="panel"><h3>Mi cuenta</h3><p class="help">Estás dentro como <b>' + esc(session.user) + '</b>. ' + (DB.mode === 'firebase' ? 'Tu usuario es tu correo.' : '') + '</p>' +
      '<form id="acF" novalidate><div class="grid2"><div class="f"><label for="aU">' + (DB.mode === 'firebase' ? 'Correo' : 'Usuario') + '</label><input id="aU" type="text" value="' + esc(session.user) + '" autocomplete="username" autocapitalize="none"></div>' +
      '<div class="f"><label for="aC">Clave actual</label><input id="aC" type="password" autocomplete="current-password"></div>' +
      '<div class="f"><label for="aN">Clave nueva (opcional)</label><input id="aN" type="password" autocomplete="new-password"></div>' +
      '<div class="f"><label for="aN2">Repetir clave nueva</label><input id="aN2" type="password" autocomplete="new-password"></div></div>' +
      '<div class="err" id="acE"></div><button class="btn primary" type="submit">Guardar mi cuenta</button></form></div>' +
      '<div class="panel" id="staffBox"></div>' +
      '<div class="panel"><h3>Fotos (imgBB)</h3><p class="help">Para subir fotos de los platos se usa imgBB (gratis). Crea una cuenta en imgbb.com, entra a <b>api.imgbb.com</b> y copia tu clave API aquí.</p>' +
      '<div class="actions"><input type="password" id="ibK" placeholder="Clave API de imgBB" autocomplete="off" style="flex:1;min-width:200px;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px"><button class="btn primary" id="ibS">Guardar clave</button></div>' +
      '<p class="help" style="margin-top:10px">' + (DB.mode === 'firebase' ? 'Las fotos <b>no se guardan en Firebase</b>: van a imgBB y en Firebase solo queda el enlace. Así el plan gratuito no se llena.' : 'Sin clave, en modo de prueba las fotos se guardan dentro del navegador (pocas y pequeñas).') + '</p></div>' +
      '<div class="panel"><h3>Respaldo</h3><p class="help">Descarga una copia de tu menú (platos, categorías, mesas y ajustes) o restáurala.</p>' +
      '<div class="actions"><button class="btn" id="bkOut">⬇️ Descargar respaldo</button><button class="btn" id="bkIn">⬆️ Restaurar respaldo</button><input type="file" id="bkFile" accept="application/json,.json" hidden>' +
      '<button class="btn danger" id="bkReset">Restablecer menú de ejemplo</button></div></div>';

    $('#modeBox').innerHTML = DB.mode === 'local'
      ? '<div class="info-box"><b>Modo de prueba.</b> Los datos se guardan solo en este navegador. Para que clientes, caja y cocina compartan todo en vivo desde distintos teléfonos, se conecta Firebase (Parte 9).</div>'
      : '<div class="info-box"><b>Conectado a Firebase.</b> Los cambios se ven en todos los dispositivos al instante.</div>';

    /* mi cuenta */
    $('#acF').onsubmit = e => {
      e.preventDefault();
      const err = $('#acE'); err.textContent = '';
      const np = $('#aN').value, np2 = $('#aN2').value;
      if (np && np !== np2) { err.textContent = 'Las claves nuevas no coinciden.'; return; }
      Auth.changeCredentials({ newUser: $('#aU').value, currentPass: $('#aC').value, newPass: np }).then(s => {
        session = s; toast('Cuenta actualizada ✓'); tabs.cuenta(box);
      }).catch(ex => { err.textContent = ex.message; });
    };

    /* equipo */
    const sb = $('#staffBox');
    if (Auth.supportsStaffAdmin) {
      const paintStaff = () => Auth.listStaff().then(list => {
        $('#demoWarn').innerHTML = list.some(u => u.demoPass)
          ? '<div class="warn-box"><b>Cambia las claves de demostración</b> (admin123, caja123, cocina123) antes de entregar el sistema al restaurante.</div>' : '';
        sb.innerHTML = '<h3>Equipo</h3><p class="help">Usuarios que pueden entrar a la caja y a la cocina.' + (DB.mode === 'firebase' ? ' Pueden ser un correo o un nombre corto (ej: caja2).' : '') + '</p>' +
          '<table class="staff"><thead><tr><th>Usuario</th><th>Rol</th><th></th></tr></thead><tbody>' +
          list.map(u => '<tr data-u="' + esc(u.user) + '"><td><b>' + esc(u.user) + '</b><br><small style="color:var(--muted)">' + esc(u.name || '') + '</small></td><td>' + esc(ROLE_NAMES[u.role] || u.role) + '</td>' +
            '<td style="text-align:right;white-space:nowrap"><button class="btn sm" data-pw>Editar</button> <button class="btn sm danger" data-rm>Quitar</button></td></tr>').join('') +
          '</tbody></table><div class="actions" style="margin-top:12px"><button class="btn" id="stAdd">＋ Agregar usuario</button></div>';
      });
      const staffForm = (u) => {
        const roleSel = r => '<option value="caja"' + (r === 'caja' ? ' selected' : '') + '>Caja</option><option value="cocina"' + (r === 'cocina' ? ' selected' : '') + '>Cocina</option><option value="admin"' + (r === 'admin' ? ' selected' : '') + '>Administrador</option>';
        const m = modal('<h3>' + (u ? 'Editar a ' + esc(u.user) : 'Nuevo usuario') + '</h3><form id="sf" novalidate>' +
          (u ? '' : '<div class="f"><label>Usuario</label><input type="text" id="sU" maxlength="30" autocapitalize="none"><small class="h">Minúsculas, sin espacios. Ej: caja2</small></div>') +
          '<div class="f"><label>Nombre (opcional)</label><input type="text" id="sNm" maxlength="40" value="' + esc(u ? (u.name || '') : '') + '"></div>' +
          '<div class="f"><label>Rol</label><select id="sR">' + roleSel(u ? u.role : 'caja') + '</select></div>' +
          '<div class="f"><label>' + (u ? 'Clave nueva (opcional)' : 'Clave') + '</label><input type="password" id="sP" autocomplete="new-password"><small class="h">' + (u ? 'Déjala vacía si solo quieres cambiar el nombre o el rol. ' : '') + 'Mínimo 6 caracteres.</small></div>' +
          '<div class="err" id="sE"></div><div class="m-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>');
        $('[data-cancel]', m.el).onclick = m.close;
        $('#sf', m.el).onsubmit = ev => {
          ev.preventDefault();
          const o = { user: u ? u.user : $('#sU', m.el).value, name: $('#sNm', m.el).value.trim(), role: $('#sR', m.el).value, pass: $('#sP', m.el).value };
          Auth.saveStaff(o).then(r => { m.close(); toast((r && r.message) || 'Usuario guardado ✓'); paintStaff(); }).catch(ex => { $('#sE', m.el).textContent = ex.message; });
        };
      };
      paintStaff().then(() => {});
      sb.onclick = e => {
        if (e.target.closest('#stAdd')) { staffForm(null); return; }
        const tr = e.target.closest('tr[data-u]'); if (!tr) return;
        const user = tr.dataset.u;
        if (e.target.closest('[data-pw]')) Auth.listStaff().then(l => staffForm(l.find(x => x.user === user)));
        else if (e.target.closest('[data-rm]')) confirmBox('Vas a quitar el acceso de «' + user + '».', 'Quitar').then(ok => {
          if (ok) Auth.deleteStaff(user).then(() => { toast('Usuario quitado'); paintStaff(); }).catch(ex => toast(ex.message));
        });
      };
    } else {
      sb.innerHTML = '<h3>Equipo</h3><p class="help">Con Firebase, los usuarios de caja y cocina se crean en Firebase Authentication. La guía de la Parte 9 explica cómo.</p>';
    }

    /* imgBB */
    Img.getKey().then(k => { $('#ibK').value = k; });
    $('#ibS').onclick = () => DB.set('secrets', 'main', { imgbbKey: $('#ibK').value.trim() }).then(() => toast('Clave guardada ✓')).catch(ex => toast(ex.message));

    /* respaldo */
    $('#bkOut').onclick = () => {
      const blob = new Blob([JSON.stringify({ config: Store.data.config, categories: Store.data.categories, dishes: Store.data.dishes }, null, 2)], { type: 'application/json' });
      downloadBlob(blob, 'respaldo-menu-' + new Date().toISOString().slice(0, 10) + '.json');
    };
    $('#bkIn').onclick = () => $('#bkFile').click();
    $('#bkFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let obj; try { obj = JSON.parse(rd.result); } catch (x) { toast('El archivo no es un respaldo válido.'); return; }
        if (!obj || !Array.isArray(obj.dishes) || !Array.isArray(obj.categories) || !obj.config) { toast('El archivo no parece un respaldo de este menú.'); return; }
        confirmBox('Se reemplazarán todos los platos, categorías y ajustes actuales por los del respaldo.', 'Restaurar', true).then(ok => {
          if (ok) Store.replace(obj).then(() => { toast('Respaldo restaurado ✓'); show('platos'); }).catch(ex => toast(ex.message));
        });
      };
      rd.readAsText(f); e.target.value = '';
    };
    $('#bkReset').onclick = () => confirmBox('Se borrará todo lo que hayas cambiado y volverá el menú de ejemplo.', 'Restablecer').then(ok => {
      if (ok) Store.reset().then(() => { toast('Menú de ejemplo restaurado'); show('platos'); });
    });
  };

  /* =====================================================
     ESTRUCTURA DEL PANEL
     ===================================================== */
  function show(t) {
    if (!tabs[t]) t = 'platos';
    try { sessionStorage.setItem('fogon_admin_tab', t); } catch (e) {}
    $$('.a-tab').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    main.scrollTop = 0; window.scrollTo(0, 0);
    tabs[t](main);
  }

  function shell() {
    const c = Store.config();
    app.innerHTML =
      '<header class="a-head"><img src="' + esc(c.logo || 'img/logo.svg') + '" alt=""><h1>Administración<small>' + esc(c.name) + '</small></h1>' +
      '<a class="btn sm" href="index.html" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">Ver menú</a>' +
      '<button class="btn sm" id="out">Salir</button></header>' +
      '<nav class="a-nav" aria-label="Secciones"><div class="a-nav-in">' + TABS.map(t => '<button class="a-tab" data-t="' + t[0] + '">' + t[2] + ' ' + t[1] + '</button>').join('') + '</div></nav>' +
      '<main class="a-main" id="aMain"></main>';
    main = $('#aMain');
    $('#out').onclick = StaffUI.logout;
    $('.a-nav-in').onclick = e => { const b = e.target.closest('.a-tab'); if (b) show(b.dataset.t); };
    let t = 'platos'; try { t = sessionStorage.getItem('fogon_admin_tab') || t; } catch (e) {}
    show(t);
    // Firebase: si todavía no existe el menú en la nube, se publica el de ejemplo para poder editarlo
    // limpieza: los resúmenes de cierre de caja más viejos que closingRetentionDays (por defecto 395 días ≈ 13 meses)
    const keepDays = Number(Store.config().closingRetentionDays) || 395;
    DB.list('closings', { field: 'to', before: Date.now() - keepDays * 86400000 }).then(m => Object.keys(m || {}).forEach(k => DB.remove('closings', k))).catch(() => {});
    if (DB.mode === 'firebase') DB.get('menu', 'main').then(d => { if (!d) Store.update(() => {}); }).catch(() => {});
  }

  /* herramientas para las pestañas extra (js/admin-extra.js) */
  window.AdminKit = { $, $$, esc, slug, uid, tabs, head, toast, modal, confirmBox, saveData, show };

  document.addEventListener('DOMContentLoaded', () => {
    app = $('#app');
    StaffUI.start(app, { roles: ['admin'], title: 'Panel del administrador', demoUser: 'admin', demoPass: 'admin123', onReady: s => { session = s; shell(); } });
  });
})();