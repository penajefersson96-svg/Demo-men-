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
        '<label for="lUser">' + (DB.mode === 'firebase' ? 'Correo o usuario' : 'Usuario') + '</label>' +
        '<input id="lUser" name="user" type="text" autocomplete="username" autocapitalize="none" spellcheck="false">' +
        '<label for="lPass">Clave</label>' +
        '<div class="pass-row"><input id="lPass" name="pass" type="password" autocomplete="current-password">' +
          '<button type="button" id="lShow" class="link-btn" aria-label="Mostrar u ocultar la clave">Ver</button></div>' +
        '<p class="login-err" id="lErr" role="alert"></p>' +
        '<button class="btn primary block lg" type="submit" id="lBtn">Entrar</button>' +
        (Auth.resetPassword ? '<p style="text-align:center;margin:14px 0 0"><button type="button" class="link-btn" id="lForgot">¿Olvidaste tu clave?</button></p>' : '') +
        (/^\d{8,15}$/.test(String(window.SUPPORT_WHATSAPP || '')) ? '<p style="text-align:center;margin:10px 0 0;font-size:14px;color:var(--muted)">¿Problemas para entrar? <a href="https://wa.me/' + window.SUPPORT_WHATSAPP + '" target="_blank" rel="noopener">Escribe a soporte</a></p>' : '') +
        demo +
        '<p id="lFirst"></p>' +
      '</form></div>';

    var f = document.getElementById('loginForm'), err = document.getElementById('lErr'), btn = document.getElementById('lBtn');
    document.getElementById('lUser').focus();
    document.getElementById('lShow').addEventListener('click', function () {
      var i = document.getElementById('lPass');
      i.type = i.type === 'password' ? 'text' : 'password';
      this.textContent = i.type === 'password' ? 'Ver' : 'Ocultar';
    });
    var forgot = document.getElementById('lForgot');
    if (forgot) forgot.addEventListener('click', function () {
      var u = f.user.value.trim();
      err.style.color = '';
      if (!u) { err.textContent = 'Escribe arriba tu correo y vuelve a tocar «¿Olvidaste tu clave?».'; f.user.focus(); return; }
      forgot.disabled = true;
      Auth.resetPassword(u).then(function (msg) { err.style.color = '#2e7d32'; err.textContent = msg; })
        .catch(function (ex) { err.style.color = ''; err.textContent = ex.message || 'No se pudo enviar el correo.'; })
        .then(function () { forgot.disabled = false; });
    });
    // Firebase, primera vez: ofrece crear al administrador
    if (DB.mode === 'firebase' && o.roles.indexOf('admin') >= 0 && Auth.firstRun) {
      Auth.firstRun().then(function (yes) {
        if (!yes) return;
        var p = document.getElementById('lFirst');
        p.innerHTML = '<button type="button" class="link-btn" id="lSetup">Primera vez: crear el administrador</button>';
        document.getElementById('lSetup').addEventListener('click', function () { showSetup(root, o); });
      });
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = ''; err.style.color = ''; btn.disabled = true; btn.textContent = 'Entrando…';
      Auth.login(f.user.value, f.pass.value, o.roles).then(function (s) {
        o.onReady(s);
      }).catch(function (ex) {
        if (!document.getElementById('lPass')) { if (window.console) console.error(ex); return; }   // la pantalla ya cambió: el error no es del acceso
        err.textContent = ex.message || 'No se pudo entrar.';
        btn.disabled = false; btn.textContent = 'Entrar';
        document.getElementById('lPass').select();
      });
    });
  }

  /* Firebase: creación del primer administrador (solo se puede una vez) */
  function showSetup(root, o) {
    var c = Store.config();
    root.innerHTML =
      '<div class="login-wrap"><form class="login-card" id="setupForm" novalidate>' +
        '<img class="login-logo" src="' + esc(c.logo || 'img/logo.svg') + '" alt="">' +
        '<h1>Crear administrador</h1>' +
        '<p class="login-sub">Esta cuenta controla todo el sistema. Usa un correo real tuyo.</p>' +
        '<label for="sMail">Correo</label><input id="sMail" type="email" autocomplete="username" autocapitalize="none" spellcheck="false">' +
        '<label for="sName">Tu nombre</label><input id="sName" type="text" autocomplete="name" maxlength="40">' +
        '<label for="sP1">Clave (mínimo 6 caracteres)</label><input id="sP1" type="password" autocomplete="new-password">' +
        '<label for="sP2">Repetir clave</label><input id="sP2" type="password" autocomplete="new-password">' +
        '<p class="login-err" id="sErr" role="alert"></p>' +
        '<button class="btn primary block lg" type="submit" id="sBtn">Crear y entrar</button>' +
        '<p><button type="button" class="link-btn" id="sBack">← Volver</button></p>' +
      '</form></div>';
    var f = document.getElementById('setupForm'), err = document.getElementById('sErr'), btn = document.getElementById('sBtn');
    document.getElementById('sBack').addEventListener('click', function () { showLogin(root, o); });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var p1 = document.getElementById('sP1').value;
      if (p1 !== document.getElementById('sP2').value) { err.textContent = 'Las claves no coinciden.'; return; }
      btn.disabled = true; btn.textContent = 'Creando…';
      Auth.createFirstAdmin({ email: document.getElementById('sMail').value, name: document.getElementById('sName').value.trim(), pass: p1 })
        .then(function (s) { o.onReady(s); })
        .catch(function (ex) { err.textContent = ex.message || 'No se pudo crear.'; btn.disabled = false; btn.textContent = 'Crear y entrar'; });
    });
  }

  function logout() { return Auth.logout().then(function () { location.reload(); }); }

  window.StaffUI = { start: start, logout: logout };
})();