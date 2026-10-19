/**
 * api.js
 * ---------------------------------------------------------------------------
 * CAPA DE ACCESO A DATOS ("API" DE DEMOSTRACIÓN).
 *
 * ⚠️  NO EXISTE UN SERVIDOR REAL. LocalApi simula en el navegador lo que en
 * producción haría un backend: genera identificadores, aplica las reglas de
 * negocio (no comprar tu propio anuncio, evitar pedidos duplicados, impedir
 * reservas solapadas…) y persiste los datos en LocalStorage.
 *
 * Toda la interfaz habla con esta capa a través de métodos asíncronos que
 * devuelven promesas. Para conectar un backend basta con escribir una clase
 * con los mismos métodos que haga peticiones fetch() a una API REST (ver el
 * esqueleto RestApi al final del archivo) y cambiar la exportación `api`.
 *
 * Las reglas implementadas aquí deben repetirse en el servidor: cualquier
 * comprobación hecha en el navegador puede saltarse y no aporta seguridad.
 */

import { APP_CONFIG, buildSeedData, getCategory, OPEN_ORDER_STATUSES, ORDER_TRANSITIONS } from './data.js';
import { validateListing } from './validation.js';
import { createId, deepClone, safeStorage } from './utils.js';

/** Error de negocio con mensaje apto para mostrar al usuario. */
export class ApiError extends Error {
  constructor(message, code = 'error', details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/* --------------------------------------------------------------------------
   Utilidades de reglas de negocio (exportadas para que la interfaz pueda
   mostrar el mismo razonamiento antes de llamar a la API).
   -------------------------------------------------------------------------- */

/** Convierte una fecha «AAAA-MM-DD» o «AAAA-MM-DDTHH:mm» a milisegundos. */
function toTime(value) {
  return new Date(value.length <= 10 ? `${value}T00:00` : value).getTime();
}

/**
 * Calcula cuántas unidades de alquiler (horas, días, semanas, meses) abarca
 * un intervalo. Para periodos diarios o superiores el día de devolución no
 * cuenta (del 10 al 12 = 2 días), con un mínimo de 1 unidad.
 */
export function computeRentalUnits(period, startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = toTime(startDate);
  const end = toTime(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  const hours = (end - start) / 3_600_000;
  const days = Math.round(hours / 24);
  switch (period) {
    case 'hour': return Math.max(1, Math.ceil(hours));
    case 'day': return Math.max(1, days);
    case 'week': return Math.max(1, Math.ceil(days / 7));
    case 'month': return Math.max(1, Math.ceil(days / 30));
    default: return 0;
  }
}

/** Intervalo [inicio, fin) en milisegundos. Una reserva de un solo día ocupa ese día completo. */
function bookingInterval(order) {
  const start = toTime(order.startDate);
  let end = toTime(order.endDate);
  if (end <= start) end = start + 86_400_000;
  return [start, end];
}

/** ¿Se solapan dos reservas? */
export function bookingsOverlap(a, b) {
  const [aStart, aEnd] = bookingInterval(a);
  const [bStart, bEnd] = bookingInterval(b);
  return aStart < bEnd && bStart < aEnd;
}

/** Reservas confirmadas o en curso que bloquean el calendario de un anuncio. */
export function blockingBookings(orders, listingId) {
  return orders.filter((order) => order.listingId === listingId && order.operationType === 'rent' && ['confirmed', 'in_progress'].includes(order.status));
}

/** Pedido de venta abierto (reservado) para un anuncio, si existe. */
export function openSaleOrder(orders, listingId) {
  return orders.find((order) => order.listingId === listingId && order.operationType === 'sale' && OPEN_ORDER_STATUSES.includes(order.status)) ?? null;
}

/* ==========================================================================
   Implementación local
   ========================================================================== */

class LocalApi {
  constructor() {
    this.db = null;
    /** false si el navegador no deja guardar datos: la demo funciona solo en memoria. */
    this.persistent = true;
    /** Usuario de demostración activo cuando no hay almacenamiento disponible. */
    this.memorySessionUserId = null;
  }

  /* ---------------------------- Persistencia ---------------------------- */

  /** Carga los datos de LocalStorage o crea los datos de prueba la primera vez. */
  async init() {
    const probeKey = `${APP_CONFIG.storageKey}.probe`;
    this.persistent = safeStorage.set('localStorage', probeKey, '1');
    safeStorage.remove('localStorage', probeKey);
    if (!this.persistent) console.warn('LocalStorage no disponible: los datos se mantendrán solo en memoria.');
    try {
      const raw = safeStorage.get('localStorage', APP_CONFIG.storageKey);
      this.db = raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('No se pudieron leer los datos locales; se regeneran los datos de prueba.', error);
      this.db = null;
    }
    if (!this.db || this.db.version !== 1) {
      this.db = buildSeedData();
      this.#persist();
    }
    return true;
  }

  /** Guarda el estado completo. Lanza un ApiError comprensible si se agota el espacio. */
  #persist() {
    if (!this.persistent) return;
    try {
      localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(this.db));
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        throw new ApiError('El almacenamiento local del navegador está lleno. Elimina fotos o anuncios de prueba, o restablece los datos de demostración.', 'storage_full');
      }
      throw new ApiError('No se pudieron guardar los datos en este navegador.', 'storage_error');
    }
  }

  /**
   * Ejecuta una operación de escritura de forma "transaccional": si la
   * operación o el guardado fallan, se restaura el estado anterior.
   */
  async #mutate(operation) {
    await wait(APP_CONFIG.demoLatencyMs);
    const backup = deepClone(this.db);
    try {
      const result = operation(this.db);
      this.#persist();
      return deepClone(result);
    } catch (error) {
      this.db = backup;
      throw error;
    }
  }

  /** Devuelve una copia de todas las colecciones (equivale a varios GET). */
  async getSnapshot() {
    await wait(APP_CONFIG.demoLatencyMs / 3);
    return deepClone(this.db);
  }

  /** Borra los datos locales y vuelve a generar los de prueba. */
  async resetDemoData() {
    await wait(APP_CONFIG.demoLatencyMs);
    this.db = buildSeedData();
    this.#persist();
    safeStorage.remove('sessionStorage', 'trato.viewed');
    return true;
  }

  /* ------------------------------ Sesión -------------------------------- */
  // ⚠️ DEMOSTRACIÓN: no hay autenticación. El "usuario actual" es un
  // identificador guardado en LocalStorage que se puede cambiar libremente.

  async getCurrentUserId() {
    const stored = safeStorage.get('localStorage', APP_CONFIG.sessionKey) ?? this.memorySessionUserId;
    return this.db.users.some((user) => user.id === stored) ? stored : 'u1';
  }

  async switchDemoUser(userId) {
    if (!this.db.users.some((user) => user.id === userId)) throw new ApiError('Usuario de demostración no encontrado.');
    this.memorySessionUserId = userId;
    safeStorage.set('localStorage', APP_CONFIG.sessionKey, userId);
    return userId;
  }

  /* ------------------------------ Usuarios ------------------------------ */

  async updateUser(actorId, userId, patch) {
    return this.#mutate((db) => {
      if (actorId !== userId) throw new ApiError('Solo puedes modificar tu propio perfil.', 'forbidden');
      const user = db.users.find((candidate) => candidate.id === userId);
      if (!user) throw new ApiError('Usuario no encontrado.', 'not_found');
      const forbiddenKeys = ['id', 'createdAt', 'role'];
      Object.entries(patch).forEach(([key, value]) => {
        if (!forbiddenKeys.includes(key)) user[key] = value;
      });
      if (patch.username !== undefined) {
        const username = String(patch.username).trim().toLowerCase();
        if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new ApiError('El nombre de usuario debe tener entre 3 y 20 caracteres (letras, números, «_» o «.»).', 'validation');
        if (db.users.some((other) => other.id !== userId && other.username === username)) throw new ApiError('Ese nombre de usuario ya está en uso.', 'conflict');
        user.username = username;
      }
      return user;
    });
  }

  /* ------------------------------ Anuncios ------------------------------ */

  /** Normaliza los datos del asistente al modelo de anuncio. */
  #buildListingFields(data) {
    const category = getCategory(data.category);
    const attributes = {};
    category.fields
      .filter((field) => !field.showIf?.operationType || field.showIf.operationType === data.operationType)
      .forEach((field) => {
        const value = data.attributes?.[field.key];
        if (field.type === 'checkbox') attributes[field.key] = Boolean(value);
        else if (field.type === 'number') attributes[field.key] = value === '' || value === null || value === undefined ? null : Number(value);
        else attributes[field.key] = value ?? '';
      });
    const delivery = {};
    ['inPerson', 'shipping', 'pickup', 'agreed'].forEach((option) => {
      delivery[option] = category.deliveryOptions.includes(option) && Boolean(data.delivery?.[option]);
    });
    return {
      title: (data.title ?? '').trim(),
      description: (data.description ?? '').trim(),
      category: category.id,
      subcategory: category.subcategoryField ? attributes[category.subcategoryField] || null : null,
      operationType: data.operationType ?? category.operations[0],
      price: data.price === '' || data.price === null || data.price === undefined ? null : Number(data.price),
      currency: APP_CONFIG.currency,
      rental: data.operationType === 'rent'
        ? {
          period: data.rental?.period ?? null,
          minDuration: data.rental?.minDuration ? Number(data.rental.minDuration) : 1,
          maxDuration: data.rental?.maxDuration ? Number(data.rental.maxDuration) : null,
          requirements: (data.rental?.requirements ?? '').trim(),
        }
        : null,
      condition: category.basic.condition ? data.condition || null : null,
      brand: category.basic.brand ? (data.brand ?? '').trim() : '',
      model: category.basic.model ? (data.model ?? '').trim() : '',
      availability: (data.availability ?? '').trim(),
      deliveryNotes: (data.deliveryNotes ?? '').trim(),
      attributes,
      customAttributes: category.allowCustomAttributes
        ? (data.customAttributes ?? []).filter((item) => item.label?.trim() && item.value?.trim()).map((item) => ({ label: item.label.trim(), value: item.value.trim() }))
        : [],
      images: (data.images ?? []).map((image, index) => ({ id: image.id, src: image.src, alt: image.alt || `${data.title} — imagen ${index + 1}` })),
      location: {
        city: (data.location?.city ?? '').trim(),
        postalCode: (data.location?.postalCode ?? '').trim(),
        zone: (data.location?.zone ?? '').trim(),
      },
      delivery,
    };
  }

  /**
   * Crea un anuncio. status: 'active' (publicar) o 'draft' (borrador).
   * En producción un anuncio publicado podría pasar antes por moderación
   * ('pending_review'); en la demo se aprueba automáticamente.
   */
  async createListing(sellerId, data, { status = 'active' } = {}) {
    const mode = status === 'draft' ? 'draft' : 'publish';
    const errors = validateListing(data, { mode });
    if (Object.keys(errors).length) throw new ApiError('Revisa los campos marcados antes de continuar.', 'validation', errors);
    return this.#mutate((db) => {
      const now = new Date().toISOString();
      const fields = this.#buildListingFields(data);
      const listing = {
        id: createId('lst'),
        sellerId,
        ...fields,
        status,
        featured: false,
        views: 0,
        priceHistory: fields.price ? [{ price: fields.price, date: now }] : [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      db.listings.unshift(listing);
      return listing;
    });
  }

  /** Busca un anuncio comprobando que pertenece a quien realiza la acción. */
  #ownedListing(db, actorId, listingId) {
    const listing = db.listings.find((candidate) => candidate.id === listingId && !candidate.deletedAt);
    if (!listing) throw new ApiError('El anuncio no existe o ha sido eliminado.', 'not_found');
    if (listing.sellerId !== actorId) throw new ApiError('Solo el propietario puede modificar este anuncio.', 'forbidden');
    return listing;
  }

  /** Registra un cambio de precio en el historial (sirve para avisar a quien lo tiene en favoritos). */
  #trackPrice(listing, newPrice) {
    if (newPrice && newPrice !== listing.price) {
      listing.priceHistory = [...(listing.priceHistory ?? []), { price: newPrice, date: new Date().toISOString() }];
    }
  }

  /** Actualiza un anuncio completo desde el asistente. publish=true convierte un borrador en activo. */
  async updateListing(actorId, listingId, data, { publish = false } = {}) {
    const current = this.db.listings.find((candidate) => candidate.id === listingId);
    const mode = publish || (current && current.status !== 'draft') ? 'publish' : 'draft';
    const errors = validateListing(data, { mode });
    if (Object.keys(errors).length) throw new ApiError('Revisa los campos marcados antes de continuar.', 'validation', errors);
    return this.#mutate((db) => {
      const listing = this.#ownedListing(db, actorId, listingId);
      const fields = this.#buildListingFields(data);
      this.#trackPrice(listing, fields.price);
      Object.assign(listing, fields, { updatedAt: new Date().toISOString() });
      if (publish && listing.status === 'draft') listing.status = 'active';
      return listing;
    });
  }

  /** Cambio rápido de precio desde «Mis anuncios». */
  async changeListingPrice(actorId, listingId, newPrice) {
    const price = Number(newPrice);
    if (!Number.isFinite(price) || price <= 0) throw new ApiError('Introduce un precio mayor que cero.', 'validation');
    return this.#mutate((db) => {
      const listing = this.#ownedListing(db, actorId, listingId);
      this.#trackPrice(listing, price);
      listing.price = price;
      listing.updatedAt = new Date().toISOString();
      return listing;
    });
  }

  /** Cambia el estado de publicación (pausar, reactivar, vender, alquilar, finalizar). */
  async changeListingStatus(actorId, listingId, nextStatus) {
    const allowed = {
      active: ['paused', 'sold', 'rented', 'finished'],
      paused: ['active', 'finished'],
      pending_review: ['paused'],
      sold: ['active'],
      rented: ['active', 'finished'],
      finished: ['active'],
      draft: [],
    };
    return this.#mutate((db) => {
      const listing = this.#ownedListing(db, actorId, listingId);
      if (!allowed[listing.status]?.includes(nextStatus)) throw new ApiError('Este cambio de estado no está permitido.', 'invalid_transition');
      if (nextStatus === 'sold' && listing.operationType !== 'sale') throw new ApiError('Solo los anuncios de venta pueden marcarse como vendidos.', 'invalid_transition');
      if (nextStatus === 'rented' && listing.operationType !== 'rent') throw new ApiError('Solo los anuncios de alquiler pueden marcarse como alquilados.', 'invalid_transition');
      if (nextStatus === 'active') {
        const errors = validateListing(listing, { mode: 'publish' });
        if (Object.keys(errors).length) throw new ApiError('El anuncio está incompleto. Edítalo antes de reactivarlo.', 'validation', errors);
        if (listing.operationType === 'sale' && db.orders.some((order) => order.listingId === listing.id && order.status === 'completed')) {
          throw new ApiError('Este artículo ya tiene una venta completada. Publica un anuncio nuevo si tienes otra unidad.', 'conflict');
        }
      }
      listing.status = nextStatus;
      listing.updatedAt = new Date().toISOString();
      return listing;
    });
  }

  /**
   * Elimina un anuncio de forma lógica (deletedAt). Los pedidos históricos se
   * conservan y siguen pudiendo mostrar el artículo al que se refieren.
   */
  async deleteListing(actorId, listingId) {
    return this.#mutate((db) => {
      const listing = this.#ownedListing(db, actorId, listingId);
      const hasOpenOrders = db.orders.some((order) => order.listingId === listingId && OPEN_ORDER_STATUSES.includes(order.status));
      if (hasOpenOrders) throw new ApiError('Este anuncio tiene pedidos o reservas en curso. Complétalos o cancélalos antes de eliminarlo.', 'conflict');
      listing.deletedAt = new Date().toISOString();
      listing.status = 'finished';
      db.favorites = db.favorites.filter((favorite) => favorite.listingId !== listingId);
      return { id: listingId };
    });
  }

  /** Cuenta una visita (solo de usuarios distintos del vendedor). */
  async registerView(viewerId, listingId) {
    return this.#mutate((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      if (listing && listing.sellerId !== viewerId) listing.views = (listing.views ?? 0) + 1;
      return listing?.views ?? 0;
    });
  }

  /* ----------------------------- Favoritos ------------------------------ */

  async toggleFavorite(userId, listingId) {
    return this.#mutate((db) => {
      const existing = db.favorites.find((favorite) => favorite.userId === userId && favorite.listingId === listingId);
      if (existing) {
        db.favorites = db.favorites.filter((favorite) => favorite !== existing);
        return { favorite: false };
      }
      const listing = db.listings.find((candidate) => candidate.id === listingId && !candidate.deletedAt);
      if (!listing) throw new ApiError('El anuncio ya no está disponible.', 'not_found');
      if (listing.sellerId === userId) throw new ApiError('No puedes guardar tu propio anuncio en favoritos.', 'forbidden');
      db.favorites.push({ id: createId('fav'), userId, listingId, createdAt: new Date().toISOString() });
      return { favorite: true };
    });
  }

  /* --------------------------- Pedidos y reservas ----------------------- */

  /**
   * Crea un pedido (venta) o una solicitud de reserva (alquiler).
   * Reglas: no comprar lo propio, anuncio activo, sin ventas duplicadas,
   * fechas válidas y sin solapes con reservas confirmadas.
   */
  async createOrder(buyerId, { listingId, startDate = null, endDate = null, deliveryMethod, notes = '' }) {
    return this.#mutate((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId && !candidate.deletedAt);
      if (!listing) throw new ApiError('El anuncio ya no está disponible.', 'not_found');
      if (listing.sellerId === buyerId) throw new ApiError('No puedes comprar ni alquilar tu propio anuncio.', 'forbidden');
      if (listing.status !== 'active') throw new ApiError('Este anuncio no está disponible en este momento.', 'unavailable');
      if (!listing.delivery?.[deliveryMethod]) throw new ApiError('Selecciona una modalidad de entrega disponible.', 'validation');

      const now = new Date().toISOString();
      const base = {
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        operationType: listing.operationType,
        currency: listing.currency,
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        delivery: { method: deliveryMethod, notes: String(notes).trim().slice(0, 300) },
        statusHistory: [{ status: 'pending', date: now, by: buyerId }],
      };

      if (listing.operationType === 'sale') {
        const existing = openSaleOrder(db.orders, listingId);
        if (existing?.buyerId === buyerId) throw new ApiError('Ya tienes un pedido abierto para este artículo.', 'duplicate');
        if (existing) throw new ApiError('Este artículo está reservado por otro comprador.', 'unavailable');
        const order = { id: createId('PED').toUpperCase().replace('_', '-'), ...base, amount: listing.price, units: null, startDate: null, endDate: null };
        db.orders.unshift(order);
        return order;
      }

      // --- Alquiler ---
      if (!startDate || !endDate) throw new ApiError('Indica las fechas de inicio y fin.', 'validation');
      if (toTime(endDate) < toTime(startDate)) throw new ApiError('La fecha de fin debe ser posterior a la de inicio.', 'validation');
      if (toTime(startDate) < new Date().setHours(0, 0, 0, 0)) throw new ApiError('La fecha de inicio no puede estar en el pasado.', 'validation');
      const units = computeRentalUnits(listing.rental.period, startDate, endDate);
      const { minDuration, maxDuration } = listing.rental;
      if (minDuration && units < minDuration) throw new ApiError(`La duración mínima es de ${minDuration} unidades del periodo de alquiler.`, 'validation');
      if (maxDuration && units > maxDuration) throw new ApiError(`La duración máxima es de ${maxDuration} unidades del periodo de alquiler.`, 'validation');
      const candidate = { startDate, endDate };
      if (blockingBookings(db.orders, listingId).some((booking) => bookingsOverlap(booking, candidate))) {
        throw new ApiError('Las fechas elegidas se solapan con una reserva ya confirmada.', 'overlap');
      }
      const duplicate = db.orders.some((order) => order.listingId === listingId && order.buyerId === buyerId && order.status === 'pending' && order.startDate === startDate && order.endDate === endDate);
      if (duplicate) throw new ApiError('Ya has enviado una solicitud para estas mismas fechas.', 'duplicate');
      const order = { id: createId('RES').toUpperCase().replace('_', '-'), ...base, amount: units * listing.price, units, startDate, endDate };
      db.orders.unshift(order);
      return order;
    });
  }

  /** Cambia el estado de un pedido respetando el rol (comprador/vendedor) y las transiciones permitidas. */
  async updateOrderStatus(actorId, orderId, nextStatus) {
    return this.#mutate((db) => {
      const order = db.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new ApiError('Pedido no encontrado.', 'not_found');
      const role = order.sellerId === actorId ? 'seller' : order.buyerId === actorId ? 'buyer' : null;
      if (!role) throw new ApiError('No participas en este pedido.', 'forbidden');
      const allowed = ORDER_TRANSITIONS[order.operationType][role][order.status] ?? [];
      if (!allowed.some((transition) => transition.to === nextStatus)) throw new ApiError('Esta acción ya no está disponible para el pedido.', 'invalid_transition');

      if (order.operationType === 'rent' && nextStatus === 'confirmed') {
        const conflict = blockingBookings(db.orders, order.listingId).some((booking) => booking.id !== order.id && bookingsOverlap(booking, order));
        if (conflict) throw new ApiError('No se puede confirmar: se solapa con otra reserva confirmada.', 'overlap');
      }

      const now = new Date().toISOString();
      order.status = nextStatus;
      order.updatedAt = now;
      order.statusHistory.push({ status: nextStatus, date: now, by: actorId });

      // Efectos sobre el anuncio: una venta completada marca el artículo como vendido.
      const listing = db.listings.find((candidate) => candidate.id === order.listingId);
      if (listing && order.operationType === 'sale' && nextStatus === 'completed') {
        listing.status = 'sold';
        listing.updatedAt = now;
      }
      return order;
    });
  }

  /* ----------------------------- Valoraciones --------------------------- */

  async createReview(reviewerId, { orderId, rating, comment }) {
    return this.#mutate((db) => {
      const order = db.orders.find((candidate) => candidate.id === orderId);
      if (!order || order.buyerId !== reviewerId) throw new ApiError('Solo el comprador puede valorar este pedido.', 'forbidden');
      if (order.status !== 'completed') throw new ApiError('Solo se pueden valorar operaciones completadas.', 'invalid_state');
      if (db.reviews.some((review) => review.orderId === orderId && review.reviewerId === reviewerId)) throw new ApiError('Ya has valorado esta operación.', 'duplicate');
      const score = Number(rating);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new ApiError('Selecciona una puntuación de 1 a 5 estrellas.', 'validation');
      const review = {
        id: createId('rev'), orderId, listingId: order.listingId, reviewerId, revieweeId: order.sellerId,
        rating: score, comment: String(comment ?? '').trim().slice(0, 500), createdAt: new Date().toISOString(),
      };
      db.reviews.unshift(review);
      return review;
    });
  }

  /* ------------------------------ Mensajes ------------------------------ */

  /**
   * Envía un mensaje. La conversación se identifica por anuncio + comprador.
   * ⚠️ Solo se guarda en este navegador: la mensajería real necesita backend
   * (WebSockets o similar) para llegar al otro usuario.
   */
  async sendMessage(senderId, { listingId, receiverId, content }) {
    const text = String(content ?? '').trim();
    if (!text) throw new ApiError('Escribe un mensaje.', 'validation');
    if (text.length > 1000) throw new ApiError('El mensaje no puede superar los 1000 caracteres.', 'validation');
    return this.#mutate((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      if (!listing) throw new ApiError('El anuncio asociado no existe.', 'not_found');
      if (senderId === receiverId) throw new ApiError('No puedes enviarte mensajes a ti mismo.', 'forbidden');
      const receiver = db.users.find((user) => user.id === receiverId);
      if (!receiver) throw new ApiError('Destinatario no encontrado.', 'not_found');
      const buyerId = listing.sellerId === senderId ? receiverId : senderId;
      const conversationId = `conv_${listingId}_${buyerId}`;
      const isNewConversation = !db.messages.some((message) => message.conversationId === conversationId);
      if (isNewConversation && receiver.preferences?.privacy?.allowMessagesFrom === 'nobody') {
        throw new ApiError('Este usuario no acepta mensajes nuevos.', 'forbidden');
      }
      const message = { id: createId('msg'), conversationId, listingId, senderId, receiverId, content: text, createdAt: new Date().toISOString(), read: false };
      db.messages.push(message);
      return message;
    });
  }

  async markConversationRead(userId, conversationId) {
    return this.#mutate((db) => {
      db.messages.forEach((message) => {
        if (message.conversationId === conversationId && message.receiverId === userId) message.read = true;
      });
      return true;
    });
  }

  /* ------------------------- Denuncias y soporte ------------------------ */

  /** Registra localmente una denuncia o consulta. No se envía a ningún equipo de soporte. */
  async createReport(userId, { type, listingId = null, reason, details }) {
    if (!reason) throw new ApiError('Selecciona un motivo.', 'validation');
    if (String(details ?? '').trim().length < 10) throw new ApiError('Describe el problema con al menos 10 caracteres.', 'validation');
    return this.#mutate((db) => {
      const report = { id: createId('rep'), type, userId, listingId, reason, details: String(details).trim().slice(0, 1000), status: 'registered_locally', createdAt: new Date().toISOString() };
      db.reports.unshift(report);
      return report;
    });
  }
}

/* ==========================================================================
   Esqueleto para una futura API REST (NO SE UTILIZA en esta versión)
   --------------------------------------------------------------------------
   class RestApi {
     constructor(baseUrl, getToken) { this.baseUrl = baseUrl; this.getToken = getToken; }
     async #request(method, path, body) {
       const response = await fetch(`${this.baseUrl}${path}`, {
         method,
         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.getToken()}` },
         body: body ? JSON.stringify(body) : undefined,
       });
       const payload = await response.json().catch(() => null);
       if (!response.ok) throw new ApiError(payload?.message ?? 'Error del servidor', payload?.code, payload?.details);
       return payload;
     }
     createListing(_sellerId, data, { status }) { return this.#request('POST', '/listings', { ...data, status }); }
     createOrder(_buyerId, body) { return this.#request('POST', '/orders', body); }
     updateOrderStatus(_actorId, id, status) { return this.#request('PATCH', `/orders/${id}`, { status }); }
     // …el resto de métodos con la misma firma que LocalApi.
   }
   El identificador del usuario (actorId) lo obtendría el servidor del token,
   por lo que el primer parámetro de cada método se ignoraría.
   ========================================================================== */

export const api = new LocalApi();
