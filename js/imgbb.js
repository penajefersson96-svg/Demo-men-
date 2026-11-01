/* =====================================================
   imgbb.js — Subir fotos de platos / logo a imgBB
   La clave de imgBB la guarda el administrador en
   "Equipo y cuenta" (se almacena en secrets/main, que solo ve el personal).
   Antes de subir, la imagen se reduce para que cargue rápido.
   ===================================================== */
(function () {
  'use strict';

  var API = 'https://api.imgbb.com/1/upload';

  function loadImage(file) {
    return new Promise(function (ok, fail) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('No se pudo leer la imagen. Prueba con un JPG o PNG.')); };
      img.src = url;
    });
  }

  /* Reduce a un lado máximo y devuelve un dataURL JPEG */
  function shrink(file, maxSide, quality) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxSide / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);     // fondo blanco para PNG con transparencia
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', quality);
    });
  }

  function getKey() {
    return DB.get('secrets', 'main').then(function (d) { return d && d.imgbbKey ? String(d.imgbbKey).trim() : ''; })
      .catch(function () { return ''; });
  }

  /* Devuelve la URL pública de la imagen */
  function upload(file, opts) {
    opts = opts || {};
    if (!file || !/^image\//.test(file.type)) return Promise.reject(new Error('Elige un archivo de imagen.'));
    return getKey().then(function (key) {
      if (!key) {
        // Sin clave: solo en modo de prueba (local) se guarda la imagen dentro del navegador
        if (DB.mode !== 'local') throw new Error('Falta la clave de imgBB. Agrégala en "Equipo y cuenta".');
        return shrink(file, opts.localMax || 700, 0.72);
      }
      return shrink(file, opts.max || 1100, 0.82).then(function (dataUrl) {
        var fd = new FormData();
        fd.append('image', dataUrl.split(',')[1]);                       // base64 sin el encabezado
        return fetch(API + '?key=' + encodeURIComponent(key), { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.success) throw new Error((j && j.error && j.error.message) || 'imgBB no aceptó la imagen.');
            return (j.data && (j.data.display_url || j.data.url)) || '';
          });
      });
    }).catch(function (e) {
      if (e instanceof TypeError) throw new Error('No hay conexión con imgBB. Revisa tu internet.');
      throw e;
    });
  }

  window.Img = { upload: upload, getKey: getKey };
})();