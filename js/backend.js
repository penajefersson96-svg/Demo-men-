/* =====================================================
   backend.js — Base de datos y acceso del personal (modo LOCAL)

   Define dos cosas que usan el menú, el panel, la caja y la cocina:

   DB    Base de datos de documentos (colecciones → documentos).
         Modo local: se guarda en el navegador y avisa a las otras pestañas.
         DB.mode        'local'  (con Firebase será 'firebase')
         DB.ready       promesa: ya se puede usar
         DB.get(col, id)                → promesa con el documento o null
         DB.set(col, id, doc)           → guarda (reemplaza)
         DB.update(col, id, fn)         → lee, fn(doc|null) devuelve el documento nuevo
                                          (o undefined para no cambiar nada); es atómico
         DB.remove(col, id)             → borra
         DB.list(col)                   → promesa con { id: doc, … }
         DB.watchDoc(col, id, cb)       → cb(doc|null) en vivo; devuelve la función para dejar de escuchar
         DB.watchCollection(col, cb)    → cb({ id: doc, … }) en vivo

   Auth  Usuarios del personal (admin, caja, cocina).
         Claves guardadas como hash SHA-256 de "usuario:clave".

   Al final del proyecto este archivo se reemplaza por la versión de Firebase,
   con las MISMAS funciones: ninguna pantalla cambia.
   ===================================================== */
(function () {
  'use strict';

  var PREFIX = 'fogon_db_';
  var watchers = [];

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function readCol(col) {
    try { var o = JSON.parse(localStorage.getItem(PREFIX + col)); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
  }
  function writeCol(col, o) {
    try { localStorage.setItem(PREFIX + col, JSON.stringify(o)); } catch (e) {}
  }
  function fire(col) {
    watchers.slice().forEach(function (w) {
      if (w.col !== col) return;
      try {
        if (w.id != null) { var d = readCol(col)[w.id]; w.fn(d == null ? null : clone(d)); }
        else w.fn(clone(readCol(col)));
      } catch (e) {}
    });
  }
  // cambios hechos desde otras pestañas del mismo navegador
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(PREFIX) === 0) fire(e.key.slice(PREFIX.length));
  });

  function addWatcher(w) {
    watchers.push(w);
    return function () { watchers = watchers.filter(function (x) { return x !== w; }); };
  }

  var DB = {
    mode: 'local',
    ready: Promise.resolve(),

    get: function (col, id) {
      var d = readCol(col)[id];
      return Promise.resolve(d == null ? null : clone(d));
    },
    set: function (col, id, doc) {
      var o = readCol(col); o[id] = clone(doc); writeCol(col, o); fire(col);
      return Promise.resolve();
    },
    update: function (col, id, fn) {
      var o = readCol(col), cur = o[id] == null ? null : clone(o[id]);
      var next = fn(cur);
      if (next !== undefined) { o[id] = clone(next); writeCol(col, o); fire(col); }
      return Promise.resolve(next === undefined ? cur : next);
    },
    remove: function (col, id) {
      var o = readCol(col); delete o[id]; writeCol(col, o); fire(col);
      return Promise.resolve();
    },
    list: function (col) { return Promise.resolve(clone(readCol(col))); },

    watchDoc: function (col, id, cb) {
      var unsub = addWatcher({ col: col, id: id, fn: cb });
      var d = readCol(col)[id]; cb(d == null ? null : clone(d));
      return unsub;
    },
    watchCollection: function (col, cb) {
      var unsub = addWatcher({ col: col, id: null, fn: cb });
      cb(clone(readCol(col)));
      return unsub;
    }
  };

  /* =====================================================
     Auth — personal del restaurante
     ===================================================== */
  var SESS_KEY = 'fogon_staff_sess_v1';
  var FAIL_KEY = 'fogon_staff_fail_v1';
  var DAY = 24 * 60 * 60 * 1000;
  var ROLES = ['admin', 'caja', 'cocina'];
  var DEMO = [['admin', 'admin123', 'Administrador'], ['caja', 'caja123', 'Caja'], ['cocina', 'cocina123', 'Cocina']];

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function normUser(u) { return String(u || '').trim().toLowerCase(); }
  function fail(msg) { return Promise.reject(new Error(msg)); }

  function hash(user, pass) {
    if (!window.crypto || !window.crypto.subtle) {
      return fail('Tu navegador no permite el cifrado necesario. Abre el sistema desde una dirección https.');
    }
    var bytes = new TextEncoder().encode(normUser(user) + ':' + pass);
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // usuarios de demostración la primera vez
  var ready = DB.list('staff').then(function (list) {
    if (Object.keys(list).length) return;
    return Promise.all(DEMO.map(function (d) {
      return hash(d[0], d[1]).then(function (h) {
        return DB.set('staff', d[0], { user: d[0], name: d[2], role: d[0], hash: h, demoPass: true });
      });
    }));
  }).catch(function () {});

  function current() {
    var s = readJSON(SESS_KEY);
    return (s && s.exp > Date.now()) ? s : null;
  }
  function startSession(doc) {
    var s = { user: doc.user, name: doc.name || '', role: doc.role, exp: Date.now() + DAY };
    writeJSON(SESS_KEY, s);
    return s;
  }

  var Auth = {
    ready: ready,
    supportsStaffAdmin: true,
    current: current,

    login: function (user, pass, roles) {
      var f = readJSON(FAIL_KEY) || { n: 0, until: 0 };
      if (Date.now() < f.until) return fail('Demasiados intentos. Espera ' + Math.ceil((f.until - Date.now()) / 1000) + ' segundos.');
      var u = normUser(user);
      return Promise.all([hash(u, pass), DB.get('staff', u)]).then(function (r) {
        var doc = r[1];
        if (!doc || doc.hash !== r[0]) {
          f.n = (f.n || 0) + 1;
          if (f.n >= 5) { f.until = Date.now() + 30000; f.n = 0; }
          writeJSON(FAIL_KEY, f);
          throw new Error('Usuario o clave incorrectos.');
        }
        if (roles && roles.indexOf(doc.role) < 0 && doc.role !== 'admin') throw new Error('Este usuario no tiene permiso para esta pantalla.');
        try { localStorage.removeItem(FAIL_KEY); } catch (e) {}
        return startSession(doc);
      });
    },

    logout: function () {
      try { localStorage.removeItem(SESS_KEY); } catch (e) {}
      return Promise.resolve();
    },

    /* el usuario actual cambia su usuario y/o su clave */
    changeCredentials: function (o) {
      var s = current();
      if (!s) return fail('Tu sesión venció. Vuelve a entrar.');
      var newUser = normUser(o.newUser || s.user);
      if (!/^[a-z0-9._-]{3,30}$/.test(newUser)) return fail('El usuario debe tener entre 3 y 30 letras, números, punto o guion, sin espacios.');
      if (o.newPass && String(o.newPass).length < 6) return fail('La clave nueva debe tener al menos 6 caracteres.');
      return Promise.all([hash(s.user, o.currentPass || ''), DB.get('staff', s.user), DB.get('staff', newUser)]).then(function (r) {
        var doc = r[1];
        if (!doc || doc.hash !== r[0]) throw new Error('La clave actual no es correcta.');
        if (newUser !== s.user && r[2]) throw new Error('Ese usuario ya existe.');
        var pass = o.newPass || o.currentPass;
        return hash(newUser, pass).then(function (h) {
          var next = { user: newUser, name: doc.name, role: doc.role, hash: h, demoPass: o.newPass ? false : !!doc.demoPass };
          return DB.set('staff', newUser, next)
            .then(function () { return newUser !== s.user ? DB.remove('staff', s.user) : null; })
            .then(function () { return startSession(next); });
        });
      });
    },

    listStaff: function () {
      return DB.list('staff').then(function (m) {
        return Object.keys(m).map(function (k) {
          var d = m[k]; return { user: d.user, name: d.name, role: d.role, demoPass: !!d.demoPass };
        }).sort(function (a, b) { return a.user < b.user ? -1 : 1; });
      });
    },
    saveStaff: function (o) {
      var u = normUser(o.user);
      if (!/^[a-z0-9._-]{3,30}$/.test(u)) return fail('El usuario debe tener entre 3 y 30 letras, números, punto o guion, sin espacios.');
      if (ROLES.indexOf(o.role) < 0) return fail('Elige un rol.');
      if (!o.pass || String(o.pass).length < 6) return fail('La clave debe tener al menos 6 caracteres.');
      return hash(u, o.pass).then(function (h) {
        return DB.set('staff', u, { user: u, name: o.name || '', role: o.role, hash: h, demoPass: false });
      });
    },
    deleteStaff: function (user) {
      var s = current();
      if (s && normUser(user) === s.user) return fail('No puedes quitar tu propio usuario.');
      return DB.list('staff').then(function (m) {
        var admins = Object.keys(m).filter(function (k) { return m[k].role === 'admin' && k !== normUser(user); });
        if (m[normUser(user)] && m[normUser(user)].role === 'admin' && !admins.length) throw new Error('Debe quedar al menos un administrador.');
        return DB.remove('staff', normUser(user));
      });
    }
  };

  window.DB = DB;
  window.Auth = Auth;
})();