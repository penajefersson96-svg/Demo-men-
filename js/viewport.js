/* =====================================================
   viewport.js — Aviso cuando el teléfono está en "Sitio para computadora"

   Si el navegador del teléfono tiene activado "Sitio para computadora"
   (o "Versión de escritorio"), ignora el ajuste a pantalla pequeña y muestra
   todo como en una PC. El código no puede cambiar eso, pero sí detectarlo y
   explicarle al cliente cómo corregirlo en un toque.
   ===================================================== */
(function () {
  'use strict';

  var KEY = 'fogon_vp_hint';

  function isPhoneInDesktopMode() {
    var touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    var sw = window.screen ? window.screen.width : 0, sh = window.screen ? window.screen.height : 0;
    var portrait = sh > sw;                                        // teléfono en vertical
    var iw = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    return touch && sw > 0 && sw <= 520 && portrait && iw > sw * 1.4;   // la página es mucho más ancha que la pantalla
  }

  function show() {
    try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}
    var css = document.createElement('style');
    css.textContent =
      '.vp-banner{position:fixed;left:0;right:0;top:0;z-index:9999;background:#241a14;color:#fff;font:600 15px/1.4 system-ui,sans-serif;' +
      'padding:14px 16px;display:flex;gap:12px;align-items:flex-start;box-shadow:0 4px 18px rgba(0,0,0,.3)}' +
      '.vp-banner b{color:#f2b134}.vp-banner button{flex:none;background:#c8501e;color:#fff;border:0;border-radius:10px;padding:9px 14px;font:700 14px system-ui,sans-serif}';
    document.head.appendChild(css);
    var d = document.createElement('div');
    d.className = 'vp-banner';
    d.setAttribute('role', 'status');
    d.innerHTML = '<div>Tu navegador está mostrando la <b>versión de computadora</b>. ' +
      'Toca el menú <b>⋮</b> del navegador y desactiva <b>«Sitio para computadora»</b> para ver esta página ajustada a tu teléfono.</div>' +
      '<button type="button">Entendido</button>';
    d.querySelector('button').addEventListener('click', function () {
      d.remove(); try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    });
    document.body.appendChild(d);
  }

  function run() { if (isPhoneInDesktopMode()) show(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();