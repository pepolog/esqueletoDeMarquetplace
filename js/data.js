/**
 * data.js
 * ---------------------------------------------------------------------------
 * Configuración, catálogo de categorías (con el esquema de campos dinámicos
 * del asistente de publicación), etiquetas de estados y DATOS DE PRUEBA.
 *
 * Todo lo que aparece en buildSeedData() es ficticio y existe solo para poder
 * probar la aplicación en local. Los correos usan el dominio reservado
 * example.com y los teléfonos son inventados.
 */

import { ICONS } from './icons.js';

/* ==========================================================================
   1. Configuración general
   ========================================================================== */

export const APP_CONFIG = {
  /** Nombre provisional de la marca. Cámbialo aquí y en el logotipo de index.html. */
  brandName: 'Trato',
  locale: 'es-ES',
  currency: 'EUR',
  /** Clave de LocalStorage. Cambiar la versión fuerza la recarga de los datos de prueba. */
  storageKey: 'trato.db.v1',
  sessionKey: 'trato.session.v1',
  /** Latencia simulada de la "API" local, para que se vean los indicadores de carga. */
  demoLatencyMs: 180,
  /** Comisión de la plataforma usada para las estimaciones del vendedor (0.05 = 5 %). */
  commissionRate: 0.05,
  /** Si es true, un anuncio necesita al menos una foto para publicarse (no para guardarse como borrador). */
  requireImageToPublish: true,
  maxImagesPerListing: 8,
  maxImageSizeMb: 5,
  acceptedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  /** Lado máximo (px) al que se reducen las fotos antes de guardarlas en LocalStorage. */
  imageMaxDimension: 1100,
};

/* ==========================================================================
   2. Etiquetas y estados
   ========================================================================== */

export const OPERATION_LABELS = { sale: 'Venta', rent: 'Alquiler' };

export const RENTAL_PERIODS = {
  hour: { label: 'Por horas', unit: 'hora', unitPlural: 'horas', suffix: '/hora' },
  day: { label: 'Por días', unit: 'día', unitPlural: 'días', suffix: '/día' },
  week: { label: 'Por semanas', unit: 'semana', unitPlural: 'semanas', suffix: '/semana' },
  month: { label: 'Por meses', unit: 'mes', unitPlural: 'meses', suffix: '/mes' },
};

/** Estados genéricos para artículos de segunda mano. */
export const ITEM_CONDITIONS = [
  ['new', 'Nuevo'],
  ['like_new', 'Como nuevo'],
  ['good', 'Buen estado'],
  ['used_damaged', 'Usado con desperfectos'],
];

export const LISTING_STATUS = {
  draft: { label: 'Borrador', tone: 'neutral' },
  pending_review: { label: 'Pendiente de revisión', tone: 'warning' },
  active: { label: 'Activo', tone: 'success' },
  paused: { label: 'Pausado', tone: 'neutral' },
  sold: { label: 'Vendido', tone: 'info' },
  rented: { label: 'Alquilado', tone: 'info' },
  finished: { label: 'Finalizado', tone: 'neutral' },
};

/** Estados de pedido. Las operaciones de alquiler usan su propio ciclo de vida. */
export const ORDER_STATUS = {
  sale: {
    pending: { label: 'Pendiente', tone: 'warning' },
    accepted: { label: 'Aceptado', tone: 'info' },
    preparing: { label: 'En preparación', tone: 'info' },
    shipped: { label: 'Enviado / entregando', tone: 'info' },
    completed: { label: 'Completado', tone: 'success' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
    disputed: { label: 'En disputa', tone: 'danger' },
  },
  rent: {
    pending: { label: 'Solicitud pendiente', tone: 'warning' },
    confirmed: { label: 'Reserva confirmada', tone: 'info' },
    in_progress: { label: 'En curso', tone: 'info' },
    completed: { label: 'Devuelto · finalizado', tone: 'success' },
    cancelled: { label: 'Cancelada', tone: 'neutral' },
    disputed: { label: 'En disputa', tone: 'danger' },
  },
};

/** Estados en los que un pedido se considera "abierto" (bloquea la disponibilidad). */
export const OPEN_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'shipped', 'confirmed', 'in_progress', 'disputed'];

/**
 * Transiciones permitidas de un pedido según el tipo de operación y el rol
 * de quien la ejecuta. Cada entrada: estadoActual → [{ to, label }].
 * En producción estas reglas deben validarse en el servidor.
 */
export const ORDER_TRANSITIONS = {
  sale: {
    seller: {
      pending: [{ to: 'accepted', label: 'Aceptar pedido' }, { to: 'cancelled', label: 'Rechazar', danger: true }],
      accepted: [{ to: 'preparing', label: 'Marcar en preparación' }, { to: 'cancelled', label: 'Cancelar', danger: true }],
      preparing: [{ to: 'shipped', label: 'Marcar como enviado / entregando' }],
      shipped: [{ to: 'completed', label: 'Marcar como completado' }],
      disputed: [{ to: 'completed', label: 'Resolver: completar' }, { to: 'cancelled', label: 'Resolver: cancelar', danger: true }],
    },
    buyer: {
      pending: [{ to: 'cancelled', label: 'Cancelar pedido', danger: true }],
      accepted: [{ to: 'disputed', label: 'Abrir incidencia', danger: true }],
      preparing: [{ to: 'disputed', label: 'Abrir incidencia', danger: true }],
      shipped: [{ to: 'completed', label: 'Confirmar recepción' }, { to: 'disputed', label: 'Abrir incidencia', danger: true }],
    },
  },
  rent: {
    seller: {
      pending: [{ to: 'confirmed', label: 'Confirmar reserva' }, { to: 'cancelled', label: 'Rechazar', danger: true }],
      confirmed: [{ to: 'in_progress', label: 'Marcar como entregado' }, { to: 'cancelled', label: 'Cancelar reserva', danger: true }],
      in_progress: [{ to: 'completed', label: 'Marcar como devuelto' }],
      disputed: [{ to: 'completed', label: 'Resolver: finalizar' }, { to: 'cancelled', label: 'Resolver: cancelar', danger: true }],
    },
    buyer: {
      pending: [{ to: 'cancelled', label: 'Cancelar solicitud', danger: true }],
      confirmed: [{ to: 'cancelled', label: 'Cancelar reserva', danger: true }, { to: 'disputed', label: 'Abrir incidencia', danger: true }],
      in_progress: [{ to: 'disputed', label: 'Abrir incidencia', danger: true }],
    },
  },
};

export const DELIVERY_METHODS = {
  inPerson: { label: 'Entrega en mano', icon: 'users' },
  shipping: { label: 'Envío', icon: 'truck' },
  pickup: { label: 'Recogida', icon: 'pin' },
  agreed: { label: 'Entrega acordada entre las partes', icon: 'message' },
};

/* ==========================================================================
   3. Categorías y esquema de campos dinámicos
   --------------------------------------------------------------------------
   Cada categoría define:
   - operations: modalidades permitidas (venta / alquiler).
   - rentalPeriods: periodicidades de alquiler admitidas.
   - basic: qué campos generales del paso 3 se muestran (estado, marca, modelo).
   - fields: campos específicos del paso 4. Un campo con showIf.operationType
     solo se muestra (y valida) para esa operación.
   - subcategoryField: campo cuyo valor se usa como subcategoría.
   - deliveryOptions: modalidades de entrega que tienen sentido.
   ========================================================================== */

const RENTAL_VEHICLE_FIELDS = [
  { key: 'driverMinAge', label: 'Edad mínima del conductor', type: 'number', unit: 'años', min: 18, max: 99, required: true, showIf: { operationType: 'rent' } },
  { key: 'licenseMinYears', label: 'Antigüedad mínima del permiso', type: 'number', unit: 'años', min: 0, max: 50, required: true, showIf: { operationType: 'rent' } },
  { key: 'deposit', label: 'Fianza', type: 'number', unit: '€', min: 0, required: true, showIf: { operationType: 'rent' } },
  { key: 'insuranceIncluded', label: 'Seguro incluido en el precio', type: 'checkbox', showIf: { operationType: 'rent' } },
  { key: 'kmLimit', label: 'Límite de kilómetros por día', type: 'number', unit: 'km/día', min: 0, help: 'Déjalo vacío si el kilometraje es ilimitado.', showIf: { operationType: 'rent' } },
  { key: 'pickupReturnConditions', label: 'Condiciones de recogida y devolución', type: 'textarea', required: true, placeholder: 'Horario, lugar, nivel de combustible, limpieza…', showIf: { operationType: 'rent' } },
];

const VEHICLE_CONDITION_OPTIONS = [
  ['new', 'Nuevo / km 0'],
  ['semi_new', 'Seminuevo'],
  ['used_good', 'Usado en buen estado'],
  ['needs_repair', 'Necesita reparaciones'],
];

export const CATEGORIES = [
  {
    id: 'fashion', name: 'Ropa y accesorios', shortName: 'Moda', icon: 'shirt', hue: 330, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['day', 'week'],
    basic: { condition: true, brand: 'optional', model: false },
    subcategoryField: 'garmentType',
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [
      { key: 'garmentType', label: 'Tipo de prenda', type: 'select', required: true, options: [['top', 'Camiseta / top'], ['shirt', 'Camisa / blusa'], ['trousers', 'Pantalón'], ['dress', 'Vestido'], ['coat', 'Abrigo / chaqueta'], ['shoes', 'Calzado'], ['bag', 'Bolso'], ['accessory', 'Accesorio'], ['other', 'Otro']] },
      { key: 'size', label: 'Talla', type: 'text', required: true, placeholder: 'M, 38, 42…', maxLength: 20 },
      { key: 'color', label: 'Color', type: 'text', maxLength: 30 },
      { key: 'sizeSection', label: 'Sección de tallas (opcional)', type: 'select', options: [['women', 'Mujer'], ['men', 'Hombre'], ['kids', 'Infantil'], ['unisex', 'Unisex']] },
    ],
  },
  {
    id: 'electronics', name: 'Electrónica y tecnología', shortName: 'Electrónica', icon: 'laptop', hue: 215, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['day', 'week', 'month'],
    basic: { condition: true, brand: 'required', model: 'required' },
    subcategoryField: 'deviceType',
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [
      { key: 'deviceType', label: 'Tipo de dispositivo', type: 'select', required: true, options: [['smartphone', 'Móvil'], ['laptop', 'Portátil'], ['tablet', 'Tablet'], ['tv', 'Televisión'], ['audio', 'Audio'], ['camera', 'Cámara'], ['component', 'Componente / periférico'], ['other', 'Otro']] },
      { key: 'warranty', label: 'Garantía (si existe)', type: 'text', placeholder: 'p. ej. 8 meses de garantía del fabricante', maxLength: 80 },
      { key: 'accessories', label: 'Accesorios incluidos', type: 'text', placeholder: 'Cargador, funda, caja original…', maxLength: 120 },
      { key: 'specs', label: 'Especificaciones técnicas relevantes', type: 'textarea', placeholder: 'Memoria, almacenamiento, batería…', maxLength: 600 },
    ],
  },
  {
    id: 'home', name: 'Hogar y jardín', shortName: 'Hogar', icon: 'sofa', hue: 30, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['day', 'week', 'month'],
    basic: { condition: true, brand: 'optional', model: false },
    subcategoryField: 'itemType',
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [
      { key: 'itemType', label: 'Tipo de artículo', type: 'select', required: true, options: [['furniture', 'Mueble'], ['decor', 'Decoración'], ['appliance', 'Electrodoméstico'], ['garden', 'Jardín'], ['tools', 'Herramientas'], ['other', 'Otro']] },
      { key: 'dimensions', label: 'Medidas', type: 'text', placeholder: 'Ancho × alto × fondo', maxLength: 60 },
      { key: 'material', label: 'Material', type: 'text', maxLength: 60 },
    ],
  },
  {
    id: 'sports', name: 'Deportes y ocio', shortName: 'Deportes', icon: 'bike', hue: 150, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['hour', 'day', 'week'],
    basic: { condition: true, brand: 'optional', model: 'optional' },
    subcategoryField: 'sportType',
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [
      { key: 'sportType', label: 'Deporte o actividad', type: 'select', required: true, options: [['cycling', 'Ciclismo'], ['fitness', 'Fitness'], ['running', 'Running'], ['water', 'Deportes acuáticos'], ['winter', 'Deportes de invierno'], ['team', 'Deportes de equipo'], ['outdoor', 'Montaña y camping'], ['other', 'Otro']] },
      { key: 'size', label: 'Talla o tamaño', type: 'text', maxLength: 30 },
    ],
  },
  {
    id: 'gaming', name: 'Videojuegos y entretenimiento', shortName: 'Videojuegos', icon: 'gamepad', hue: 265, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['day', 'week'],
    basic: { condition: true, brand: 'optional', model: 'optional' },
    subcategoryField: 'gamingType',
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [
      { key: 'gamingType', label: 'Tipo', type: 'select', required: true, options: [['console', 'Consola'], ['game', 'Juego'], ['vr', 'Realidad virtual'], ['accessory', 'Accesorio'], ['boardgame', 'Juego de mesa'], ['other', 'Otro']] },
      { key: 'platform', label: 'Plataforma', type: 'select', options: [['ps5', 'PlayStation 5'], ['ps4', 'PlayStation 4'], ['xbox', 'Xbox Series'], ['switch', 'Nintendo Switch'], ['pc', 'PC'], ['meta', 'Meta Quest'], ['retro', 'Retro'], ['none', 'No aplica']] },
      { key: 'ageRating', label: 'Clasificación PEGI', type: 'select', options: [['3', 'PEGI 3'], ['7', 'PEGI 7'], ['12', 'PEGI 12'], ['16', 'PEGI 16'], ['18', 'PEGI 18']] },
    ],
  },
  {
    id: 'cars', name: 'Coches y vehículos', shortName: 'Coches', icon: 'car', hue: 200, vertical: 'vehicles',
    operations: ['sale', 'rent'], rentalPeriods: ['day', 'week', 'month'],
    basic: { condition: false, brand: 'required', model: 'required' },
    subcategoryField: 'fuel',
    deliveryOptions: ['inPerson', 'pickup', 'agreed'],
    rentNote: 'Los requisitos del conductor, la fianza y el seguro son orientativos. Adáptalos a la normativa de alquiler de vehículos aplicable en tu país.',
    fields: [
      { key: 'year', label: 'Año de matriculación', type: 'number', min: 1950, max: 2027, required: true },
      { key: 'mileage', label: 'Kilometraje', type: 'number', unit: 'km', min: 0, max: 2000000, required: true },
      { key: 'fuel', label: 'Combustible', type: 'select', required: true, options: [['gasoline', 'Gasolina'], ['diesel', 'Diésel'], ['hybrid', 'Híbrido'], ['plugin', 'Híbrido enchufable'], ['electric', 'Eléctrico'], ['lpg', 'GLP / GNC']] },
      { key: 'transmission', label: 'Transmisión', type: 'select', required: true, options: [['manual', 'Manual'], ['automatic', 'Automática']] },
      { key: 'power', label: 'Potencia', type: 'number', unit: 'CV', min: 0, max: 2000 },
      { key: 'vehicleCondition', label: 'Estado del vehículo', type: 'select', required: true, options: VEHICLE_CONDITION_OPTIONS },
      ...RENTAL_VEHICLE_FIELDS,
    ],
  },
  {
    id: 'motorbikes', name: 'Motos', shortName: 'Motos', icon: 'moto', hue: 10, vertical: 'vehicles',
    operations: ['sale', 'rent'], rentalPeriods: ['hour', 'day', 'week'],
    basic: { condition: false, brand: 'required', model: 'required' },
    subcategoryField: 'motoType',
    deliveryOptions: ['inPerson', 'pickup', 'agreed'],
    rentNote: 'Los requisitos del conductor, la fianza y el seguro son orientativos. Adáptalos a la normativa aplicable.',
    fields: [
      { key: 'motoType', label: 'Tipo de moto', type: 'select', required: true, options: [['scooter', 'Scooter'], ['naked', 'Naked'], ['sport', 'Deportiva'], ['touring', 'Turismo'], ['trail', 'Trail'], ['custom', 'Custom'], ['other', 'Otra']] },
      { key: 'year', label: 'Año de matriculación', type: 'number', min: 1950, max: 2027, required: true },
      { key: 'mileage', label: 'Kilometraje', type: 'number', unit: 'km', min: 0, max: 1000000, required: true },
      { key: 'engineCc', label: 'Cilindrada', type: 'number', unit: 'cc', min: 0, max: 3000, required: true },
      { key: 'licenseRequired', label: 'Permiso necesario', type: 'select', required: true, options: [['AM', 'AM'], ['A1', 'A1 / B (+3 años)'], ['A2', 'A2'], ['A', 'A']] },
      { key: 'vehicleCondition', label: 'Estado del vehículo', type: 'select', required: true, options: VEHICLE_CONDITION_OPTIONS },
      ...RENTAL_VEHICLE_FIELDS,
    ],
  },
  {
    id: 'housing', name: 'Viviendas', shortName: 'Viviendas', icon: 'building', hue: 175, vertical: 'realestate',
    operations: ['sale', 'rent'], rentalPeriods: ['week', 'month'],
    basic: { condition: false, brand: false, model: false },
    subcategoryField: 'propertyType',
    deliveryOptions: ['agreed'],
    rentNote: 'Las condiciones de fianza y duración del contrato deben ajustarse a la legislación de arrendamientos urbanos aplicable.',
    fields: [
      { key: 'propertyType', label: 'Tipo de inmueble', type: 'select', required: true, options: [['flat', 'Piso'], ['house', 'Casa / chalet'], ['studio', 'Estudio'], ['penthouse', 'Ático'], ['duplex', 'Dúplex'], ['other', 'Otro']] },
      { key: 'area', label: 'Superficie', type: 'number', unit: 'm²', min: 5, max: 10000, required: true },
      { key: 'bedrooms', label: 'Habitaciones', type: 'number', min: 0, max: 30, required: true },
      { key: 'bathrooms', label: 'Baños', type: 'number', min: 0, max: 20, required: true },
      { key: 'propertyCondition', label: 'Estado del inmueble', type: 'select', required: true, options: [['new', 'Obra nueva'], ['good', 'Buen estado'], ['to_renovate', 'A reformar']] },
      { key: 'furnished', label: 'Amueblado', type: 'select', required: true, options: [['furnished', 'Amueblado'], ['partial', 'Parcialmente amueblado'], ['unfurnished', 'Sin amueblar']] },
      { key: 'extraCosts', label: 'Gastos adicionales', type: 'text', placeholder: 'Comunidad, IBI, suministros…', maxLength: 120 },
      { key: 'energyRating', label: 'Certificado energético', type: 'select', showIf: { operationType: 'sale' }, options: [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'], ['F', 'F'], ['G', 'G'], ['pending', 'En trámite']] },
      { key: 'deposit', label: 'Fianza', type: 'number', unit: '€', min: 0, required: true, showIf: { operationType: 'rent' } },
      { key: 'expensesIncluded', label: 'Gastos incluidos en el precio', type: 'checkbox', showIf: { operationType: 'rent' } },
      { key: 'availableFrom', label: 'Fecha de disponibilidad', type: 'date', required: true, showIf: { operationType: 'rent' } },
    ],
  },
  {
    id: 'rooms', name: 'Alquiler de habitaciones', shortName: 'Habitaciones', icon: 'bed', hue: 45, vertical: 'realestate',
    operations: ['rent'], rentalPeriods: ['month'],
    basic: { condition: false, brand: false, model: false },
    subcategoryField: 'roomType',
    deliveryOptions: ['agreed'],
    fields: [
      { key: 'roomType', label: 'Tipo de habitación', type: 'select', required: true, options: [['single', 'Individual'], ['double', 'Doble'], ['suite', 'Con baño propio']] },
      { key: 'flatmates', label: 'Personas que comparten la vivienda', type: 'number', min: 0, max: 20, required: true },
      { key: 'expensesIncluded', label: 'Gastos incluidos en el precio', type: 'checkbox' },
      { key: 'deposit', label: 'Fianza', type: 'number', unit: '€', min: 0 },
      { key: 'availableFrom', label: 'Disponible desde', type: 'date', required: true },
      { key: 'coexistenceRules', label: 'Condiciones de convivencia', type: 'textarea', placeholder: 'Mascotas, fumadores, visitas, limpieza…', maxLength: 600 },
    ],
  },
  {
    id: 'other', name: 'Otros artículos', shortName: 'Otros', icon: 'box', hue: 90, vertical: 'goods',
    operations: ['sale', 'rent'], rentalPeriods: ['hour', 'day', 'week', 'month'],
    basic: { condition: true, brand: 'optional', model: 'optional' },
    allowCustomAttributes: true,
    deliveryOptions: ['inPerson', 'shipping', 'pickup', 'agreed'],
    fields: [],
  },
];

export const VERTICALS = {
  vehicles: { label: 'Vehículos', categories: ['cars', 'motorbikes'] },
  realestate: { label: 'Viviendas', categories: ['housing', 'rooms'] },
};

export function getCategory(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

/* ==========================================================================
   4. Imágenes de demostración
   --------------------------------------------------------------------------
   Para no depender de servidores de imágenes externos, los anuncios de prueba
   usan ilustraciones SVG generadas aquí (fondo degradado + icono + rótulo).
   ========================================================================== */

function escapeXml(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function placeholderImage({ label, hue = 215, iconName = 'box', variant = 0 }) {
  const paths = ICONS[iconName] ?? ICONS.box;
  const baseHue = (hue + variant * 25) % 360;
  const secondHue = (baseHue + 35) % 360;
  const caption = variant ? `${label} · foto ${variant + 1}` : label;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${baseHue},60%,93%)"/><stop offset="1" stop-color="hsl(${secondHue},50%,80%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="${640 - variant * 80}" cy="${120 + variant * 40}" r="120" fill="hsl(${baseHue},60%,97%)" opacity=".5"/><g transform="translate(310 140) scale(7.5)" fill="none" stroke="hsl(${baseHue},45%,32%)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g><text x="400" y="480" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="600" fill="hsl(${baseHue},40%,22%)">${escapeXml(caption.length > 38 ? `${caption.slice(0, 36)}…` : caption)}</text><text x="400" y="525" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="hsl(${baseHue},30%,35%)">Imagen de demostración</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ==========================================================================
   5. Datos de prueba
   --------------------------------------------------------------------------
   Las fechas se calculan de forma relativa al momento en que se generan los
   datos, para que los filtros por fecha tengan sentido en cualquier momento.
   ========================================================================== */

export function buildSeedData() {
  const now = Date.now();
  const DAY = 86_400_000;
  const ago = (days, hours = 0) => new Date(now - days * DAY - hours * 3_600_000).toISOString();
  const dateIn = (days) => {
    const d = new Date(now + days * DAY);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const defaultPreferences = () => ({
    notifications: { messages: true, newOrders: true, saleStatus: true, favoritePriceDrops: true, listingAlerts: false, platformUpdates: false, channel: 'email' },
    privacy: { profileVisibility: 'public', showCity: true, showJoinDate: true, showRating: true, allowMessagesFrom: 'everyone' },
  });

  const users = [
    {
      id: 'u1', username: 'lauram', displayName: 'Laura M.', firstName: 'Laura', lastName: 'Martín Díaz',
      email: 'laura.martin@example.com', phone: '+34 600 000 101', birthDate: '1992-04-17', country: 'España', city: 'Madrid', address: '',
      avatar: null, bio: 'Vendo lo que ya no uso y alquilo material deportivo los fines de semana. Respondo rápido.',
      publicLocation: 'Madrid centro', role: 'user', createdAt: ago(410), preferences: defaultPreferences(),
    },
    {
      id: 'u2', username: 'motorcarlos', displayName: 'Carlos Ruiz', firstName: 'Carlos', lastName: 'Ruiz Peña',
      email: 'carlos.ruiz@example.com', phone: '+34 600 000 202', birthDate: '1985-09-02', country: 'España', city: 'Valencia', address: '',
      avatar: null, bio: 'Particular aficionado al motor. Coches y motos revisados, con historial de mantenimiento.',
      publicLocation: 'Valencia', role: 'user', createdAt: ago(720), preferences: defaultPreferences(),
    },
    {
      id: 'u3', username: 'casasmarta', displayName: 'Marta Gómez', firstName: 'Marta', lastName: 'Gómez Vidal',
      email: 'marta.gomez@example.com', phone: '+34 600 000 303', birthDate: '1979-12-11', country: 'España', city: 'Barcelona', address: '',
      avatar: null, bio: 'Propietaria particular. Publico mis inmuebles sin intermediarios.',
      publicLocation: 'Barcelona', role: 'user', createdAt: ago(300), preferences: defaultPreferences(),
    },
    {
      id: 'u4', username: 'techdavid', displayName: 'David López', firstName: 'David', lastName: 'López Sanz',
      email: 'david.lopez@example.com', phone: '+34 600 000 404', birthDate: '1996-06-30', country: 'España', city: 'Sevilla', address: '',
      avatar: null, bio: 'Tecnología y videojuegos. Todo probado antes de enviar.',
      publicLocation: 'Sevilla', role: 'user', createdAt: ago(190), preferences: defaultPreferences(),
    },
    {
      id: 'u5', username: 'anasport', displayName: 'Ana Torres', firstName: 'Ana', lastName: 'Torres Etxeberria',
      email: 'ana.torres@example.com', phone: '+34 600 000 505', birthDate: '1990-02-21', country: 'España', city: 'Bilbao', address: '',
      avatar: null, bio: 'Deporte, montaña y moda sostenible.',
      publicLocation: 'Bilbao', role: 'user', createdAt: ago(95), preferences: defaultPreferences(),
    },
  ];

  /** Crea un anuncio de prueba con valores por defecto coherentes. */
  const listing = ({ id, sellerId, title, category, operationType = 'sale', price, rentalPeriod = null, daysAgo, imageCount = 2, ...rest }) => {
    const cat = getCategory(category);
    const createdAt = ago(daysAgo, (Number(id.slice(-2)) * 3) % 20);
    const images = Array.from({ length: imageCount }, (_, index) => ({
      id: `${id}_img${index}`,
      src: placeholderImage({ label: title, hue: (cat.hue + Number(id.slice(-2)) * 11) % 360, iconName: cat.icon, variant: index }),
      alt: `${title} — imagen ${index + 1}`,
    }));
    const attributes = rest.attributes ?? {};
    return {
      id, sellerId, title, category,
      subcategory: cat.subcategoryField ? attributes[cat.subcategoryField] ?? null : null,
      operationType, price, currency: 'EUR',
      rental: operationType === 'rent'
        ? { period: rentalPeriod, minDuration: rest.minDuration ?? 1, maxDuration: rest.maxDuration ?? null, requirements: rest.requirements ?? '' }
        : null,
      description: rest.description,
      condition: rest.condition ?? null,
      brand: rest.brand ?? '',
      model: rest.model ?? '',
      availability: rest.availability ?? 'Inmediata',
      deliveryNotes: rest.deliveryNotes ?? '',
      attributes,
      customAttributes: rest.customAttributes ?? [],
      images,
      location: { city: rest.city, postalCode: rest.postalCode ?? '', zone: rest.zone ?? '' },
      delivery: { inPerson: false, shipping: false, pickup: false, agreed: false, ...(rest.delivery ?? {}) },
      status: rest.status ?? 'active',
      featured: rest.featured ?? false,
      views: rest.views ?? 0,
      priceHistory: rest.priceHistory ?? [{ price, date: createdAt }],
      createdAt,
      updatedAt: rest.updatedAt ?? createdAt,
      deletedAt: null,
    };
  };

  const listings = [
    // --- Laura (u1, Madrid): usuaria de demostración por defecto ---
    listing({ id: 'lst_001', sellerId: 'u1', title: "Chaqueta vaquera Levi's talla M", category: 'fashion', price: 35, daysAgo: 2, featured: true, views: 48,
      description: 'Chaqueta vaquera clásica de Levi\'s, lavado medio. Usada pocas veces, sin roturas ni manchas.', condition: 'like_new', brand: "Levi's",
      attributes: { garmentType: 'coat', size: 'M', color: 'Azul', sizeSection: 'unisex' }, city: 'Madrid', postalCode: '28012', zone: 'Lavapiés',
      delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_002', sellerId: 'u1', title: 'iPad Air 5ª generación 64 GB', category: 'electronics', price: 390, daysAgo: 6, views: 112,
      description: 'iPad Air M1 color gris espacial. Batería al 91 %. Siempre con funda y protector de pantalla.', condition: 'good', brand: 'Apple', model: 'iPad Air (5ª gen.)',
      attributes: { deviceType: 'tablet', warranty: 'Sin garantía', accessories: 'Cable USB-C y funda', specs: 'Chip M1, 64 GB, Wi-Fi, pantalla 10,9"' },
      city: 'Madrid', postalCode: '28012', zone: 'Lavapiés', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_003', sellerId: 'u1', title: 'Lámpara de pie nórdica de madera', category: 'home', price: 25, daysAgo: 21, views: 19, status: 'paused',
      description: 'Lámpara de pie con trípode de madera de haya y pantalla de tela blanca. Bombilla E27 no incluida.', condition: 'good',
      attributes: { itemType: 'decor', dimensions: '45 × 150 × 45 cm', material: 'Madera y tela' }, city: 'Madrid', zone: 'Lavapiés', delivery: { inPerson: true, pickup: true } }),
    listing({ id: 'lst_004', sellerId: 'u1', title: 'Tabla de paddle surf hinchable con remo', category: 'sports', operationType: 'rent', rentalPeriod: 'day', price: 18, daysAgo: 30, views: 87, minDuration: 1, maxDuration: 7,
      description: 'Tabla de paddle surf hinchable de 3,2 m con remo, inflador, leash y mochila. Ideal para iniciarse.', condition: 'good', brand: 'Decathlon', model: 'Itiwit 500',
      requirements: 'Saber nadar. Se entrega limpia y debe devolverse aclarada con agua dulce.', availability: 'Fines de semana y festivos',
      attributes: { sportType: 'water', size: '320 cm' }, city: 'Madrid', zone: 'Lavapiés', delivery: { pickup: true, agreed: true } }),
    listing({ id: 'lst_005', sellerId: 'u1', title: 'Nintendo Switch OLED + 2 juegos', category: 'gaming', price: 260, daysAgo: 40, views: 156, status: 'sold',
      description: 'Consola Switch OLED blanca con Mario Kart 8 Deluxe y Zelda: Breath of the Wild.', condition: 'like_new', brand: 'Nintendo', model: 'Switch OLED',
      attributes: { gamingType: 'console', platform: 'switch', ageRating: '7' }, city: 'Madrid', zone: 'Lavapiés', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_006', sellerId: 'u1', title: 'Máquina de coser Singer Tradition', category: 'other', price: 80, daysAgo: 1, imageCount: 1, status: 'draft',
      description: 'Máquina de coser con 23 puntadas. Pendiente de revisar el pedal antes de publicar.', condition: 'good', brand: 'Singer', model: 'Tradition 2282',
      customAttributes: [{ label: 'Puntadas', value: '23' }], city: 'Madrid', zone: 'Lavapiés', delivery: { inPerson: true } }),
    listing({ id: 'lst_007', sellerId: 'u1', title: 'Habitación luminosa en piso compartido', category: 'rooms', operationType: 'rent', rentalPeriod: 'month', price: 520, daysAgo: 0, views: 0, status: 'pending_review', minDuration: 6,
      description: 'Habitación exterior con escritorio y armario empotrado en piso de 3 habitaciones.', requirements: 'Contrato mínimo de 6 meses. Ambiente tranquilo.',
      attributes: { roomType: 'single', flatmates: 2, expensesIncluded: true, deposit: 520, availableFrom: dateIn(20), coexistenceRules: 'No se permite fumar. Limpieza por turnos.' },
      city: 'Madrid', postalCode: '28012', zone: 'Lavapiés', delivery: { agreed: true } }),

    // --- Carlos (u2, Valencia): vehículos ---
    listing({ id: 'lst_008', sellerId: 'u2', title: 'Seat León 1.5 TSI FR 2019', category: 'cars', price: 16900, daysAgo: 4, featured: true, views: 340,
      description: 'Seat León FR con libro de mantenimiento sellado en concesionario. ITV recién pasada. Neumáticos nuevos.', brand: 'Seat', model: 'León FR 1.5 TSI',
      attributes: { year: 2019, mileage: 68000, fuel: 'gasoline', transmission: 'manual', power: 150, vehicleCondition: 'used_good' },
      city: 'Valencia', postalCode: '46010', zone: 'Benimaclet', delivery: { inPerson: true, agreed: true } }),
    listing({ id: 'lst_009', sellerId: 'u2', title: 'Toyota Corolla Hybrid 2022 – alquiler por días', category: 'cars', operationType: 'rent', rentalPeriod: 'day', price: 45, daysAgo: 12, views: 205, minDuration: 2, maxDuration: 30,
      description: 'Corolla Touring Sports híbrido, automático, muy económico. Perfecto para viajes en familia.', brand: 'Toyota', model: 'Corolla Touring Sports 125H',
      requirements: 'Carné de conducir en vigor y DNI. Se firma un contrato de alquiler entre particulares.',
      attributes: { year: 2022, mileage: 31000, fuel: 'hybrid', transmission: 'automatic', power: 122, vehicleCondition: 'semi_new', driverMinAge: 23, licenseMinYears: 2, deposit: 300, insuranceIncluded: true, kmLimit: 300, pickupReturnConditions: 'Recogida y devolución en Benimaclet de 9:00 a 20:00. Se entrega con el depósito lleno y se devuelve igual.' },
      city: 'Valencia', postalCode: '46010', zone: 'Benimaclet', delivery: { pickup: true } }),
    listing({ id: 'lst_010', sellerId: 'u2', title: 'Yamaha MT-07 2020 limitable A2', category: 'motorbikes', price: 6200, daysAgo: 9, views: 98,
      description: 'MT-07 con kit de limitación A2 incluido. Escape original y alforjas.', brand: 'Yamaha', model: 'MT-07',
      attributes: { motoType: 'naked', year: 2020, mileage: 14500, engineCc: 689, licenseRequired: 'A2', vehicleCondition: 'used_good' },
      city: 'Valencia', zone: 'Benimaclet', delivery: { inPerson: true } }),
    listing({ id: 'lst_011', sellerId: 'u2', title: 'Scooter Honda PCX 125 para moverte por la ciudad', category: 'motorbikes', operationType: 'rent', rentalPeriod: 'day', price: 25, daysAgo: 15, views: 61, minDuration: 1, maxDuration: 14,
      description: 'Scooter de 125 cc ágil y económico. Incluye dos cascos y baúl.', brand: 'Honda', model: 'PCX 125',
      requirements: 'Permiso A1 o B con más de 3 años de antigüedad.',
      attributes: { motoType: 'scooter', year: 2021, mileage: 9800, engineCc: 125, licenseRequired: 'A1', vehicleCondition: 'used_good', driverMinAge: 21, licenseMinYears: 3, deposit: 150, insuranceIncluded: true, kmLimit: 150, pickupReturnConditions: 'Recogida en Benimaclet. Devolución con el mismo nivel de gasolina.' },
      city: 'Valencia', zone: 'Benimaclet', delivery: { pickup: true } }),
    listing({ id: 'lst_012', sellerId: 'u2', title: 'Volkswagen Golf GTE 2018 híbrido enchufable', category: 'cars', price: 18500, daysAgo: 25, views: 274,
      description: 'Golf GTE con etiqueta CERO. Cargador doméstico incluido. Único propietario.', brand: 'Volkswagen', model: 'Golf GTE',
      priceHistory: [{ price: 19900, date: ago(25) }, { price: 18500, date: ago(3) }], updatedAt: ago(3),
      attributes: { year: 2018, mileage: 82000, fuel: 'plugin', transmission: 'automatic', power: 204, vehicleCondition: 'used_good' },
      city: 'Valencia', zone: 'Ruzafa', delivery: { inPerson: true, agreed: true } }),
    listing({ id: 'lst_013', sellerId: 'u2', title: 'Cámara GoPro HERO11 con accesorios', category: 'electronics', operationType: 'rent', rentalPeriod: 'day', price: 12, daysAgo: 7, views: 33, minDuration: 2,
      description: 'GoPro HERO11 Black con 2 baterías, carcasa estanca, palo selfie y tarjeta de 128 GB.', condition: 'good', brand: 'GoPro', model: 'HERO11 Black',
      requirements: 'Fianza de 100 € a la entrega (en mano, fuera de la plataforma).',
      attributes: { deviceType: 'camera', accessories: '2 baterías, carcasa, palo selfie, microSD 128 GB' },
      city: 'Valencia', zone: 'Ruzafa', delivery: { inPerson: true, pickup: true } }),

    // --- Marta (u3, Barcelona): inmuebles ---
    listing({ id: 'lst_014', sellerId: 'u3', title: 'Piso de 3 habitaciones en Gràcia', category: 'housing', price: 385000, daysAgo: 5, featured: true, views: 520, imageCount: 3,
      description: 'Piso reformado de 92 m² en finca regia. Balcón a la calle, techos altos y suelos hidráulicos originales.',
      attributes: { propertyType: 'flat', area: 92, bedrooms: 3, bathrooms: 2, propertyCondition: 'good', furnished: 'unfurnished', extraCosts: 'Comunidad 70 €/mes · IBI 480 €/año', energyRating: 'D' },
      city: 'Barcelona', postalCode: '08012', zone: 'Vila de Gràcia', delivery: { agreed: true } }),
    listing({ id: 'lst_015', sellerId: 'u3', title: 'Estudio amueblado en Poblenou', category: 'housing', operationType: 'rent', rentalPeriod: 'month', price: 950, daysAgo: 3, views: 410, minDuration: 12,
      description: 'Estudio de 38 m² totalmente equipado, a 5 minutos de la playa. Edificio con ascensor.',
      requirements: 'Nómina o garantías de solvencia. Contrato de larga duración.',
      attributes: { propertyType: 'studio', area: 38, bedrooms: 0, bathrooms: 1, propertyCondition: 'good', furnished: 'furnished', extraCosts: 'Suministros aparte', deposit: 1900, expensesIncluded: false, availableFrom: dateIn(15) },
      city: 'Barcelona', postalCode: '08005', zone: 'Poblenou', delivery: { agreed: true } }),
    listing({ id: 'lst_016', sellerId: 'u3', title: 'Casa adosada con jardín en Sant Cugat', category: 'housing', price: 590000, daysAgo: 18, views: 233,
      description: 'Adosada de 4 habitaciones con jardín privado de 60 m², garaje para dos coches y trastero.',
      attributes: { propertyType: 'house', area: 210, bedrooms: 4, bathrooms: 3, propertyCondition: 'good', furnished: 'partial', extraCosts: 'Comunidad 45 €/mes', energyRating: 'C' },
      city: 'Sant Cugat del Vallès', zone: 'Valldoreix', delivery: { agreed: true } }),
    listing({ id: 'lst_017', sellerId: 'u3', title: 'Habitación doble en piso compartido – Eixample', category: 'rooms', operationType: 'rent', rentalPeriod: 'month', price: 480, daysAgo: 8, views: 150, minDuration: 3,
      description: 'Habitación doble con balcón en piso de 4 habitaciones, compartido con estudiantes de máster.',
      requirements: 'Estudiantes o profesionales. No fumadores.',
      attributes: { roomType: 'double', flatmates: 3, expensesIncluded: true, deposit: 480, availableFrom: dateIn(7), coexistenceRules: 'Sin mascotas. Visitas avisando con antelación.' },
      city: 'Barcelona', postalCode: '08011', zone: 'Eixample Esquerra', delivery: { agreed: true } }),
    listing({ id: 'lst_018', sellerId: 'u3', title: 'Sofá de 3 plazas gris antracita', category: 'home', price: 220, daysAgo: 11, views: 72,
      description: 'Sofá de 3 plazas con fundas lavables. Por mudanza. Hay que recogerlo en un segundo sin ascensor.', condition: 'good', brand: 'IKEA',
      attributes: { itemType: 'furniture', dimensions: '210 × 85 × 90 cm', material: 'Tela' }, city: 'Barcelona', zone: 'Sants', delivery: { pickup: true } }),

    // --- David (u4, Sevilla): tecnología y videojuegos ---
    listing({ id: 'lst_019', sellerId: 'u4', title: 'Portátil Lenovo ThinkPad T14 Gen 2', category: 'electronics', price: 540, daysAgo: 1, featured: true, views: 64,
      description: 'ThinkPad profesional con teclado retroiluminado. Batería en buen estado (unas 6 h de uso).', condition: 'good', brand: 'Lenovo', model: 'ThinkPad T14 Gen 2',
      attributes: { deviceType: 'laptop', warranty: '3 meses de garantía del vendedor', accessories: 'Cargador original', specs: 'Intel i5-1135G7, 16 GB RAM, SSD 512 GB, 14" FHD' },
      city: 'Sevilla', postalCode: '41003', zone: 'Nervión', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_020', sellerId: 'u4', title: 'PlayStation 5 edición digital', category: 'gaming', price: 330, daysAgo: 3, views: 190,
      description: 'PS5 digital con un mando DualSense. Funciona perfectamente, se vende por falta de uso.', condition: 'like_new', brand: 'Sony', model: 'PS5 Digital',
      attributes: { gamingType: 'console', platform: 'ps5' }, city: 'Sevilla', zone: 'Nervión', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_021', sellerId: 'u4', title: 'Alquiler de Meta Quest 3 para fines de semana', category: 'gaming', operationType: 'rent', rentalPeriod: 'day', price: 30, daysAgo: 35, views: 88, minDuration: 1, maxDuration: 4,
      description: 'Gafas de realidad virtual Meta Quest 3 de 128 GB con varios juegos instalados.', condition: 'like_new', brand: 'Meta', model: 'Quest 3',
      requirements: 'Mayor de 18 años. Se firma un documento de entrega.',
      attributes: { gamingType: 'vr', platform: 'meta', ageRating: '12' }, city: 'Sevilla', zone: 'Nervión', delivery: { inPerson: true, pickup: true } }),
    listing({ id: 'lst_022', sellerId: 'u4', title: 'iPhone 13 128 GB azul', category: 'electronics', price: 410, daysAgo: 28, views: 301, status: 'sold',
      description: 'iPhone 13 libre, batería al 88 %. Sin golpes.', condition: 'good', brand: 'Apple', model: 'iPhone 13',
      attributes: { deviceType: 'smartphone', accessories: 'Caja y cable' }, city: 'Sevilla', zone: 'Nervión', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_023', sellerId: 'u4', title: 'Hidrolimpiadora Kärcher K5 por días', category: 'home', operationType: 'rent', rentalPeriod: 'day', price: 15, daysAgo: 13, views: 40, minDuration: 1,
      description: 'Hidrolimpiadora de 145 bar con lanza rotativa y limpiador de superficies.', condition: 'good', brand: 'Kärcher', model: 'K5 Power Control',
      requirements: 'Devolver limpia. Fianza de 50 € en mano.',
      attributes: { itemType: 'tools' }, city: 'Sevilla', zone: 'Triana', delivery: { pickup: true } }),

    // --- Ana (u5, Bilbao): deporte y moda ---
    listing({ id: 'lst_024', sellerId: 'u5', title: 'Bicicleta de carretera Orbea Orca talla 53', category: 'sports', price: 1150, daysAgo: 2, featured: true, views: 133,
      description: 'Orbea Orca de carbono con grupo Shimano 105 de 11 velocidades. Revisión completa hace un mes.', condition: 'good', brand: 'Orbea', model: 'Orca M30',
      attributes: { sportType: 'cycling', size: '53' }, city: 'Bilbao', postalCode: '48007', zone: 'Deusto', delivery: { inPerson: true, agreed: true } }),
    listing({ id: 'lst_025', sellerId: 'u5', title: 'Botas de montaña Salomon talla 41', category: 'fashion', price: 60, daysAgo: 10, views: 27,
      description: 'Botas impermeables Gore-Tex. Usadas en dos salidas; me quedan pequeñas.', condition: 'like_new', brand: 'Salomon',
      attributes: { garmentType: 'shoes', size: '41', color: 'Gris y negro', sizeSection: 'women' }, city: 'Bilbao', zone: 'Deusto', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_026', sellerId: 'u5', title: 'Vestido de fiesta largo verde esmeralda – alquiler', category: 'fashion', operationType: 'rent', rentalPeriod: 'day', price: 35, daysAgo: 16, views: 58, minDuration: 2, maxDuration: 5,
      description: 'Vestido largo de satén, ideal para bodas y eventos. Se entrega limpio y planchado.', condition: 'like_new',
      requirements: 'Fianza de 60 € en mano. Tintorería incluida en el precio.',
      attributes: { garmentType: 'dress', size: '38', color: 'Verde esmeralda', sizeSection: 'women' }, city: 'Bilbao', zone: 'Abando', delivery: { inPerson: true, shipping: true } }),
    listing({ id: 'lst_027', sellerId: 'u5', title: 'Colección de vinilos de jazz (40 discos)', category: 'other', price: 180, daysAgo: 22, views: 45,
      description: 'Lote de 40 LP de jazz clásico: Coltrane, Miles Davis, Bill Evans… La mayoría reediciones en buen estado.', condition: 'good',
      customAttributes: [{ label: 'Número de discos', value: '40' }, { label: 'Formato', value: 'LP 33 rpm' }],
      city: 'Bilbao', zone: 'Abando', delivery: { inPerson: true, shipping: true } }),
  ];

  /** Crea un pedido de prueba con historial de estados. */
  const order = ({ id, listingId, buyerId, sellerId, operationType, amount, createdDaysAgo, status, history, startDate = null, endDate = null, delivery, units = null }) => ({
    id, listingId, buyerId, sellerId, operationType, amount, currency: 'EUR',
    createdAt: ago(createdDaysAgo), updatedAt: ago(history.at(-1)[1]),
    startDate, endDate, units, status,
    delivery,
    statusHistory: history.map(([state, daysAgoValue, by]) => ({ status: state, date: ago(daysAgoValue), by })),
  });

  const orders = [
    order({ id: 'PED-26-A1B2C3', listingId: 'lst_022', buyerId: 'u1', sellerId: 'u4', operationType: 'sale', amount: 410, createdDaysAgo: 22, status: 'completed',
      delivery: { method: 'shipping', notes: 'Envío a domicilio (dirección compartida por mensaje).' },
      history: [['pending', 22, 'u1'], ['accepted', 21.8, 'u4'], ['preparing', 21.5, 'u4'], ['shipped', 21, 'u4'], ['completed', 19, 'u1']] }),
    order({ id: 'PED-26-D4E5F6', listingId: 'lst_020', buyerId: 'u1', sellerId: 'u4', operationType: 'sale', amount: 330, createdDaysAgo: 1, status: 'pending',
      delivery: { method: 'inPerson', notes: '' }, history: [['pending', 1, 'u1']] }),
    order({ id: 'RES-26-G7H8J9', listingId: 'lst_009', buyerId: 'u1', sellerId: 'u2', operationType: 'rent', amount: 135, units: 3, createdDaysAgo: 4, status: 'confirmed',
      startDate: dateIn(5), endDate: dateIn(8), delivery: { method: 'pickup', notes: 'Recogida a las 10:00.' },
      history: [['pending', 4, 'u1'], ['confirmed', 3.5, 'u2']] }),
    order({ id: 'PED-26-K1L2M3', listingId: 'lst_005', buyerId: 'u5', sellerId: 'u1', operationType: 'sale', amount: 260, createdDaysAgo: 34, status: 'completed',
      delivery: { method: 'shipping', notes: '' },
      history: [['pending', 34, 'u5'], ['accepted', 33.9, 'u1'], ['preparing', 33.5, 'u1'], ['shipped', 33, 'u1'], ['completed', 31, 'u5']] }),
    order({ id: 'PED-26-N4P5Q6', listingId: 'lst_002', buyerId: 'u3', sellerId: 'u1', operationType: 'sale', amount: 390, createdDaysAgo: 0.1, status: 'pending',
      delivery: { method: 'shipping', notes: '¿Podrías enviarlo esta semana?' }, history: [['pending', 0.1, 'u3']] }),
    order({ id: 'RES-26-R7S8T9', listingId: 'lst_004', buyerId: 'u4', sellerId: 'u1', operationType: 'rent', amount: 36, units: 2, createdDaysAgo: 20, status: 'completed',
      startDate: dateIn(-16), endDate: dateIn(-14), delivery: { method: 'pickup', notes: '' },
      history: [['pending', 20, 'u4'], ['confirmed', 19.5, 'u1'], ['in_progress', 16, 'u1'], ['completed', 14, 'u1']] }),
    order({ id: 'RES-26-U1V2W3', listingId: 'lst_004', buyerId: 'u2', sellerId: 'u1', operationType: 'rent', amount: 36, units: 2, createdDaysAgo: 0.5, status: 'pending',
      startDate: dateIn(10), endDate: dateIn(12), delivery: { method: 'pickup', notes: 'Somos dos, ¿tienes un segundo remo?' }, history: [['pending', 0.5, 'u2']] }),
    order({ id: 'RES-26-X4Y5Z6', listingId: 'lst_021', buyerId: 'u1', sellerId: 'u4', operationType: 'rent', amount: 60, units: 2, createdDaysAgo: 30, status: 'completed',
      startDate: dateIn(-27), endDate: dateIn(-25), delivery: { method: 'inPerson', notes: '' },
      history: [['pending', 30, 'u1'], ['confirmed', 29, 'u4'], ['in_progress', 27, 'u4'], ['completed', 25, 'u4']] }),
  ];

  const favorites = [
    { id: 'fav_001', userId: 'u1', listingId: 'lst_012', createdAt: ago(10) },
    { id: 'fav_002', userId: 'u1', listingId: 'lst_015', createdAt: ago(2) },
    { id: 'fav_003', userId: 'u1', listingId: 'lst_024', createdAt: ago(1) },
    { id: 'fav_004', userId: 'u3', listingId: 'lst_002', createdAt: ago(3) },
    { id: 'fav_005', userId: 'u5', listingId: 'lst_001', createdAt: ago(1) },
    { id: 'fav_006', userId: 'u2', listingId: 'lst_004', createdAt: ago(6) },
  ];

  const conversation = (listingId, buyerId) => `conv_${listingId}_${buyerId}`;
  const messages = [
    { id: 'msg_001', conversationId: conversation('lst_009', 'u1'), listingId: 'lst_009', senderId: 'u1', receiverId: 'u2', content: 'Hola Carlos, ¿el coche puede llevar silla de bebé?', createdAt: ago(4, 2), read: true },
    { id: 'msg_002', conversationId: conversation('lst_009', 'u1'), listingId: 'lst_009', senderId: 'u2', receiverId: 'u1', content: 'Hola Laura, sí, tiene anclajes Isofix y puedo dejarte una silla sin coste.', createdAt: ago(3, 20), read: false },
    { id: 'msg_003', conversationId: conversation('lst_002', 'u3'), listingId: 'lst_002', senderId: 'u3', receiverId: 'u1', content: 'Hola, ¿el iPad incluye el cargador original?', createdAt: ago(0, 3), read: false },
    { id: 'msg_004', conversationId: conversation('lst_014', 'u1'), listingId: 'lst_014', senderId: 'u1', receiverId: 'u3', content: 'Buenas, ¿se podría visitar el piso este sábado?', createdAt: ago(2, 5), read: true },
    { id: 'msg_005', conversationId: conversation('lst_014', 'u1'), listingId: 'lst_014', senderId: 'u3', receiverId: 'u1', content: 'Sí, el sábado a las 11:00 me va bien. Te paso la dirección exacta por aquí ese mismo día.', createdAt: ago(2, 1), read: true },
  ];

  const reviews = [
    { id: 'rev_001', orderId: 'PED-26-K1L2M3', listingId: 'lst_005', reviewerId: 'u5', revieweeId: 'u1', rating: 5, comment: 'Todo perfecto, la consola llegó muy bien embalada.', createdAt: ago(30) },
    { id: 'rev_002', orderId: 'RES-26-R7S8T9', listingId: 'lst_004', reviewerId: 'u4', revieweeId: 'u1', rating: 4, comment: 'La tabla estaba en buen estado. La recogida fue algo tarde, pero bien.', createdAt: ago(13) },
    { id: 'rev_003', orderId: 'PED-26-A1B2C3', listingId: 'lst_022', reviewerId: 'u1', revieweeId: 'u4', rating: 5, comment: 'Vendedor muy serio, el móvil tal cual se describía.', createdAt: ago(18) },
    { id: 'rev_004', orderId: 'RES-26-X4Y5Z6', listingId: 'lst_021', reviewerId: 'u1', revieweeId: 'u4', rating: 4, comment: 'Las gafas funcionaban perfectamente.', createdAt: ago(24) },
  ];

  return { version: 1, users, listings, orders, favorites, messages, reviews, reports: [] };
}
