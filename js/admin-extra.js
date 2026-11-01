/* =====================================================
   admin-extra.js — Pestañas «Meseros» e «Importar carta» del panel
   Se apoya en AdminKit (expuesto por admin.js).
   ===================================================== */
(function () {
  'use strict';
  var K = window.AdminKit; if (!K) return;
  var $ = K.$, esc = K.esc, tabs = K.tabs;
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var inputCss = 'height:46px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font-size:16px';

  /* =====================================================
     MESEROS  (lista de personal; el turno del día lo arma la caja)
     ===================================================== */
  tabs.meseros = function (box) {
    function list() { return Store.config().waiters || []; }
    function paint() {
      var w = list();
      box.innerHTML = K.head('Meseros') +
        '<p class="a-sub">Aquí registras a todo tu personal de sala. Cada día, la caja elige quiénes trabajan en el turno y las mesas se asignan por orden entre ellos.</p>' +
        '<div class="panel"><h3>Agregar mesero</h3><form id="wf" class="actions" novalidate>' +
        '<input type="text" id="wN" maxlength="30" placeholder="Nombre (ej: Carlos)" style="flex:1;min-width:160px;' + inputCss + '">' +
        '<button class="btn primary" type="submit">Agregar</button></form></div>' +
        '<div class="list">' + (w.length ? w.map(function (x) {
          return '<div class="item" data-id="' + esc(x.id) + '"><div class="ico">🧑‍🍳</div><div class="main"><b>' + esc(x.name) + '</b>' +
            '<small>' + (x.active === false ? 'Inactivo (no aparece para el turno)' : 'Activo') + '</small></div>' +
            '<div class="acts"><button class="btn sm" data-tg>' + (x.active === false ? 'Activar' : 'Desactivar') + '</button>' +
            '<button class="btn sm" data-ren>Renombrar</button><button class="btn sm danger" data-del>Quitar</button></div></div>';
        }).join('') : '<div class="empty-box">Aún no hay meseros. Agrégalos arriba.</div>') + '</div>';
      bind();
    }
    function bind() {
      $('#wf', box).onsubmit = function (e) {
        e.preventDefault();
        var name = $('#wN', box).value.trim();
        if (name.length < 2) { K.toast('Escribe el nombre del mesero.'); return; }
        K.saveData(function (d) {
          d.config.waiters = d.config.waiters || [];
          d.config.waiters.push({ id: K.uid('w'), name: name, active: true });
        }, 'Mesero agregado ✓').then(paint);
      };
      box.onclick = function (e) {
        var row = e.target.closest('.item'); if (!row) return;
        var id = row.dataset.id, w = list().filter(function (x) { return x.id === id; })[0];
        if (e.target.closest('[data-tg]')) K.saveData(function (d) { d.config.waiters.forEach(function (x) { if (x.id === id) x.active = x.active === false; }); }).then(paint);
        else if (e.target.closest('[data-del]')) K.confirmBox('Vas a quitar a «' + w.name + '» de la lista.', 'Quitar').then(function (ok) {
          if (ok) K.saveData(function (d) { d.config.waiters = d.config.waiters.filter(function (x) { return x.id !== id; }); }, 'Mesero quitado').then(paint);
        });
        else if (e.target.closest('[data-ren]')) {
          var m = K.modal('<h3>Renombrar mesero</h3><form id="rf"><div class="f"><label>Nombre</label><input type="text" id="rN" maxlength="30" value="' + esc(w.name) + '"></div>' +
            '<div class="m-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>');
          $('[data-cancel]', m.el).onclick = m.close;
          $('#rf', m.el).onsubmit = function (ev) {
            ev.preventDefault(); var v = $('#rN', m.el).value.trim(); if (v.length < 2) return;
            K.saveData(function (d) { d.config.waiters.forEach(function (x) { if (x.id === id) x.name = v; }); }).then(function () { m.close(); paint(); });
          };
        }
      };
    }
    paint();
  };

  /* =====================================================
     IMPORTAR CARTA  (foto o PDF → lista para revisar → platos)
     ===================================================== */
  tabs.importar = function (box) {
    var rows = [], source = '';

    function start() {
      rows = [];
      box.innerHTML = K.head('Importar carta') +
        '<p class="a-sub">Sube una foto de tu carta o un PDF y el sistema lee los platos y precios. <b>Antes de guardar nada, tú revisas y corriges todo.</b></p>' +
        '<div class="panel"><h3>1. Elige el archivo</h3>' +
        '<p class="help">Foto (JPG o PNG) o PDF. Funciona mejor con buena luz, la carta derecha y letra clara. Una foto por vez: súbelas una a una. Los precios se leen en dólares ($).</p>' +
        '<div class="actions"><button class="btn primary" id="imPick">📷 Foto o PDF de la carta</button>' +
        '<input type="file" id="imFile" accept="image/*,application/pdf,.pdf" hidden></div>' +
        '<div id="imStat" style="margin-top:12px;color:var(--muted)"></div></div>' +
        '<div class="panel"><h3>¿Prefieres pegar el texto?</h3><p class="help">Si tienes la carta en WhatsApp o Word, cópiala y pégala aquí.</p>' +
        '<textarea id="imTxt" rows="6" placeholder="ENTRADAS&#10;Tequeños (6 unidades) ..... 5.50&#10;Yuca frita ..... 4" style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:12px;font:inherit;font-size:16px"></textarea>' +
        '<div class="actions" style="margin-top:10px"><button class="btn" id="imGo">Leer texto</button></div></div>';
      $('#imPick', box).onclick = function () { $('#imFile', box).click(); };
      $('#imFile', box).onchange = function (e) {
        var f = e.target.files[0]; if (!f) return;
        if (f.size > 25 * 1024 * 1024) { K.toast('El archivo es muy pesado (máximo 25 MB).'); return; }
        var st = $('#imStat', box); st.textContent = 'Preparando…';
        source = f.name;
        MenuImport.extract(f, function (msg) { st.textContent = msg; }).then(function (r) {
          st.textContent = '';
          var items = MenuImport.parseText(r.text);
          if (!items.length) { st.innerHTML = '<span style="color:var(--bad)">No pude encontrar platos con precio en ese archivo. Prueba con una foto más clara o pega el texto abajo.</span>'; return; }
          review(items, r.method === 'ocr' ? 'La lectura por foto puede tener errores: revisa nombres y precios con calma.' : '', r.note);
        }).catch(function (ex) { st.innerHTML = '<span style="color:var(--bad)">' + esc(ex.message || 'No se pudo leer el archivo.') + '</span>'; });
        e.target.value = '';
      };
      $('#imGo', box).onclick = function () {
        var items = MenuImport.parseText($('#imTxt', box).value);
        if (!items.length) { K.toast('No encontré platos con precio. Cada línea debe terminar en el precio.'); return; }
        source = 'texto pegado'; review(items, '', '');
      };
    }

    function catOptions(r) {
      var cats = Store.categories();
      var opts = cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (r.cat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; });
      if (r.newCat) opts.push('<option value="new:' + esc(r.newCat) + '"' + (r.cat === 'new:' + r.newCat ? ' selected' : '') + '>➕ Crear «' + esc(r.newCat) + '»</option>');
      return opts.join('');
    }

    function review(items, warn, note) {
      var cats = Store.categories();
      rows = items.map(function (it, i) {
        var match = it.category ? cats.filter(function (c) { return norm(c.name) === norm(it.category); })[0] : null;
        var r = { n: i, on: true, name: it.name, description: it.description, price: it.price, newCat: '' };
        if (match) r.cat = match.id;
        else if (it.category) { r.newCat = it.category; r.cat = 'new:' + it.category; }
        else r.cat = cats.length ? cats[0].id : '';
        return r;
      });
      paintReview(warn, note);
    }

    function paintReview(warn, note) {
      var on = rows.filter(function (r) { return r.on; }).length;
      box.innerHTML = K.head('Revisar platos leídos', '<button class="btn sm" id="imBack">← Empezar de nuevo</button>') +
        (warn ? '<div class="warn-box">' + esc(warn) + '</div>' : '') + (note ? '<div class="info-box">' + esc(note) + '</div>' : '') +
        '<p class="a-sub">Encontré <b>' + rows.length + '</b> platos en «' + esc(source) + '». Corrige lo que haga falta y desmarca los que no quieras. Los platos entran sin foto: se las pones después desde «Platos». Los que no tengan precio entran como <b>no disponibles</b> hasta que se lo pongas.</p>' +
        '<div class="im-list">' + rows.map(function (r) {
          return '<div class="im-row' + (r.on ? '' : ' off') + '" data-n="' + r.n + '">' +
            '<label class="im-on"><input type="checkbox" data-f="on" ' + (r.on ? 'checked' : '') + ' aria-label="Importar"></label>' +
            '<div class="im-f im-name"><input type="text" data-f="name" value="' + esc(r.name) + '" maxlength="80" aria-label="Nombre"></div>' +
            '<div class="im-f im-price"><span>$</span><input type="text" inputmode="decimal" data-f="price" value="' + esc(r.price == null ? '' : r.price) + '" placeholder="falta" aria-label="Precio en dólares"></div>' +
            '<div class="im-f im-cat"><select data-f="cat" aria-label="Categoría">' + catOptions(r) + '</select></div>' +
            '<div class="im-f im-desc"><input type="text" data-f="description" value="' + esc(r.description) + '" maxlength="500" placeholder="Descripción (opcional)" aria-label="Descripción"></div></div>';
        }).join('') + '</div>' +
        '<div class="im-foot"><span id="imCount">' + on + ' plato(s) para importar</span>' +
        '<button class="btn primary" id="imSave">Importar los platos marcados</button></div>';
      $('#imBack', box).onclick = start;
      var list = $('.im-list', box);
      list.oninput = list.onchange = function (e) {
        var el = e.target.closest('[data-f]'); if (!el) return;
        var row = el.closest('.im-row'), r = rows[+row.dataset.n], f = el.dataset.f;
        if (f === 'on') { r.on = el.checked; row.classList.toggle('off', !r.on); $('#imCount', box).textContent = rows.filter(function (x) { return x.on; }).length + ' plato(s) para importar'; }
        else r[f] = el.value;
      };
      $('#imSave', box).onclick = save;
    }

    function save() {
      var sel = rows.filter(function (r) { return r.on; });
      if (!sel.length) { K.toast('No hay platos marcados.'); return; }
      var bad = null;
      sel.forEach(function (r) {
        var p = parseFloat(String(r.price).replace(',', '.'));
        r._p = p;
        r._free = String(r.price == null ? '' : r.price).trim() === '';     // sin precio: entra como "no disponible"
        if (r._free) r._p = 0;
        if (!bad && (String(r.name).trim().length < 2 || (!r._free && !(p >= 0)))) bad = r;
      });
      if (bad) {
        var el = $('.im-row[data-n="' + bad.n + '"]', box); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('bad'); }
        K.toast('Revisa la fila marcada en rojo: necesita nombre y precio válido.'); return;
      }
      K.saveData(function (d) {
        var made = {};
        sel.forEach(function (r) {
          var cat = r.cat;
          if (/^new:/.test(cat)) {
            var nm = cat.slice(4), key = norm(nm);
            var ex = d.categories.filter(function (c) { return norm(c.name) === key; })[0];
            if (!ex) {
              var id = K.slug(nm) || K.uid('c'); while (d.categories.some(function (c) { return c.id === id; })) id += '-2';
              ex = { id: id, name: nm, icon: '', order: d.categories.reduce(function (a, c) { return Math.max(a, c.order || 0); }, 0) + 1 };
              d.categories.push(ex);
            }
            cat = ex.id;
          }
          d.dishes.push({ id: K.uid('d'), category: cat, name: String(r.name).trim(), description: String(r.description || '').trim(),
            price: Math.round(r._p * 100) / 100, photo: '', video: '', available: !r._free, modes: { delivery: true, local: true } });
        });
      }, sel.length + ' plato(s) importados ✓').then(function () {
        box.innerHTML = K.head('Importar carta') +
          '<div class="empty-box"><div style="font-size:46px">✅</div><h3>Listo: ' + sel.length + ' plato(s) agregados</h3>' +
          '<p>Ahora puedes ponerles foto, video y precio desde «Platos».' + (sel.some(function (r) { return r._free; }) ? ' Los que no tenían precio quedaron como <b>no disponibles</b>.' : '') + '</p><div class="actions" style="justify-content:center"><button class="btn primary" id="imToDishes">Ir a Platos</button><button class="btn" id="imMore">Importar otra carta</button></div></div>';
        $('#imToDishes', box).onclick = function () { K.show('platos'); };
        $('#imMore', box).onclick = start;
      }).catch(function () {});
    }
    start();
  };
})();