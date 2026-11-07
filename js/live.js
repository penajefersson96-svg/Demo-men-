/* =====================================================
   live.js — Sesiones de mesa EN VIVO (mesa, caja y cocina)

   Va montado sobre DB (backend.js), colección "sessions", un documento por mesa.
   Cuando se cambie a Firebase no hace falta tocar este archivo.

   Privacidad: una sesión existe solo mientras hay clientes sentados.
   Al liberar la mesa (release) se BORRA todo: nombres, pedidos y llamados.

   Forma de una sesión:
   {
     tableId, status: 'open' | 'bill_requested', openedAt, updatedAt, round,
     people: { pid: { name, joinedAt } },
     items:  [ { id, pid, who, dishId, name, price, qty, status, round, at } ],
     calls:  { waiter: {at, by} | null, bill: {at, by} | null }
   }
   Estados de un plato: draft → sent → accepted → cooking → ready → served
   ===================================================== */
(function () {
  'use strict';

  var COL = 'sessions';

  /* ---------- clave secreta por mesa ----------
     Cada mesa tiene un código (colección «tablekeys», solo lo lee el personal) que va dentro del QR.
     La mesa se guarda en el documento «<mesa>_<código>»: sin el código no se puede ni encontrar ni escribir. */
  var KEYS_COL = 'tablekeys', OPEN_COL = 'opentables', REQ_COL = 'tablereq', keys = {}, known = {}, keysWatching = false;
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genKey() {
    var out = '', a = new Uint32Array(8);
    try { (window.crypto || window.msCrypto).getRandomValues(a); } catch (e) { for (var j = 0; j < 8; j++) a[j] = Math.floor(Math.random() * 4294967296); }
    for (var i = 0; i < 8; i++) out += ALPHA.charAt(a[i] % ALPHA.length);
    return out;
  }
  function docId(t) {
    t = String(t);
    return known[t] || (keys[t] ? t + '_' + keys[t] : t);
  }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function newSession(id) {
    return { tableId: id, status: 'open', openedAt: Date.now(), updatedAt: Date.now(), round: 0,
             people: {}, items: [], calls: { waiter: null, bill: null }, waiter: null };
  }

  /* ---------- turno del día: meseros que trabajan hoy, en orden de asignación ----------
     Documento shift/today = { day:'2026-10-31', waiters:[{id,name}], cursor:0 }
     La caja lo arma al empezar el día. Cada mesa nueva que pide recibe al siguiente de la lista. */
  var SHIFT_COL = 'shift', SHIFT_ID = 'today';

  function dayKey() {
    var tz = (window.Store && Store.config().timezone) || 'America/Caracas';
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  /* Toma al siguiente mesero del turno (rotación) y avanza el turno. Devuelve {id,name} o null. */
  function nextWaiter() {
    var pick = null;
    return DB.update(SHIFT_COL, SHIFT_ID, function (sh) {
      pick = null;                                  // (la transacción puede repetirse)
      if (!sh || sh.day !== dayKey() || !sh.waiters || !sh.waiters.length) return undefined;
      var n = sh.waiters.length, i = (sh.cursor || 0) % n;
      pick = sh.waiters[i];
      sh.cursor = (i + 1) % n;
      return sh;
    }).then(function () { return pick ? { id: pick.id, name: pick.name } : null; });
  }

  /* Modifica una sesión de forma atómica. fn(s) devuelve el resultado; si la mesa no existe y create=false, no hace nada. */
  function mutate(tableId, fn, create) {
    var id = String(tableId), out;
    return DB.update(COL, docId(id), function (s) {
      if (!s) { if (!create) return undefined; s = newSession(id); }
      out = fn(s);
      s.updatedAt = Date.now();
      return s;
    }).then(function () { return out; });
  }

  window.Live = {
    genKey: genKey,
    /* ---------- escuchar ---------- */
    watch: function (tableId, cb) { return DB.watchDoc(COL, docId(tableId), cb); },
    /* devuelve { mesa: sesión } (las sesiones se guardan como «<mesa>_<código>») */
    watchAll: function (cb) {
      return DB.watchCollection(COL, function (all) {
        var out = {}, ids = {};
        Object.keys(all || {}).forEach(function (id) {
          var s = all[id], t = String((s && s.tableId) != null ? s.tableId : id);
          if (out[t] && (out[t].updatedAt || 0) >= (s.updatedAt || 0)) return;
          out[t] = s; ids[t] = id;
        });
        known = ids; cb(out);
      });
    },

    /* ---------- códigos de mesa ---------- */
    setKey: function (tableId, key) { if (key) keys[String(tableId)] = String(key); },
    keyFor: function (tableId) { return keys[String(tableId)] || ''; },
    /* el personal carga los códigos y crea los que falten (una sola vez por mesa) */
    ensureKeys: function (tableIds) {
      return DB.list(KEYS_COL).then(function (all) {
        var jobs = [];
        Object.keys(all || {}).forEach(function (t) { if (all[t] && all[t].key) keys[t] = all[t].key; });
        if (!keysWatching && DB.watchCollection) {           // si otra caja renueva una clave, esta se entera sola
          keysWatching = true;
          try { DB.watchCollection(KEYS_COL, function (cur) { Object.keys(cur || {}).forEach(function (t) { if (cur[t] && cur[t].key) keys[t] = cur[t].key; }); }); } catch (e) { keysWatching = false; }
        }
        (tableIds || []).forEach(function (t) {
          t = String(t);
          if (keys[t]) return;
          var k = genKey();
          jobs.push(DB.update(KEYS_COL, t, function (cur) {
            if (cur && cur.key) { k = cur.key; return undefined; }
            return { key: k, at: Date.now() };
          }).then(function () { keys[t] = k; }));
        });
        return Promise.all(jobs);
      }).catch(function (e) { if (window.console) console.warn('tablekeys', e); });
    },
    /* nuevo código para una mesa (los QR impresos de esa mesa dejan de servir) */
    renewKey: function (tableId) {
      var t = String(tableId), k = genKey();
      return DB.set(KEYS_COL, t, { key: k, at: Date.now() }).then(function () { keys[t] = k; return k; });
    },
    /* la caja abre una mesa «a mano» para un cliente que no puede escanear el QR:
       el cliente no pide solo, llama al mesero y la caja registra el pedido (ver js/caja-manual.js) */
    openManual: function (tableId, label) {
      return mutate(tableId, function (s) {
        if (!s.people) s.people = {};
        s.manual = { name: String(label || '').slice(0, 30), at: Date.now() };
        return true;
      }, true);
    },
    /* la caja agrega una ronda ya confirmada (va directo a la cocina). lines = [{dishId,name,price,qty}] */
    addStaffRound: function (tableId, lines) {
      lines = (lines || []).filter(function (l) { return l && l.qty > 0; });
      if (!lines.length) return Promise.resolve(0);
      return DB.get(COL, docId(tableId)).then(function (cur) {
        return (cur && !cur.waiter) ? nextWaiter().catch(function () { return null; }) : null;
      }).then(function (pick) {
        return mutate(tableId, function (s) {
          if (!s.waiter && pick) s.waiter = pick;
          s.round += 1;
          var now = Date.now();
          lines.forEach(function (l) {
            s.items.push({ id: uid('i'), pid: 'caja', who: (s.manual && s.manual.name) || 'Mesa', dishId: l.dishId, name: l.name,
                           price: Number(l.price) || 0, qty: Math.min(99, l.qty), status: 'accepted', round: s.round, at: now, sentAt: now });
          });
          return s.round;
        }, true);
      });
    },

    /* ---------- cliente en la mesa ---------- */
    join: function (tableId, name) {
      return mutate(tableId, function (s) {
        var low = String(name).trim().toLowerCase(), pid = null;
        Object.keys(s.people).forEach(function (k) { if (s.people[k].name.toLowerCase() === low) pid = k; });
        if (!pid) { pid = uid('p'); s.people[pid] = { name: String(name).trim(), joinedAt: Date.now() }; }
        return { pid: pid };
      }, true);
    },
    addItem: function (tableId, pid, dish, qty) {
      return mutate(tableId, function (s) {
        if (!s.people[pid]) return null;
        qty = qty || 1;
        var it = s.items.filter(function (i) { return i.status === 'draft' && i.pid === pid && i.dishId === dish.id; })[0];
        if (it) it.qty = Math.min(99, it.qty + qty);
        else {
          it = { id: uid('i'), pid: pid, who: s.people[pid].name, dishId: dish.id, name: dish.name,
                 price: Number(dish.price) || 0, qty: qty, status: 'draft', round: 0, at: Date.now() };
          s.items.push(it);
        }
        return it.id;
      });
    },
    setQty: function (tableId, itemId, qty) {          // solo platos "por enviar"
      return mutate(tableId, function (s) {
        s.items = s.items.filter(function (i) {
          if (i.id !== itemId || i.status !== 'draft') return true;
          if (qty <= 0) return false;
          i.qty = Math.min(99, qty); return true;
        });
        return true;
      });
    },
    /* Envía lo "por enviar" como una ronda nueva. En el primer envío de la mesa le asigna
       el siguiente mesero del turno (por orden) y lo conserva toda la estadía. */
    send: function (tableId) {
      return DB.get(COL, docId(tableId)).then(function (cur) {
        var needs = cur && !cur.waiter && cur.items.some(function (i) { return i.status === 'draft'; });
        /* si no se pudo asignar mesero (permisos, red…), el pedido igual se envía y la caja lo asigna */
        return needs ? nextWaiter().catch(function (e) { if (window.console) console.warn('turno', e); return null; }) : null;
      }).then(function (pick) {
        return mutate(tableId, function (s) {
          var drafts = s.items.filter(function (i) { return i.status === 'draft'; });
          if (!drafts.length) return 0;
          if (!s.waiter && pick) s.waiter = pick;
          s.round += 1;
          drafts.forEach(function (i) { i.status = 'sent'; i.round = s.round; i.sentAt = Date.now(); });
          return s.round;
        });
      });
    },
    setWaiter: function (tableId, waiter) {             // la caja puede cambiar el mesero de una mesa (null = sin mesero)
      return mutate(tableId, function (s) {
        s.waiter = waiter ? { id: waiter.id, name: waiter.name } : null; return true;
      });
    },
    callWaiter: function (tableId, pid) {
      return mutate(tableId, function (s) {
        if (!s.people[pid]) return false;
        s.calls.waiter = { at: Date.now(), by: s.people[pid].name }; return true;
      });
    },
    /* tip (opcional) = { pct: 10 } o { usd: 3.5 }: la propina que el cliente quiere dejar; la caja la confirma al cobrar */
    requestBill: function (tableId, pid, tip) {
      return mutate(tableId, function (s) {
        if (!s.people[pid]) return false;
        var b = { at: Date.now(), by: s.people[pid].name };
        if (tip && tip.pct > 0) b.tip = { pct: Math.min(100, Math.round(tip.pct * 100) / 100) };
        else if (tip && tip.usd > 0) b.tip = { usd: Math.min(10000, Math.round(tip.usd * 100) / 100) };
        s.calls.bill = b; s.status = 'bill_requested'; return true;
      });
    },

    /* ---------- turno del día (lo arma la caja) ---------- */
    dayKey: dayKey,
    watchShift: function (cb) { return DB.watchDoc(SHIFT_COL, SHIFT_ID, cb); },
    setShift: function (waiters, cursor) {
      var list = (waiters || []).map(function (w) { return { id: w.id, name: w.name }; });
      var c = list.length ? Math.max(0, cursor || 0) % list.length : 0;
      return DB.set(SHIFT_COL, SHIFT_ID, { day: dayKey(), waiters: list, cursor: c });
    },

    /* ---------- caja y cocina ---------- */
    setRoundStatus: function (tableId, round, status) {  // accepted | cooking | ready | served
      return mutate(tableId, function (s) {
        s.items.forEach(function (i) { if (i.round === round && i.status !== 'draft') i.status = status; });
        return true;
      });
    },
    dismissCall: function (tableId, kind) {              // 'waiter' | 'bill'
      return mutate(tableId, function (s) {
        s.calls[kind] = null;
        if (kind === 'bill') s.status = 'open';
        return true;
      });
    },
    /* libera la mesa: la CIERRA (los clientes ya no pueden entrar con el QR), cambia la clave interna
       y BORRA todos sus datos. El QR impreso no cambia; la próxima vez la caja tiene que aceptar la mesa. */
    release: function (tableId) {
      var t = String(tableId), id = docId(t);
      return DB.remove(OPEN_COL, t).catch(function (e) { if (window.console) console.warn('opentables', e && e.code); })
        .then(function () { return Live.renewKey(t).catch(function (e) { if (window.console) console.warn('renewKey', e && e.code); return null; }); })
        .then(function () { return DB.remove(REQ_COL, t).catch(function () {}); })
        .then(function () { return DB.remove(COL, id); });
    },
    /* ---------- abrir una mesa: el cliente escanea el QR fijo y la caja acepta ---------- */
    getOpen: function (tableId) { return DB.get(OPEN_COL, String(tableId)); },
    watchOpen: function (tableId, cb) { return DB.watchDoc(OPEN_COL, String(tableId), cb); },
    requestOpen: function (tableId) {                  // el cliente pide que abran su mesa
      var t = String(tableId);
      return DB.set(REQ_COL, t, { tableId: t, at: Date.now(), status: 'pending' });
    },
    watchRequest: function (tableId, cb) { return DB.watchDoc(REQ_COL, String(tableId), cb); },
    watchRequests: function (cb) { return DB.watchCollection(REQ_COL, cb); },    // la caja ve todas
    /* la caja abre la mesa: publica su clave para quien escanee el QR mientras esté abierta */
    openTable: function (tableId) {
      var t = String(tableId);
      return Live.ensureKeys([t]).then(function () { return Live.refreshKey(t); }).then(function (k) {
        if (!k) throw new Error('La clave de la mesa aún no está lista. Intenta de nuevo.');
        return DB.set(OPEN_COL, t, { key: k, at: Date.now() });
      }).then(function () { return DB.remove(REQ_COL, t).catch(function () {}); });
    },
    rejectRequest: function (tableId) {
      var t = String(tableId);
      return DB.set(REQ_COL, t, { tableId: t, at: Date.now(), status: 'rejected' });
    },
    /* lee la clave vigente de una mesa (por si otra caja la cambió) */
    refreshKey: function (tableId) {
      var t = String(tableId);
      return DB.get(KEYS_COL, t).then(function (d) { if (d && d.key) keys[t] = d.key; return keys[t] || ''; }).catch(function () { return keys[t] || ''; });
    },
    purgeOlderThan: function (hours) {                   // limpieza de mesas abandonadas
      return DB.list(COL).then(function (all) {
        var limit = Date.now() - hours * 3600 * 1000, n = 0, jobs = [];
        Object.keys(all).forEach(function (k) {
          if ((all[k].updatedAt || 0) < limit) { n++; jobs.push(DB.remove(COL, k)); }
        });
        return Promise.all(jobs).then(function () { return n; });
      });
    }
  };
})();