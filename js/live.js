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
    return DB.update(COL, id, function (s) {
      if (!s) { if (!create) return undefined; s = newSession(id); }
      out = fn(s);
      s.updatedAt = Date.now();
      return s;
    }).then(function () { return out; });
  }

  window.Live = {
    /* ---------- escuchar ---------- */
    watch: function (tableId, cb) { return DB.watchDoc(COL, String(tableId), cb); },
    watchAll: function (cb) { return DB.watchCollection(COL, cb); },

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
      return DB.get(COL, String(tableId)).then(function (cur) {
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
    requestBill: function (tableId, pid) {
      return mutate(tableId, function (s) {
        if (!s.people[pid]) return false;
        s.calls.bill = { at: Date.now(), by: s.people[pid].name }; s.status = 'bill_requested'; return true;
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
    release: function (tableId) {                        // libera la mesa y BORRA todos sus datos
      return DB.remove(COL, String(tableId));
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
