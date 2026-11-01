/* =====================================================
   data.js — Datos de ejemplo (restaurante inventado)
   Todo esto se edita luego desde el panel del administrador.
   Si no existe nada guardado en el navegador, se usa esto.
   ===================================================== */
window.DEFAULT_DATA = {
  version: 1,

  config: {
    name: "El Fogón Criollo",
    slogan: "Brasas, sazón y tradición venezolana",
    logo: "img/logo.svg",
    address: "Av. Principal de Las Mercedes, Torre Sabor, PB, Caracas",
    whatsapp: "584141234567",          // con código de país, sin + ni espacios
    phone: "+58 414-1234567",
    instagram: "elfogoncriollo",       // usuario o link completo
    tiktok: "elfogoncriollo",
    facebook: "elfogoncriollo",

    timezone: "America/Caracas",
    forceStatus: "auto",               // auto | open | closed
    allowClosedOrders: false,          // ¿aceptar pedidos aunque esté cerrado?
    hours: {
      mon: { open: true,  from: "11:00", to: "22:00" },
      tue: { open: true,  from: "11:00", to: "22:00" },
      wed: { open: true,  from: "11:00", to: "22:00" },
      thu: { open: true,  from: "11:00", to: "22:00" },
      fri: { open: true,  from: "11:00", to: "23:30" },
      sat: { open: true,  from: "11:00", to: "23:30" },
      sun: { open: true,  from: "11:00", to: "21:00" }
    },

    // Tasa del dólar: "auto" la consulta sola, "manual" usa el valor escrito.
    rate: {
      mode: "auto",
      manual: 40,
      apiUrl: "https://ve.dolarapi.com/v1/dolares/oficial",
      updatedAt: null
    },

    publicUrl: "",                     // dirección real del menú (ej. https://tuusuario.github.io/menu/) para los QR

    /* Servicio en mesa: cada mesa tiene su QR (index.html?modo=local&mesa=<id>) */
    tables: [
      { id: "1", label: "Mesa 1" }, { id: "2", label: "Mesa 2" },
      { id: "3", label: "Mesa 3" }, { id: "4", label: "Mesa 4" },
      { id: "5", label: "Mesa 5" }, { id: "6", label: "Mesa 6" },
      { id: "7", label: "Mesa 7" }, { id: "8", label: "Mesa 8" }
    ],
    kitchenEnabled: true,              // ¿se usa la pantalla de cocina? (opcional)

    /* Meseros. Al enviar su primer pedido, cada mesa recibe al mesero que tenga menos mesas
       y lo conserva hasta que se libera la mesa. active:false = fuera de turno (no se le asignan mesas). */
    waiters: [
      { id: "w1", name: "Carlos", active: true },
      { id: "w2", name: "Marta",  active: true },
      { id: "w3", name: "Luis",   active: true }
    ],

    deliveryFee: 0,                    // costo de delivery en USD (0 = sin costo)
    paymentMethods: [
      "Pago móvil",
      "Zelle",
      "Efectivo en divisas",
      "Efectivo en bolívares",
      "Punto de venta"
    ],

    whatsappMessage: "Hola, quiero hacer un pedido:",

    about:
      "El Fogón Criollo nació en 2009 en una esquina de Caracas, con una parrilla, una receta de la abuela Rosa y muchas ganas de que cada mesa se sienta como en casa.\n\n" +
      "Cocinamos con brasas de verdad, carnes seleccionadas y los sabores de siempre: pabellón, cachapas, arepas y mucho cariño.\n\n" +
      "Gracias por visitarnos. ¡Aquí siempre hay un puesto para ti!",

    /* Textos legales. Una línea que empieza con "## " se muestra como subtítulo.
       Son textos de ejemplo: el restaurante debe adaptarlos a su negocio. */
    legal: {
      terms:
        "## 1. Aceptación\n" +
        "Al usar este menú digital y enviar un pedido, aceptas estos Términos y Condiciones. Si no estás de acuerdo, te pedimos no realizar pedidos por este medio.\n\n" +
        "## 2. Precios y tasa de cambio\n" +
        "Los precios están expresados en dólares estadounidenses (USD). El monto en bolívares (Bs) es referencial y se calcula con la tasa del día mostrada en el menú. Si pagas en bolívares, el monto final será el calculado con la tasa vigente al momento del pago.\n\n" +
        "## 3. Pedidos\n" +
        "Tu pedido se envía por WhatsApp y se considera confirmado solo cuando el restaurante te responde. Nos reservamos el derecho de no aceptar pedidos cuando el local esté cerrado, no haya disponibilidad de algún plato o no podamos verificar los datos suministrados.\n\n" +
        "## 4. Disponibilidad\n" +
        "Los platos pueden agotarse sin previo aviso. Si algún producto de tu pedido no está disponible, te contactaremos para ofrecerte una alternativa o ajustar el monto.\n\n" +
        "## 5. Formas de pago\n" +
        "Aceptamos los métodos de pago indicados al momento de hacer el pedido. El pedido se prepara una vez confirmado el pago, o al momento de la entrega si pagas en efectivo.\n\n" +
        "## 6. Cambios en los términos\n" +
        "Podemos actualizar estos términos en cualquier momento. La versión vigente es la publicada en este menú.",

      privacy:
        "## 1. Qué datos recopilamos\n" +
        "Solo los que escribes para hacer tu pedido: nombre y apellido, número de teléfono, dirección (escrita o ubicación GPS), notas del pedido y método de pago.\n\n" +
        "## 2. Para qué los usamos\n" +
        "Exclusivamente para preparar, entregar y confirmar tu pedido, y para comunicarnos contigo sobre él. No usamos tus datos para publicidad de terceros ni los vendemos.\n\n" +
        "## 3. Ubicación GPS\n" +
        "Si eliges compartir tu ubicación, tu dispositivo te pedirá permiso. La ubicación se incluye únicamente en el mensaje de tu pedido para que podamos llegar a tu dirección. Puedes escribir tu dirección a mano si prefieres no compartirla.\n\n" +
        "## 4. Dónde se guardan\n" +
        "Para que no tengas que escribirlos cada vez, tus datos se guardan en tu propio dispositivo (en el navegador). Tu pedido se envía mediante WhatsApp, un servicio de terceros que tiene sus propias políticas de privacidad.\n\n" +
        "## 5. Tus derechos\n" +
        "Puedes pedirnos en cualquier momento que eliminemos o corrijamos los datos de pedidos que tengamos de ti, escribiéndonos por WhatsApp. También puedes borrar los datos guardados desde la configuración de tu navegador.",

      shipping:
        "## 1. Zonas y tiempos de entrega\n" +
        "Realizamos entregas a domicilio en las zonas cercanas al restaurante. El tiempo de entrega es estimado y puede variar según la cantidad de pedidos, el clima y el tráfico. Te informaremos el tiempo aproximado al confirmar tu pedido.\n\n" +
        "## 2. Costo de envío\n" +
        "Si el delivery tiene costo, se muestra en el resumen de tu pedido antes de enviarlo.\n\n" +
        "## 3. Recepción del pedido\n" +
        "Es importante que estés atento al teléfono que indicaste. Si no logramos contactarte en la dirección, podremos esperar unos minutos y luego cancelar la entrega.\n\n" +
        "## 4. Problemas con tu pedido\n" +
        "Si tu pedido llega incompleto, equivocado o en mal estado, escríbenos por WhatsApp en los primeros 30 minutos tras recibirlo, con una foto si es posible. Lo repondremos o te ofreceremos una solución.\n\n" +
        "## 5. Devoluciones y reembolsos\n" +
        "Por razones de salud e higiene, los alimentos preparados no admiten devolución una vez entregados. Si el error es nuestro, repondremos el plato o reembolsaremos el monto correspondiente.\n\n" +
        "## 6. Cancelaciones\n" +
        "Puedes cancelar tu pedido sin costo mientras no haya comenzado su preparación. Contáctanos cuanto antes por WhatsApp."
    }
  },

  categories: [
    { id: "entradas", name: "Entradas",        icon: "🧀", order: 1 },
    { id: "parrilla", name: "Parrilla",        icon: "🔥", order: 2 },
    { id: "criollos", name: "Platos criollos", icon: "🍛", order: 3 },
    { id: "arepas",   name: "Arepas",          icon: "🫓", order: 4 },
    { id: "bebidas",  name: "Bebidas",         icon: "🥤", order: 5 },
    { id: "postres",  name: "Postres",         icon: "🍮", order: 6 }
  ],

  /* modes: en qué menú aparece el plato (delivery y/o comer en el local) */
  dishes: [
    { id: "d01", category: "entradas", name: "Tequeños (6 unidades)",
      description: "Deditos de queso blanco envueltos en masa crujiente, con salsa de ajo y guasacaca.",
      price: 5.5, photo: "img/dishes/tequenos.svg", video: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      available: true, modes: { delivery: true, local: true } },
    { id: "d02", category: "entradas", name: "Mini empanadas (4 unidades)",
      description: "Rellenas de carne mechada, queso o pollo. Fritas al momento.",
      price: 4.5, photo: "img/dishes/empanadas.svg", video: "",
      available: true, modes: { delivery: true, local: true } },

    { id: "d03", category: "parrilla", name: "Parrilla mixta para dos",
      description: "Churrasco, pollo, chorizo, morcilla, yuca frita, ensalada y salsas de la casa.",
      price: 24, photo: "img/dishes/parrilla.svg", video: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      available: true, modes: { delivery: true, local: true } },
    { id: "d04", category: "parrilla", name: "Churrasco 300 g",
      description: "Corte jugoso a la brasa con papas rústicas y ensalada fresca.",
      price: 14, photo: "img/dishes/churrasco.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d05", category: "parrilla", name: "Pollo a la brasa (1/2)",
      description: "Marinado 24 horas, dorado en leña. Incluye yuca o papas y ensalada.",
      price: 11, photo: "img/dishes/pollo.svg", video: "",
      available: true, modes: { delivery: true, local: true } },

    { id: "d06", category: "criollos", name: "Pabellón criollo",
      description: "Carne mechada, caraotas negras, arroz blanco, tajadas de plátano maduro y queso rallado.",
      price: 10, photo: "img/dishes/pabellon.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d07", category: "criollos", name: "Cachapa con queso de mano",
      description: "Cachapa de maíz tierno, mantequilla y queso de mano. Opción con cochino frito (+$3).",
      price: 8, photo: "img/dishes/cachapa.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d08", category: "criollos", name: "Asado negro",
      description: "Lomito en salsa oscura de papelón, con arroz, tajadas y puré.",
      price: 12, photo: "img/dishes/asado.svg", video: "",
      available: false, modes: { delivery: true, local: true } },

    { id: "d09", category: "arepas", name: "Reina pepiada",
      description: "Pollo y aguacate cremoso en arepa dorada.",
      price: 6, photo: "img/dishes/reina.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d10", category: "arepas", name: "Pelúa",
      description: "Carne mechada y queso amarillo rallado.",
      price: 6.5, photo: "img/dishes/pelua.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d11", category: "arepas", name: "Domino",
      description: "Caraotas negras y queso blanco rallado.",
      price: 5, photo: "img/dishes/domino.svg", video: "",
      available: true, modes: { delivery: true, local: true } },

    { id: "d12", category: "bebidas", name: "Papelón con limón",
      description: "Bien frío, con hielo. Jarra para compartir disponible solo en el local.",
      price: 2.5, photo: "img/dishes/papelon.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d13", category: "bebidas", name: "Chicha criolla",
      description: "Arroz, leche y canela, servida fría con un toque de leche condensada.",
      price: 3, photo: "img/dishes/chicha.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d14", category: "bebidas", name: "Cerveza nacional",
      description: "Botella helada. Solo para comer en el local.",
      price: 2.5, photo: "img/dishes/cerveza.svg", video: "",
      available: true, modes: { delivery: false, local: true } },

    { id: "d15", category: "postres", name: "Quesillo",
      description: "Flan venezolano con textura cremosa y caramelo.",
      price: 4.5, photo: "img/dishes/quesillo.svg", video: "",
      available: true, modes: { delivery: true, local: true } },
    { id: "d16", category: "postres", name: "Torta tres leches",
      description: "Bizcocho esponjoso bañado en tres leches con crema chantilly.",
      price: 5, photo: "img/dishes/tresleches.svg", video: "",
      available: true, modes: { delivery: true, local: true } }
  ]
};