/* =====================================================
   firebase-config.js — Conexión con Firebase

   Mientras estos datos estén VACÍOS, el sistema funciona en modo de prueba
   (todo se guarda solo en el navegador). Al llenarlos, TODO pasa a Firebase:
   pedidos, mesas, turno y menú se comparten en vivo entre todos los dispositivos.

   Estos datos NO son secretos (van dentro de cualquier app web de Firebase);
   la seguridad la dan las reglas de firestore.rules.
   Sigue la guía GUIA-FIREBASE.md para sacarlos.
   ===================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBoJn94uows54WnSNykkM23Bxuf1WTjEn8",
  authDomain: "menu-digital-demo-e8a63.firebaseapp.com",
  projectId: "menu-digital-demo-e8a63",
  appId: "1:696080947487:web:51bfaf094342554a2bf82a"
};

/* Si un usuario del personal se crea sin correo (ej: "caja2"), se le agrega este dominio.
   No tiene que existir; solo sirve para que Firebase lo acepte como correo. */
window.FIREBASE_STAFF_DOMAIN = "personal.menu";