/* =====================================================
   delivery.js — Pedidos de delivery dentro del sistema

   El cliente sigue enviando su pedido por WhatsApp, y además queda REGISTRADO aquí para que la
   caja lo confirme y la cocina lo prepare (colección «deliveries»).

   Estados:  new → accepted → cooking → ready → onway → (cobrado y borrado)
   Privacidad: el nombre, teléfono y dirección del cliente existen SOLO mientras el pedido está
   activo. Al entregarlo/cobrarlo o cancelarlo se borra todo; en el cierre solo queda el monto.
   ===================================================== */
(function () {
  'use strict';
  var COL = 'deliveries';

  var STATUS = {
    new:      ['Nuevo', 'wait'],
    accepted: ['Confirmado', 'ok'],
    cooking:  ['En preparación', 'cook'],
    ready:    ['Listo para despachar', 'ready'],
    onway:    ['En camino', 'done']
  };

  window.Delivery = {
    STATUS: STATUS,
    /* siguiente número de pedido: 1, 2, 3… (contador compartido y atómico, sin repetirse) */
    nextNumber: function () {
      var n = 0;
      return DB.update('meta', 'counter', function (c) {
        c = c || {}; c.delivery = (Number(c.delivery) || 0) + 1; n = c.delivery; return c;
      }).then(function () { return String(n); });
    },
    /* el cliente lo crea al enviar su pedido */
    create: function (order) { return DB.set(COL, order.id, order); },
    watchAll: function (cb) { return DB.watchCollection(COL, cb); },
    setStatus: function (id, status) {
      return DB.update(COL, id, function (d) {
        if (!d) return undefined;
        d.status = status; d.updatedAt = Date.now();
        if (status === 'accepted' && !d.acceptedAt) d.acceptedAt = Date.now();
        return d;
      });
    },
    remove: function (id) { return DB.remove(COL, id); },
    /* limpieza: pedidos olvidados (con datos del cliente) */
    purgeOlderThan: function (hours) {
      return DB.list(COL, { field: 'at', before: Date.now() - hours * 3600 * 1000 }).then(function (m) {
        return Promise.all(Object.keys(m || {}).map(function (k) { return DB.remove(COL, k); }));
      });
    },
    /* teléfono venezolano → número para wa.me (0414… → 58414…) */
    waNumber: function (phone) {
      var d = String(phone || '').replace(/\D/g, '');
      if (d.charAt(0) === '0') d = '58' + d.slice(1);
      return d;
    }
  };
})();