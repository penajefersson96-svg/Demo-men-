/* =====================================================
   firebase-engine.js — Base de datos y acceso con Firebase

   Reemplaza al modo local con las MISMAS funciones (DB y Auth), así que
   ninguna pantalla cambia. Se activa solo cuando js/firebase-config.js está lleno.

   • Datos: Firestore (tiempo real).
   • Clientes: entran con una sesión anónima (invisible para ellos).
   • Personal: correo + clave de Firebase Authentication; su rol (admin, caja, cocina)
     está en el documento staff/<uid> y lo verifican las reglas de seguridad.
   • Las IMÁGENES nunca se guardan aquí: van a imgBB y en Firebase solo queda el enlace.
   ===================================================== */
(function () {
  'use strict';

  var cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || !cfg.projectId) return;                 // sin configurar → modo de prueba

  if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.auth) {
    document.addEventListener('DOMContentLoaded', function () {
      var d = document.createElement('div');
      d.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b3261e;color:#fff;padding:10px 14px;font:600 14px system-ui,sans-serif;text-align:center');
      d.textContent = 'No se pudo cargar Firebase. Revisa tu internet y recarga la página.';
      document.body.appendChild(d);
    });
    return;                                                            // se queda en modo de prueba
  }

  var DAY = 24 * 60 * 60 * 1000;
  var DOMAIN = window.FIREBASE_STAFF_DOMAIN || 'personal.menu';
  var ROLES = ['admin', 'caja', 'cocina'];

  firebase.initializeApp(cfg);
  var fs = firebase.firestore();
  try { fs.settings({ experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true }); } catch (e) {}
  var auth = firebase.auth();

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ref(col, id) { return fs.collection(col).doc(String(id)); }
  function snapData(s) { return s.exists ? s.data() : null; }
  function fail(msg) { return Promise.reject(new Error(msg)); }
  function normUser(u) { return String(u || '').trim().toLowerCase(); }
  function toEmail(u) { u = normUser(u); return !u ? '' : (u.indexOf('@') >= 0 ? u : u + '@' + DOMAIN); }

  function nice(e) {
    var c = (e && e.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Usuario o clave incorrectos.';
    if (/invalid-email/.test(c)) return 'Ese correo no es válido.';
    if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    if (/network/.test(c)) return 'No hay conexión con Firebase. Revisa tu internet.';
    if (/weak-password/.test(c)) return 'La clave debe tener al menos 6 caracteres.';
    if (/email-already-in-use/.test(c)) return 'Ese usuario ya existe en Firebase.';
    if (/operation-not-allowed/.test(c)) return 'Falta activar «Correo y contraseña» en Firebase → Authentication → Método de acceso.';
    if (/permission-denied/.test(c)) return 'Firebase no permitió esta acción. Revisa que las reglas (firestore.rules) estén publicadas.';
    if (/requires-recent-login/.test(c)) return 'Por seguridad, vuelve a entrar y repite el cambio.';
    return (e && e.message) || 'Ocurrió un error con Firebase.';
  }
  function wrap(p) { return p.catch(function (e) { throw (e instanceof Error && !e.code) ? e : new Error(nice(e)); }); }

  /* =====================================================
     DB
     ===================================================== */
  var authInit = new Promise(function (res) {
    var off = auth.onAuthStateChanged(function (u) { off(); res(u); });
  }).then(function (u) {
    if (u) return u;
    return auth.signInAnonymously().then(function (r) { return r.user; }).catch(function (e) {
      console.warn('Activa el acceso «Anónimo» en Firebase → Authentication → Método de acceso.', e && e.code);
      return null;
    });
  });

  /* en las pantallas del personal, avisa con una franja roja si Firebase no deja leer algo (reglas) */
  function dbErr(col, e) {
    try {
      if (!document.body || !/\b(cj|kt)\b/.test(document.body.className)) return;
      var box = document.getElementById('dbErr');
      if (!box) {
        box = document.createElement('div'); box.id = 'dbErr';
        box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999;background:#b32d2d;color:#fff;font:600 13px sans-serif;padding:8px 12px;text-align:center';
        document.body.appendChild(box); box._l = {};
      }
      box._l[col] = (e && e.code) || 'error';
      box.textContent = '⚠️ Firebase no deja leer: ' + Object.keys(box._l).map(function (k) { return k + ' (' + box._l[k] + ')'; }).join(', ') + '. Sal y vuelve a entrar; si sigue, el administrador debe editar tu usuario (Equipo → Editar) y ponerte una clave nueva.';
    } catch (x) {}
  }

  var DB = {
    mode: 'firebase',
    ready: authInit.then(function () {}),

    get: function (col, id) { return ref(col, id).get().then(snapData); },
    set: function (col, id, doc) { return ref(col, id).set(clone(doc)); },
    update: function (col, id, fn) {
      var r = ref(col, id);
      return fs.runTransaction(function (tx) {
        return tx.get(r).then(function (s) {
          var cur = snapData(s), next = fn(clone(cur));
          if (next !== undefined) tx.set(r, clone(next));
          return next === undefined ? cur : next;
        });
      });
    },
    remove: function (col, id) { return ref(col, id).delete(); },
    list: function (col, o) {
      var q0 = fs.collection(col);
      if (o && o.field) {
        if (o.since != null) q0 = q0.where(o.field, '>=', o.since);
        if (o.before != null) q0 = q0.where(o.field, '<', o.before);
      }
      return q0.get().then(function (q) {
        var o = {}; q.forEach(function (d) { o[d.id] = d.data(); }); return o;
      });
    },
    watchDoc: function (col, id, cb) {
      return ref(col, id).onSnapshot(function (s) { cb(snapData(s)); }, function (e) { console.warn('watchDoc ' + col + '/' + id, e && e.code); dbErr(col, e); });
    },
    watchCollection: function (col, cb) {
      return fs.collection(col).onSnapshot(function (q) {
        var o = {}; q.forEach(function (d) { o[d.id] = d.data(); }); cb(o);
      }, function (e) { console.warn('watchCollection ' + col, e && e.code); dbErr(col, e); });
    }
  };

  /* =====================================================
     Auth
     ===================================================== */
  var sess = null;

  function loadSession() {
    var u = auth.currentUser;
    sess = null;
    if (!u || u.isAnonymous) return Promise.resolve(null);
    return ref('staff', u.uid).get().then(function (s) {
      if (!s.exists) return null;
      var d = s.data();
      sess = { user: d.user || u.email, name: d.name || '', role: d.role, uid: u.uid, email: u.email, exp: Date.now() + DAY };
      return sess;
    }).catch(function () { return null; });
  }
  function backToGuest() {
    sess = null;
    return auth.signOut().catch(function () {}).then(function () { return auth.signInAnonymously(); }).catch(function () {});
  }


  /* cambiar nombre, rol y/o clave de un usuario que ya existe.
     Firebase no deja que un administrador cambie la clave de OTRA persona desde el navegador, así que con clave nueva
     se crea una cuenta nueva con la misma identidad (usuario) y la anterior queda sin acceso. */
  function editStaff(u, o, m) {
    var olds = Object.keys(m).filter(function (k) { return normUser(m[k].user) === u; }), oldUid = olds[0], cur = m[oldUid];
    var role = ROLES.indexOf(o.role) >= 0 ? o.role : cur.role, name = o.name != null ? String(o.name) : (cur.name || '');
    var me = auth.currentUser;
    if (cur.role === 'admin' && role !== 'admin') {
      if (me && me.uid === oldUid) throw new Error('No puedes quitarte a ti mismo el rol de administrador.');
      var others = Object.keys(m).filter(function (k) { return m[k].role === 'admin' && k !== oldUid; });
      if (!others.length) throw new Error('Debe quedar al menos un administrador.');
    }
    if (!o.pass) {
      return DB.update('staff', oldUid, function (d) { if (!d) return undefined; d.role = role; d.name = name; return d; })
        .then(function () { return { message: 'Datos actualizados ✓' }; });
    }
    if (String(o.pass).length < 6) throw new Error('La clave debe tener al menos 6 caracteres.');
    if (me && me.uid === oldUid) throw new Error('Tu propia clave se cambia en «Mi cuenta», arriba.');
    var alias = (u.indexOf('@') > 0 ? u.split('@')[0] : u) + '.' + Date.now().toString(36) + '@' + DOMAIN;
    var sec = firebase.initializeApp(cfg, 'sec' + Date.now()), sa = sec.auth(), uid = '';
    function done() { return sec.delete().catch(function () {}); }
    return sa.createUserWithEmailAndPassword(alias, o.pass).then(function (c) {
      uid = c.user.uid; return sa.signOut();
    }).then(function () {
      return DB.set('logins', u, { email: alias, at: Date.now() });            // primero el acceso: si falla, no queda nada a medias
    }).then(function () {
      return DB.set('staff', uid, { user: u, name: name, role: role, email: alias });
    }).then(function () {
      return Promise.all(olds.map(function (k) { return DB.remove('staff', k); }));   // quita TODAS las fichas anteriores de ese usuario
    }).then(function () { return done().then(function () { return { message: 'Clave cambiada ✓ · ya puede entrar con la clave nueva' }; }); },
      function (e) { return done().then(function () { throw new Error(nice(e)); }); });
  }

  var Auth = {
    mode: 'firebase',
    ready: authInit.then(loadSession).then(function () {}),
    supportsStaffAdmin: true,
    current: function () { return (sess && sess.exp > Date.now()) ? sess : null; },

    login: function (user, pass, roles) {
      var email = toEmail(user);
      if (!email) return fail('Escribe tu correo o usuario.');
      /* si el administrador le cambió la clave, su acceso quedó en una cuenta nueva (colección «logins») */
      var mapP = DB.get('logins', normUser(user)).then(function (d) { return (d && d.email) || email; }).catch(function () { return email; });
      return wrap(mapP.then(function (em) { return auth.signInWithEmailAndPassword(em, String(pass || '')); }).then(loadSession).then(function (s) {
        if (!s) return backToGuest().then(function () { throw new Error('Este usuario no tiene acceso al sistema. Pídele al administrador que lo agregue.'); });
        if (roles && roles.indexOf(s.role) < 0 && s.role !== 'admin') {
          return backToGuest().then(function () { throw new Error('Este usuario no tiene permiso para esta pantalla.'); });
        }
        return s;
      }));
    },

    logout: function () { sess = null; return auth.signOut().catch(function () {}); },

    changeCredentials: function (o) {
      var u = auth.currentUser;
      if (!u || !sess) return fail('Tu sesión venció. Vuelve a entrar.');
      var nu = normUser(o.newUser);
      if (nu && toEmail(nu) !== u.email) return fail('En Firebase el correo de la cuenta no se cambia desde aquí. Crea otro administrador con el correo nuevo y quita este.');
      if (o.newPass && String(o.newPass).length < 6) return fail('La clave nueva debe tener al menos 6 caracteres.');
      var cred = firebase.auth.EmailAuthProvider.credential(u.email, String(o.currentPass || ''));
      return wrap(u.reauthenticateWithCredential(cred).catch(function (e) {
        if (/invalid-credential|wrong-password/.test((e && e.code) || '')) throw new Error('La clave actual no es correcta.');
        throw e;
      }).then(function () { return o.newPass ? u.updatePassword(o.newPass) : null; }).then(function () { return sess; }));
    },

    listStaff: function () {
      return DB.list('staff').then(function (m) {
        /* si un usuario quedó repetido (un cambio de clave que se cortó a la mitad), se deja solo la ficha vigente */
        var by = {}, jobs = [];
        Object.keys(m).forEach(function (k) { (by[normUser(m[k].user)] = by[normUser(m[k].user)] || []).push(k); });
        return Promise.all(Object.keys(by).filter(function (u) { return by[u].length > 1; }).map(function (u) {
          return DB.get('logins', u).catch(function () { return null; }).then(function (lg) {
            var ids = by[u], keep = ids.filter(function (k) { return lg && m[k].email === lg.email; })[0];
            if (!keep) return;                       // sin certeza de cuál es la vigente, no se borra nada
            ids.forEach(function (k) { if (k !== keep) { delete m[k]; jobs.push(DB.remove('staff', k).catch(function () {})); } });
          });
        })).then(function () { return Promise.all(jobs); }).then(function () {
          return Object.keys(m).map(function (k) {
            var d = m[k]; return { user: d.user, name: d.name, role: d.role, demoPass: false };
          }).sort(function (a, b) { return a.user < b.user ? -1 : 1; });
        });
      });
    },

    /* crea un usuario de caja/cocina sin cerrar la sesión del administrador (usa una conexión aparte) */
    saveStaff: function (o) {
      var u = normUser(o.user);
      if (!/^[a-z0-9._-]{3,30}$/.test(u) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u)) return fail('El usuario debe tener entre 3 y 30 letras, números, punto o guion (o ser un correo).');
      if (ROLES.indexOf(o.role) < 0) return fail('Elige un rol.');
      return DB.list('staff').then(function (m) {
        var exists = Object.keys(m).some(function (k) { return normUser(m[k].user) === u; });
        if (exists) return editStaff(u, o, m);
        if (!o.pass || String(o.pass).length < 6) throw new Error('La clave debe tener al menos 6 caracteres.');
        var email = toEmail(u), sec = firebase.initializeApp(cfg, 'sec' + Date.now()), sa = sec.auth(), uid = '';
        function done() { return sec.delete().catch(function () {}); }
        return sa.createUserWithEmailAndPassword(email, o.pass).then(function (c) {
          uid = c.user.uid; return sa.signOut();
        }).then(function () {
          return DB.set('staff', uid, { user: u, name: o.name || '', role: o.role, email: email });
        }).then(function () { return done().then(function () { return null; }); }, function (e) {
          return done().then(function () {
            if (e && /email-already-in-use/.test(e.code || '')) throw new Error('Ese usuario ya existe en Firebase (aunque lo hayas quitado de la lista). Elige otro nombre o bórralo en Firebase → Authentication.');
            throw new Error(nice(e));
          });
        });
      });
    },

    deleteStaff: function (user) {
      var u = normUser(user);
      if (sess && normUser(sess.user) === u) return fail('No puedes quitar tu propio usuario.');
      return DB.list('staff').then(function (m) {
        var uids = Object.keys(m).filter(function (k) { return normUser(m[k].user) === u; }), uid = uids[0];
        if (!uid) return null;
        var admins = Object.keys(m).filter(function (k) { return m[k].role === 'admin' && uids.indexOf(k) < 0; });
        if (m[uid].role === 'admin' && !admins.length) throw new Error('Debe quedar al menos un administrador.');
        return Promise.all(uids.map(function (k) { return DB.remove('staff', k); })).then(function () { return DB.remove('logins', u).catch(function () {}); });
      });
    },

    /* ---- primera vez: crear al administrador ---- */
    firstRun: function () { return DB.get('meta', 'setup').then(function (d) { return !d; }).catch(function () { return false; }); },
    createFirstAdmin: function (o) {
      var email = normUser(o.email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Escribe un correo válido.');
      if (!o.pass || String(o.pass).length < 6) return fail('La clave debe tener al menos 6 caracteres.');
      return wrap(Auth.firstRun().then(function (ok) {
        if (!ok) throw new Error('Ya existe un administrador. Entra con su correo y clave.');
        return auth.createUserWithEmailAndPassword(email, o.pass).catch(function (e) {
          // si la cuenta quedó creada de un intento anterior, se entra con ella
          if (e && /email-already-in-use/.test(e.code || '')) return auth.signInWithEmailAndPassword(email, o.pass);
          throw e;
        });
      }).then(function (c) {
        var b = fs.batch();
        b.set(ref('staff', c.user.uid), { user: email, name: o.name || 'Administrador', role: 'admin', email: email });
        b.set(ref('meta', 'setup'), { at: Date.now(), by: c.user.uid });
        return b.commit();
      }).then(loadSession).then(function (s) {
        if (!s) throw new Error('No se pudo crear el administrador. Revisa que las reglas estén publicadas.');
        return s;
      }));
    }
  };

  window.DB = DB;
  window.Auth = Auth;
})();