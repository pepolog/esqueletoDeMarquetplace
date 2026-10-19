/**
 * store.js
 * ---------------------------------------------------------------------------
 * ÚNICA FUENTE DE DATOS DE LA INTERFAZ.
 *
 * Mantiene en memoria una copia de los datos que devuelve la API y ofrece:
 *  - selectores: funciones de lectura que derivan información (estadísticas,
 *    disponibilidad, conversaciones…) sin duplicar datos;
 *  - acciones: llaman a la API y, al terminar, refrescan la copia en memoria
 *    y avisan a los suscriptores para que la interfaz se actualice.
 *
 * Las vistas nunca escriben directamente en los datos: siempre usan acciones.
 */

import { api, blockingBookings, openSaleOrder } from './api.js';
import { APP_CONFIG, getCategory, OPEN_ORDER_STATUSES, VERTICALS } from './data.js';
import { normalizeText, todayIsoDate } from './utils.js';

const state = {
  db: { users: [], listings: [], orders: [], favorites: [], messages: [], reviews: [], reports: [] },
  currentUserId: null,
};

const listeners = new Set();

/** Suscribe una función a los cambios de datos. Devuelve la función para cancelar la suscripción. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh() {
  state.db = await api.getSnapshot();
  state.currentUserId = await api.getCurrentUserId();
  listeners.forEach((listener) => listener());
}

export async function initStore() {
  await api.init();
  await refresh();
}

/* ==========================================================================
   Selectores
   ========================================================================== */

export const select = {
  currentUserId: () => state.currentUserId,
  currentUser: () => state.db.users.find((user) => user.id === state.currentUserId) ?? null,
  users: () => state.db.users,
  user: (userId) => state.db.users.find((user) => user.id === userId) ?? null,

  /** Devuelve un anuncio, incluso si fue eliminado (para mostrar pedidos históricos). */
  listing: (listingId) => state.db.listings.find((listing) => listing.id === listingId) ?? null,

  /** Anuncios visibles en la marketplace: activos y no eliminados. */
  publicListings: () => state.db.listings.filter((listing) => listing.status === 'active' && !listing.deletedAt),

  listingsBySeller: (sellerId, { includeDeleted = false } = {}) =>
    state.db.listings.filter((listing) => listing.sellerId === sellerId && (includeDeleted || !listing.deletedAt)),

  /** Pedido de venta abierto (si existe): el artículo aparece como «Reservado». */
  openSaleOrder: (listingId) => openSaleOrder(state.db.orders, listingId),
  confirmedBookings: (listingId) => blockingBookings(state.db.orders, listingId),

  /**
   * Disponibilidad de un anuncio para el usuario actual. Devuelve
   * { available, reason } para poder explicar por qué no se puede comprar.
   */
  availability(listing) {
    if (!listing || listing.deletedAt) return { available: false, reason: 'Este anuncio ha sido eliminado.' };
    if (listing.sellerId === state.currentUserId) return { available: false, reason: 'Es tu anuncio: no puedes comprarlo ni alquilarlo.' };
    if (listing.status !== 'active') return { available: false, reason: 'Este anuncio no está disponible actualmente.' };
    if (listing.operationType === 'sale') {
      const order = openSaleOrder(state.db.orders, listing.id);
      if (order?.buyerId === state.currentUserId) return { available: false, reason: 'Ya tienes un pedido abierto para este artículo.', ownOrder: order };
      if (order) return { available: false, reason: 'Reservado: hay un pedido en curso de otro comprador.' };
    }
    return { available: true, reason: '' };
  },

  isFavorite: (listingId) => state.db.favorites.some((favorite) => favorite.userId === state.currentUserId && favorite.listingId === listingId),
  favoritesOf: (userId) => state.db.favorites.filter((favorite) => favorite.userId === userId),
  favoriteCountFor: (listingId) => state.db.favorites.filter((favorite) => favorite.listingId === listingId).length,

  /** Cambio de precio desde que se guardó en favoritos (derivado del historial de precios). */
  priceChangeSince(listing, sinceIso) {
    const history = listing?.priceHistory ?? [];
    const before = [...history].reverse().find((entry) => entry.date <= sinceIso) ?? history[0];
    if (!before || before.price === listing.price) return null;
    return { from: before.price, to: listing.price, difference: listing.price - before.price };
  },

  order: (orderId) => state.db.orders.find((order) => order.id === orderId) ?? null,
  ordersAsBuyer: (userId) => state.db.orders.filter((order) => order.buyerId === userId),
  ordersAsSeller: (userId) => state.db.orders.filter((order) => order.sellerId === userId),

  reviewsFor: (userId) => state.db.reviews.filter((review) => review.revieweeId === userId),
  reviewForOrder: (orderId) => state.db.reviews.find((review) => review.orderId === orderId) ?? null,
  ratingSummary(userId) {
    const reviews = state.db.reviews.filter((review) => review.revieweeId === userId);
    if (!reviews.length) return { average: null, count: 0 };
    return { average: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length, count: reviews.length };
  },

  /** Conversaciones del usuario, agrupadas a partir de los mensajes. */
  conversationsFor(userId) {
    const groups = new Map();
    state.db.messages
      .filter((message) => message.senderId === userId || message.receiverId === userId)
      .forEach((message) => {
        if (!groups.has(message.conversationId)) groups.set(message.conversationId, []);
        groups.get(message.conversationId).push(message);
      });
    return [...groups.entries()]
      .map(([conversationId, messages]) => {
        const sorted = messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const last = sorted.at(-1);
        const otherUserId = last.senderId === userId ? last.receiverId : last.senderId;
        return {
          id: conversationId,
          listingId: last.listingId,
          otherUserId,
          messages: sorted,
          lastMessage: last,
          unread: sorted.filter((message) => message.receiverId === userId && !message.read).length,
        };
      })
      .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
  },
  unreadCount: (userId) => state.db.messages.filter((message) => message.receiverId === userId && !message.read).length,

  /** Estadísticas del panel de vendedor, calculadas siempre a partir de los datos. */
  sellerStats(userId) {
    const listings = select.listingsBySeller(userId);
    const orders = select.ordersAsSeller(userId);
    const completed = orders.filter((order) => order.status === 'completed');
    const gross = completed.reduce((sum, order) => sum + order.amount, 0);
    const countStatus = (status) => listings.filter((listing) => listing.status === status).length;
    return {
      active: countStatus('active'),
      pendingReview: countStatus('pending_review'),
      sold: countStatus('sold'),
      rented: countStatus('rented'),
      drafts: countStatus('draft'),
      views: listings.reduce((sum, listing) => sum + (listing.views ?? 0), 0),
      favoritesReceived: state.db.favorites.filter((favorite) => listings.some((listing) => listing.id === favorite.listingId)).length,
      pendingOrders: orders.filter((order) => order.status === 'pending').length,
      completedSales: completed.length,
      grossRevenue: gross,
      commission: gross * APP_CONFIG.commissionRate,
      netEstimated: gross * (1 - APP_CONFIG.commissionRate),
    };
  },

  /** Estadísticas del panel de comprador. */
  buyerStats(userId) {
    const orders = select.ordersAsBuyer(userId);
    return {
      activeOrders: orders.filter((order) => order.operationType === 'sale' && OPEN_ORDER_STATUSES.includes(order.status)).length,
      completedPurchases: orders.filter((order) => order.operationType === 'sale' && order.status === 'completed').length,
      activeRentals: orders.filter((order) => order.operationType === 'rent' && ['pending', 'confirmed', 'in_progress'].includes(order.status)).length,
      favorites: select.favoritesOf(userId).length,
      unreadMessages: select.unreadCount(userId),
    };
  },

  /**
   * Búsqueda y filtrado sobre los anuncios públicos.
   * filters: { q, category, vertical, op, min, max, loc, cond, date, sort }
   */
  searchListings(filters = {}) {
    const query = normalizeText(filters.q);
    const location = normalizeText(filters.loc);
    const min = filters.min !== undefined && filters.min !== '' ? Number(filters.min) : null;
    const max = filters.max !== undefined && filters.max !== '' ? Number(filters.max) : null;
    const dateLimits = { '1': 1, '7': 7, '30': 30 };
    const since = dateLimits[filters.date] ? Date.now() - dateLimits[filters.date] * 86_400_000 : null;
    const verticalCategories = filters.vertical ? VERTICALS[filters.vertical]?.categories ?? [] : null;

    const results = select.publicListings().filter((listing) => {
      if (filters.category && listing.category !== filters.category) return false;
      if (verticalCategories && !verticalCategories.includes(listing.category)) return false;
      if (filters.op && listing.operationType !== filters.op) return false;
      if (min !== null && listing.price < min) return false;
      if (max !== null && listing.price > max) return false;
      if (filters.cond && listing.condition !== filters.cond) return false;
      if (since && new Date(listing.createdAt).getTime() < since) return false;
      if (location && !normalizeText(`${listing.location.city} ${listing.location.zone} ${listing.location.postalCode}`).includes(location)) return false;
      if (query) {
        const category = getCategory(listing.category);
        const haystack = normalizeText([listing.title, listing.description, listing.brand, listing.model, category?.name, listing.location.city].join(' '));
        if (!query.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      return true;
    });

    const sorters = {
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
    };
    return results.sort(sorters[filters.sort] ?? sorters.recent);
  },

  /** Recomendaciones sencillas: categorías de tus favoritos, excluyendo lo tuyo y lo ya guardado. */
  recommendations(limit = 4) {
    const userId = state.currentUserId;
    const favoriteIds = new Set(select.favoritesOf(userId).map((favorite) => favorite.listingId));
    const preferredCategories = new Set(state.db.listings.filter((listing) => favoriteIds.has(listing.id)).map((listing) => listing.category));
    const candidates = select.publicListings().filter((listing) => listing.sellerId !== userId && !favoriteIds.has(listing.id));
    return candidates
      .map((listing) => ({ listing, score: (preferredCategories.has(listing.category) ? 1000 : 0) + (listing.views ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.listing);
  },

  reportsBy: (userId) => state.db.reports.filter((report) => report.userId === userId),
  today: () => todayIsoDate(),
};

/* ==========================================================================
   Acciones (escrituras). Todas refrescan el estado al terminar.
   ========================================================================== */

async function run(apiCall) {
  const result = await apiCall();
  await refresh();
  return result;
}

const me = () => state.currentUserId;

export const actions = {
  switchDemoUser: (userId) => run(() => api.switchDemoUser(userId)),
  resetDemoData: () => run(() => api.resetDemoData()),
  updateProfile: (patch) => run(() => api.updateUser(me(), me(), patch)),

  createListing: (data, options) => run(() => api.createListing(me(), data, options)),
  updateListing: (listingId, data, options) => run(() => api.updateListing(me(), listingId, data, options)),
  changeListingPrice: (listingId, price) => run(() => api.changeListingPrice(me(), listingId, price)),
  changeListingStatus: (listingId, status) => run(() => api.changeListingStatus(me(), listingId, status)),
  deleteListing: (listingId) => run(() => api.deleteListing(me(), listingId)),
  registerView: (listingId) => run(() => api.registerView(me(), listingId)),

  toggleFavorite: (listingId) => run(() => api.toggleFavorite(me(), listingId)),

  createOrder: (payload) => run(() => api.createOrder(me(), payload)),
  updateOrderStatus: (orderId, status) => run(() => api.updateOrderStatus(me(), orderId, status)),
  createReview: (payload) => run(() => api.createReview(me(), payload)),

  sendMessage: (payload) => run(() => api.sendMessage(me(), payload)),
  markConversationRead: (conversationId) => run(() => api.markConversationRead(me(), conversationId)),

  createReport: (payload) => run(() => api.createReport(me(), payload)),
};
