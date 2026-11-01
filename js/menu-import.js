
/* =====================================================
   menu-import.js — Leer una carta desde una foto o un PDF

   • PDF con texto  → se lee el texto directamente (pdf.js)
   • Foto o PDF escaneado → se lee con OCR (Tesseract.js, en español)
   • Todo ocurre en el navegador: la carta NO se sube a ningún servidor.
   • El resultado es una LISTA PARA REVISAR: nada se guarda hasta que el administrador la confirma.

   Las librerías se descargan solo cuando se usa esta función.
   ===================================================== */
(function () {
  'use strict';

  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = function () { fail(new Error('No se pudo descargar la herramienta de lectura. Revisa tu conexión a internet.')); };
      document.head.appendChild(s);
    });
  }

  /* =====================================================
     Analizador de texto  →  [{ name, description, price, category }]
     ===================================================== */
  var PRICE_END = /(?:^|[\s.·…_\-–—:])(?:(?:\$|usd|us\$|\$\s?)\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\$|usd|\$\s?|dolares|dólares)?\s*$/i;

  function clean(s) {
    return String(s || '').replace(/[ \t]+/g, ' ').replace(/[|¦]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  function lettersOf(s) { return s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, ''); }
  function isUpper(s) { var l = lettersOf(s); return l.length >= 3 && l === l.toUpperCase(); }
  function titleCase(s) {
    s = s.toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function words(s) { return s.split(/\s+/).filter(Boolean); }

  /* separa "Nombre ....... 8.50" en { text, price } (price = null si no hay) */
  function splitPrice(line) {
    var m = line.match(PRICE_END);
    if (!m) return { text: line, price: null };
    var raw = m[1].replace(',', '.'), p = parseFloat(raw);
    var text = line.slice(0, m.index).replace(/[\s.·…_\-–—:$]+$/, '').trim();
    if (!(p > 0) || p > 999) return { text: line, price: null };
    return { text: text, price: Math.round(p * 100) / 100 };
  }

  /* plantillas con el precio sin llenar: "Plato  [Precio]", "Plato  $___", "Plato  (precio)" */
  var PLACEHOLDER = /\s*(?:\[[^\]]{0,20}\]|\{[^}]{0,20}\}|\((?:precio|price)\)|\$?\s*[_\u2026.]{3,}\s*\$?|\$\s*[xX?]+)\s*$/i;
  function withoutPlaceholder(line) {
    var m = line.match(PLACEHOLDER);
    if (!m || m.index < 3) return null;
    var t = line.slice(0, m.index).replace(/[\s.·…_\-–—:]+$/, '').trim();
    return lettersOf(t).length >= 3 ? t : null;
  }

  function looksLikeHeading(line, nextHasPrice) {
    if (/:$/.test(line) && words(line).length <= 5) return true;
    if (isUpper(line) && words(line).length <= 5 && line.length <= 40) return true;
    var w = words(line);
    if (nextHasPrice && w.length <= 2 && line.length <= 24 && !/[,.;]/.test(line)) return true;
    return false;
  }

  function parseText(text) {
    var NOISE = /\d{7,}|\d[\d\s.-]{8,}\d|www\.|https?:|@|\b(tel|telf|tlf|whatsapp|rif|instagram|facebook|tiktok)\b|\b(page|pagina|página|pág|pag)\.?\s*\d+\s*(of|de|\/)\s*\d+/i;
    var lines = String(text || '').split(/\r?\n/).map(clean).filter(function (l) { return l.length > 0 && !NOISE.test(l); });
    var out = [], cat = '', cur = null, pending = [];

    function hasPriceAt(i) { return i < lines.length && splitPrice(lines[i]).price !== null && lettersOf(splitPrice(lines[i]).text).length >= 3; }

    function pushDish(name, price, desc) {
      name = name.replace(/^[\-–—•·*\d.)]+\s+(?=[A-Za-zÁÉÍÓÚÑ])/, '').trim();   // viñetas / numeración
      if (lettersOf(name).length < 2) return null;
      var d = { name: isUpper(name) ? titleCase(name) : name, description: desc || '', price: price, category: cat };
      out.push(d); return d;
    }

    /* ¿el precio de esta línea sin precio llega solo en una línea más abajo? */
    function priceComesAlone(i) {
      for (var k = i + 1; k < Math.min(lines.length, i + 4); k++) {
        var q = splitPrice(lines[k]);
        if (q.price !== null) return lettersOf(q.text).length === 0;
      }
      return false;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var sp = splitPrice(line);
      var nameLetters = lettersOf(sp.text).length;

      /* solo precio ("8.50") → cierra el nombre y la descripción acumulados arriba */
      if (sp.price !== null && nameLetters === 0 && pending.length) {
        cur = pushDish(pending[0], sp.price, pending.slice(1).join(' ')); pending = []; continue;
      }
      /* nombre con el precio por llenar */
      var ph = sp.price === null ? withoutPlaceholder(line) : null;
      if (ph) { pending = []; cur = pushDish(ph, null, ''); continue; }
      /* línea con nombre y precio */
      if (sp.price !== null && nameLetters >= 3) {
        pending = [];
        var nm = sp.text, ds = '';
        var sep = nm.match(/^(.{2,60}?)\s+[–—-]\s+(.+)$/);                // "Nombre - descripción"
        if (sep && words(sep[1]).length <= 6) { nm = sep[1]; ds = sep[2]; }
        cur = pushDish(nm, sp.price, ds); continue;
      }
      /* sin precio: ¿categoría, descripción o nombre cuyo precio viene después? */
      if (looksLikeHeading(line, hasPriceAt(i + 1))) {
        cat = line.replace(/:$/, '').trim(); cat = isUpper(cat) ? titleCase(cat) : cat; cur = null; pending = []; continue;
      }
      if (pending.length || priceComesAlone(i)) { pending.push(line); continue; }
      if (cur && cur.description.length < 600) {
        cur.description = (cur.description ? cur.description + ' ' : '') + line; continue;
      }
      pending = [line];
    }
    out.forEach(function (d) {                                  /* el formulario admite 500 caracteres */
      if (d.description.length > 500) d.description = d.description.slice(0, 497).replace(/\s+\S*$/, '') + '…';
    });
    return out;
  }

  /* =====================================================
     Lectura de archivos
     ===================================================== */
  function readPdf(file, onProgress) {
    return (window.pdfjsLib ? Promise.resolve() : loadScript(PDFJS)).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function (pdf) {
      var pages = [], chain = Promise.resolve(), max = Math.min(pdf.numPages, 15);
      for (var n = 1; n <= max; n++) (function (n) {
        chain = chain.then(function () { return pdf.getPage(n); }).then(function (pg) {
          return pg.getTextContent().then(function (tc) {
            /* reconstruye las líneas según la posición vertical */
            var rows = {};
            tc.items.forEach(function (it) {
              var y = Math.round(it.transform[5] / 3);
              (rows[y] = rows[y] || []).push(it);
            });
            var text = Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).map(function (y) {
              return rows[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; }).map(function (it) { return it.str; }).join(' ');
            }).join('\n');
            pages.push({ n: n, text: text, page: pg });
            if (onProgress) onProgress('Leyendo página ' + n + ' de ' + max + '…', n / max);
          });
        });
      })(n);
      return chain.then(function () { return { pdf: pdf, pages: pages, truncated: pdf.numPages > max }; });
    });
  }

  function ocrSource(src, onProgress, label) {
    return (window.Tesseract ? Promise.resolve() : loadScript(TESS)).then(function () {
      return window.Tesseract.recognize(src, 'spa', {
        logger: function (m) {
          if (onProgress && m.status === 'recognizing text') onProgress((label || 'Leyendo la imagen') + '… ' + Math.round(m.progress * 100) + '%', m.progress);
          else if (onProgress && /loading/.test(m.status || '')) onProgress('Preparando el lector (la primera vez tarda un poco)…', 0);
        }
      });
    }).then(function (r) { return r.data.text; });
  }

  function pageToCanvas(pg) {
    var vp = pg.getViewport({ scale: 2 }), c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { return c; });
  }

  /* Devuelve { text, method, note } */
  function extract(file, onProgress) {
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      return ocrSource(file, onProgress).then(function (t) { return { text: t, method: 'ocr', note: '' }; });
    }
    return readPdf(file, onProgress).then(function (r) {
      var txt = r.pages.map(function (p) { return p.text; }).join('\n');
      var note = r.truncated ? 'Solo se leyeron las primeras 15 páginas.' : '';
      if (lettersOf(txt).length > 80) return { text: txt, method: 'pdf', note: note };
      /* PDF escaneado (sin texto): se pasa cada página por el OCR */
      var out = [], chain = Promise.resolve();
      r.pages.forEach(function (p) {
        chain = chain.then(function () { return pageToCanvas(p.page); }).then(function (c) {
          return ocrSource(c, onProgress, 'Leyendo página ' + p.n + ' de ' + r.pages.length);
        }).then(function (t) { out.push(t); });
      });
      return chain.then(function () { return { text: out.join('\n'), method: 'ocr', note: note }; });
    });
  }

  window.MenuImport = { parseText: parseText, extract: extract };
  if (typeof module !== 'undefined') module.exports = window.MenuImport;
})();