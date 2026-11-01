/* =====================================================
   staff.js — Pantalla de acceso del personal
   La usan admin.html, y luego caja.html y cocina.html.

   StaffUI.start(root, {
     roles: ['admin'],              // quién puede entrar a esta pantalla (el admin entra a todas)
     title: 'Panel del administrador',
     onReady: function (session) {…}   // se llama cuando ya hay sesión válida
   })
   ===================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function start(root, o) {
    Store.ready.then(function () { return Auth.ready; }).then(function () {
      var s = Auth.current();
      if (s && (o.roles.indexOf(s.role) >= 0 || s.role === 'admin')) { o.onReady(s); return; }
      showLogin(root, o);
    });
  }

  function showLogin(root, o) {
    var c = Store.config();
    var demo = (DB.mode === 'local')
      ? '<p class="login-demo">Modo de prueba · usuario <b>' + esc(o.demoUser || 'admin') + '</b> · clave <b>' + esc(o.demoPass || 'admin123') + '</b></p>' : '';

    root.innerHTML =
      '<div class="login-wrap"><form class="login-card" id="loginForm" novalidate>' +
        '<img class="login-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
        '<h1>' + esc(o.title || 'Acceso del personal') + '</h1>' +
        '<p class="login-sub">' + esc(c.name) + '</p>' +
        '<label for="lUser">' + (DB.mode === 'firebase' ? 'Correo' : 'Usuario') + '</label>' +
        '<input id="lUser" name="user" type="text" autocomplete="username" autocapitalize="none" spellcheck="false">' +
        '<label for="lPass">Clave</label>' +
        '<div class="pass-row"><input id="lPass" name="pass" type="password" autocomplete="current-password">' +
          '<button type="button" id="lShow" class="link-btn" aria-label="Mostrar u ocultar la clave">Ver</button></div>' +
        '<p class="login-err" id="lErr" role="alert"></p>' +
        '<button class="btn primary block lg" type="submit" id="lBtn">Entrar</button>' +
        demo +
      '</form></div>';

    var f = document.getElementById('loginForm'), err = document.getElementById('lErr'), btn = document.getElementById('lBtn');
    document.getElementById('lUser').focus();
    document.getElementById('lShow').addEventListener('click', function () {
      var i = document.getElementById('lPass');
      i.type = i.type === 'password' ? 'text' : 'password';
      this.textContent = i.type === 'password' ? 'Ver' : 'Ocultar';
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
      Auth.login(f.user.value, f.pass.value, o.roles).then(function (s) {
        o.onReady(s);
      }).catch(function (ex) {
        err.textContent = ex.message || 'No se pudo entrar.';
        btn.disabled = false; btn.textContent = 'Entrar';
        document.getElementById('lPass').select();
      });
    });
  }

  function logout() { return Auth.logout().then(function () { location.reload(); }); }

  window.StaffUI = { start: start, logout: logout };
})();