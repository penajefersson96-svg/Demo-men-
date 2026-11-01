/* =====================================================
   sw.js — Servicio de la app instalable (PWA)

   • Guarda las pantallas y archivos del sistema para que abran rápido y,
     si se cae el internet, muestren al menos la estructura.
   • Siempre intenta primero la versión nueva (así, cuando subes cambios a GitHub,
     se ven de inmediato). Solo usa lo guardado si no hay conexión.
   • NO guarda pedidos, mesas ni datos de clientes: eso nunca pasa por aquí.
   • Cuando cambies muchos archivos, sube el número de VERSION para limpiar lo viejo.
   ===================================================== */
var VERSION = 'fogon-v3';
var SHELL = VERSION + '-shell';
var IMGS = VERSION + '-img';
var FONTS = VERSION + '-fonts';

var FILES = [
  './', 'index.html', 'carrito.html', 'pedido.html', 'admin.html', 'caja.html', 'cocina.html',
  'manifest.json', 'manifest-admin.json', 'manifest-caja.json', 'manifest-cocina.json',
  'css/styles.css', 'css/pedido.css', 'css/mesa.css', 'css/admin.css', 'css/admin-extra.css', 'css/caja.css', 'css/caja-cierre.css', 'css/cocina.css',
  'js/data.js', 'js/firebase-config.js', 'js/firebase-engine.js', 'js/backend.js', 'js/store.js', 'js/live.js', 'js/viewport.js', 'js/menu.js', 'js/mesa.js',
  'js/cart.js', 'js/pedido.js', 'js/order.js', 'js/staff.js', 'js/caja.js', 'js/caja-cierre.js', 'js/cocina.js',
  'js/admin.js', 'js/admin-extra.js', 'js/menu-import.js', 'js/imgbb.js', 'js/vendor/qrcode.js', 'js/pwa.js',
  'img/logo.svg', 'img/placeholder.svg',
  'img/icons/icon-192.png', 'img/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    /* uno por uno: si falta un archivo, los demás igual se guardan */
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function put(name, req, res) {
  if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(name).then(function (c) { c.put(req, copy); }); }
  return res;
}
function trim(name, max) {
  caches.open(name).then(function (c) { c.keys().then(function (k) { if (k.length > max) c.delete(k[0]).then(function () { trim(name, max); }); }); });
}

/* primero la red (máx. 4 s); si falla o tarda, lo guardado */
function networkFirst(req) {
  return new Promise(function (ok) {
    var done = false;
    function fromCache() {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        return r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    }
    var t = setTimeout(function () { if (!done) fromCache().then(function (r) { if (!done && r && r.type !== 'error') { done = true; ok(r); } }); }, 4000);
    fetch(req).then(function (res) { if (done) { put(SHELL, req, res); return; } done = true; clearTimeout(t); ok(put(SHELL, req, res)); })
      .catch(function () { if (!done) { done = true; clearTimeout(t); fromCache().then(ok); } });
  });
}

function cacheFirst(name, req, max) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) { var r = put(name, req, res); if (max) trim(name, max); return r; });
  });
}

function staleWhileRevalidate(name, req) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return put(name, req, res); }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/\/img\/(?!icons\/)/.test(url.pathname) && !/\/img\/logo/.test(url.pathname)) e.respondWith(cacheFirst(IMGS, req, 150));
    else e.respondWith(networkFirst(req));
    return;
  }
  /* tipografías: rápidas y estables */
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(staleWhileRevalidate(FONTS, req)); return; }
  /* fotos de los platos subidas a imgBB */
  if (/(^|\.)ibb\.co$/.test(url.hostname) && req.destination === 'image') { e.respondWith(cacheFirst(IMGS, req, 150)); return; }
  /* todo lo demás (tasa del dólar, Firebase, imgBB API…) pasa directo, sin guardar */
});