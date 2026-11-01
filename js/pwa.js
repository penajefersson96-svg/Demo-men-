/* =====================================================
   pwa.js — Registra la app instalable y ofrece «Instalar»
   Va en todas las pantallas. En administración, caja y cocina muestra una
   barrita para instalar; en el menú del cliente no molesta (se puede instalar
   desde el menú del navegador).
   ===================================================== */
(function () {
  'use strict';
  var isHttp = location.protocol.indexOf('http') === 0;
  if (isHttp && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  var staff = /\/(admin|caja|cocina)\.html$/.test(location.pathname);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (!staff || standalone) return;
  try { if (localStorage.getItem('fogon_pwa_hide') === '1') return; } catch (e) {}

  var deferred = null;
  function bar(html, withBtn) {
    if (document.getElementById('pwaBar')) return;
    var d = document.createElement('div');
    d.id = 'pwaBar';
    d.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:400;background:#241a14;color:#fff;border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 28px rgba(0,0,0,.35);font:500 14px/1.3 system-ui,sans-serif;max-width:520px;margin:0 auto');
    d.innerHTML = '<span style="flex:1">' + html + '</span>' +
      (withBtn ? '<button id="pwaGo" style="border:0;background:#f6b93b;color:#241a14;font-weight:700;border-radius:10px;height:38px;padding:0 14px">Instalar</button>' : '') +
      '<button id="pwaX" aria-label="Cerrar" style="border:0;background:transparent;color:#fff;font-size:22px;opacity:.7;width:32px;height:38px">×</button>';
    document.body.appendChild(d);
    document.getElementById('pwaX').onclick = function () { d.remove(); try { localStorage.setItem('fogon_pwa_hide', '1'); } catch (e) {} };
    var go = document.getElementById('pwaGo');
    if (go) go.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; d.remove(); }); };
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    bar('Instala esta pantalla como app en tu dispositivo.', true);
  });
  window.addEventListener('appinstalled', function () { var b = document.getElementById('pwaBar'); if (b) b.remove(); });

  /* iPhone / iPad: no hay botón automático; se explica el camino */
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios) window.addEventListener('load', function () { setTimeout(function () { bar('Para instalarla: toca <b>Compartir</b> ⎋ y luego <b>Agregar a inicio</b>.', false); }, 1500); });
})();