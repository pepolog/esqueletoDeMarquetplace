/**
 * buyer.js
 * ---------------------------------------------------------------------------
 * Panel de comprador: resumen, pedidos, alquileres, favoritos y mensajes.
 * Incluye también el diálogo para iniciar una compra o solicitud de alquiler
 * (modo demostración: no se procesa ningún pago).
 */

import { bookingsOverlap, computeRentalUnits } from './api.js';
import { CATEGORIES, DELIVERY_METHODS, getCategory, ORDER_STATUS, RENTAL_PERIODS } from './data.js';
import { icon } from './icons.js';
import { bindOrderDetailButtons, orderList } from './orders.js';
import { actions, select } from './store.js';
import {
  avatar, emptyState, filterTabs, handleError, listingCard, listingMini, navigate, notice, openModal, panelSidebar, priceLabel,
  qs, qsa, sectionHeader, showFormErrors, statCard, toast, withBusy,
} from './ui.js';
import { escapeHtml, formatDate, formatMoney, timeAgo, toIsoDate, todayIsoDate } from './utils.js';

/* ==========================================================================
   Estructura del panel
   ========================================================================== */

const SECTIONS = {
  overview: { label: 'Resumen', icon: 'grid', render: renderOverview },
  orders: { label: 'Mis pedidos', icon: 'bag', render: renderOrders },
  rentals: { label: 'Mis alquileres', icon: 'key', render: renderRentals },
  favorites: { label: 'Favoritos', icon: 'heart', render: renderFavorites },
  messages: { label: 'Mensajes', icon: 'message', render: renderMessages },
};

/** Dibuja el panel de comprador con su menú lateral y la sección elegida. */
export function renderBuyerPanel(container, sectionId, params) {
  const section = SECTIONS[sectionId] ? sectionId : 'overview';
  const userId = select.currentUserId();
  const sidebarItems = () => Object.entries(SECTIONS).map(([id, info]) => ({
    id, label: info.label, icon: info.icon, href: `#/buyer/${id}`,
    count: id === 'messages' ? select.unreadCount(userId) : undefined,
  }));
  container.innerHTML = `
    <div class="container panel-layout">
      <aside class="panel-layout__aside" data-sidebar></aside>
      <section class="panel-layout__content" data-content></section>
    </div>`;
  const paintSidebar = () => {
    qs('[data-sidebar]', container).innerHTML = panelSidebar({ title: 'Panel de comprador', items: sidebarItems(), activeId: section, ariaLabel: 'Secciones del panel de comprador' });
  };
  paintSidebar();
  const view = SECTIONS[section].render(qs('[data-content]', container), params) ?? {};
  return {
    update: () => { paintSidebar(); view.update?.(); },
    destroy: () => view.destroy?.(),
  };
}

/* ==========================================================================
   Resumen
   ========================================================================== */

function renderOverview(container) {
  const paint = () => {
    const userId = select.currentUserId();
    const stats = select.buyerStats(userId);
    const movements = select.ordersAsBuyer(userId)
      .flatMap((order) => order.statusHistory.map((entry) => ({ order, entry })))
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
      .slice(0, 6);

    container.innerHTML = `
      ${sectionHeader('Resumen del comprador', 'Tu actividad de compras y alquileres de un vistazo.')}
      <div class="stat-grid">
        ${statCard({ label: 'Pedidos activos', value: stats.activeOrders, iconName: 'bag', href: '#/buyer/orders' })}
        ${statCard({ label: 'Compras completadas', value: stats.completedPurchases, iconName: 'check', tone: 'success', href: '#/buyer/orders?status=completed' })}
        ${statCard({ label: 'Alquileres activos', value: stats.activeRentals, iconName: 'key', tone: 'accent', href: '#/buyer/rentals' })}
        ${statCard({ label: 'Favoritos', value: stats.favorites, iconName: 'heart', tone: 'danger', href: '#/buyer/favorites' })}
        ${statCard({ label: 'Mensajes sin leer', value: stats.unreadMessages, iconName: 'message', tone: 'info', href: '#/buyer/messages' })}
      </div>
      <section class="card panel-card">
        <h2>Últimos movimientos</h2>
        ${movements.length ? `<ul class="activity-list">${movements.map(({ order, entry }) => {
          const listing = select.listing(order.listingId);
          return `<li>${icon(order.operationType === 'rent' ? 'key' : 'bag')}<div><strong>${escapeHtml(ORDER_STATUS[order.operationType][entry.status]?.label)}</strong> · ${escapeHtml(listing?.title ?? 'Anuncio')}<br /><small class="muted">${escapeHtml(order.id)} · ${timeAgo(entry.date)}</small></div><button type="button" class="btn btn--ghost btn--sm" data-order-detail="${escapeHtml(order.id)}">Ver</button></li>`;
        }).join('')}</ul>` : emptyState({ iconName: 'bag', title: 'Aún no has comprado nada', action: '<a href="#/explore" class="btn btn--primary">Explorar anuncios</a>' })}
      </section>`;
    bindOrderDetailButtons(container);
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Mis pedidos (compras)
   ========================================================================== */

const ORDER_FILTERS = [
  { id: 'all', label: 'Todos', match: () => true },
  { id: 'pending', label: 'Pendientes', match: (order) => order.status === 'pending' },
  { id: 'accepted', label: 'Aceptados', match: (order) => ['accepted', 'preparing', 'confirmed'].includes(order.status) },
  { id: 'shipped', label: 'Enviados / en curso', match: (order) => ['shipped', 'in_progress'].includes(order.status) },
  { id: 'completed', label: 'Completados', match: (order) => order.status === 'completed' },
  { id: 'cancelled', label: 'Cancelados', match: (order) => order.status === 'cancelled' },
  { id: 'disputed', label: 'Incidencias', match: (order) => order.status === 'disputed' },
];

function renderOrders(container, params) {
  let filter = ORDER_FILTERS.some((item) => item.id === params.get('status')) ? params.get('status') : 'all';
  const paint = () => {
    const orders = select.ordersAsBuyer(select.currentUserId()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tabs = ORDER_FILTERS.map((item) => ({ ...item, count: orders.filter(item.match).length }));
    const visible = orders.filter(ORDER_FILTERS.find((item) => item.id === filter).match);
    container.innerHTML = `
      ${sectionHeader('Mis pedidos', 'Compras y solicitudes de alquiler que has realizado.')}
      ${filterTabs(tabs, filter, 'Filtrar pedidos por estado')}
      ${orderList(visible, { iconName: 'bag', title: 'No hay pedidos en este estado', action: '<a href="#/explore" class="btn btn--primary">Explorar anuncios</a>' })}`;
    qsa('[data-filter]', container).forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter; paint(); }));
    bindOrderDetailButtons(container);
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Mis alquileres
   ========================================================================== */

function rentalCard(order) {
  const listing = select.listing(order.listingId);
  const seller = select.user(order.sellerId);
  return `
    <li class="rental-card card">
      ${listingMini(listing)}
      <div class="rental-card__dates">
        <span>${icon('calendar', 'icon--xs')}<strong>${formatDate(order.startDate)}</strong> → <strong>${formatDate(order.endDate)}</strong></span>
        <span class="muted">${escapeHtml(seller?.displayName ?? '')}</span>
      </div>
      <dl class="rental-card__facts">
        <div><dt>Importe</dt><dd>${formatMoney(order.amount)}</dd></div>
        <div><dt>Fianza</dt><dd>${listing?.attributes?.deposit ? formatMoney(listing.attributes.deposit) : 'No indicada'}</dd></div>
        <div><dt>Entrega</dt><dd>${escapeHtml(DELIVERY_METHODS[order.delivery?.method]?.label ?? '—')}</dd></div>
      </dl>
      ${listing?.attributes?.pickupReturnConditions ? `<p class="small muted">${icon('info', 'icon--xs')}${escapeHtml(listing.attributes.pickupReturnConditions)}</p>` : ''}
      <div class="rental-card__footer">
        ${ORDER_STATUS.rent[order.status] ? `<span class="badge badge--${ORDER_STATUS.rent[order.status].tone}">${escapeHtml(ORDER_STATUS.rent[order.status].label)}</span>` : ''}
        <button type="button" class="btn btn--ghost btn--sm" data-order-detail="${escapeHtml(order.id)}">Ver detalle</button>
      </div>
    </li>`;
}

function renderRentals(container) {
  const paint = () => {
    const today = todayIsoDate();
    const rentals = select.ordersAsBuyer(select.currentUserId()).filter((order) => order.operationType === 'rent');
    const isClosed = (order) => ['completed', 'cancelled'].includes(order.status);
    const current = rentals.filter((order) => !isClosed(order) && (order.status === 'in_progress' || (order.status === 'confirmed' && order.startDate <= today && order.endDate >= today)));
    const upcoming = rentals.filter((order) => !isClosed(order) && !current.includes(order) && order.endDate >= today);
    const history = rentals.filter((order) => !current.includes(order) && !upcoming.includes(order));
    const group = (title, list, emptyText) => `
      <section class="panel-card">
        <h2>${escapeHtml(title)} <span class="count-pill">${list.length}</span></h2>
        ${list.length ? `<ul class="rental-list">${list.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(rentalCard).join('')}</ul>` : `<p class="muted">${escapeHtml(emptyText)}</p>`}
      </section>`;
    container.innerHTML = `
      ${sectionHeader('Mis alquileres', 'Reservas actuales, próximas e historial.', '<a href="#/rentals" class="btn btn--ghost">Buscar alquileres</a>')}
      ${group('Alquileres actuales', current, 'No tienes ningún alquiler en curso.')}
      ${group('Próximos alquileres y solicitudes', upcoming, 'No tienes reservas próximas.')}
      ${group('Historial', history, 'Todavía no hay alquileres finalizados.')}`;
    bindOrderDetailButtons(container);
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Favoritos
   ========================================================================== */

function renderFavorites(container, params) {
  let categoryFilter = params.get('category') ?? '';
  const paint = () => {
    const favorites = select.favoritesOf(select.currentUserId())
      .map((favorite) => ({ favorite, listing: select.listing(favorite.listingId) }))
      .filter(({ listing }) => listing && !listing.deletedAt)
      .sort((a, b) => b.favorite.createdAt.localeCompare(a.favorite.createdAt));
    const visible = favorites.filter(({ listing }) => !categoryFilter || listing.category === categoryFilter);
    const priceChanges = favorites.filter(({ favorite, listing }) => select.priceChangeSince(listing, favorite.createdAt)).length;
    container.innerHTML = `
      ${sectionHeader('Favoritos', 'Los anuncios que has guardado. Te avisamos si cambian de precio.')}
      <div class="toolbar">
        <div class="field field--inline">
          <label for="fav-category" class="field__label">Categoría</label>
          <select id="fav-category"><option value="">Todas</option>${CATEGORIES.map((category) => `<option value="${category.id}" ${category.id === categoryFilter ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select>
        </div>
        ${priceChanges ? `<span class="badge badge--info">${icon('tag')}${priceChanges} ${priceChanges === 1 ? 'anuncio ha cambiado' : 'anuncios han cambiado'} de precio</span>` : ''}
      </div>
      ${visible.length
        ? `<div class="listing-grid">${visible.map(({ favorite, listing }) => listingCard(listing, { showPriceChangeSince: favorite.createdAt })).join('')}</div>`
        : emptyState({ iconName: 'heart', title: favorites.length ? 'No hay favoritos en esta categoría' : 'Aún no tienes favoritos', text: 'Pulsa el corazón de cualquier anuncio para guardarlo aquí.', action: '<a href="#/explore" class="btn btn--primary">Explorar anuncios</a>' })}`;
    qs('#fav-category', container).addEventListener('change', (event) => { categoryFilter = event.target.value; paint(); qs('#fav-category', container).focus(); });
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Mensajes
   --------------------------------------------------------------------------
   ⚠️ Mensajería local: los mensajes solo existen en este navegador. Para que
   lleguen a otra persona hace falta un backend con mensajería en tiempo real.
   Cambiando de cuenta de demostración puedes "responder" como el otro usuario.
   ========================================================================== */

function renderMessages(container, params) {
  const userId = select.currentUserId();
  let selectedId = params.get('c');
  let draftTarget = null; // conversación nueva (aún sin mensajes)

  if (params.get('listing') && params.get('with')) {
    const listing = select.listing(params.get('listing'));
    const otherId = params.get('with');
    if (listing && otherId !== userId && select.user(otherId)) {
      const buyerId = listing.sellerId === userId ? otherId : userId;
      selectedId = `conv_${listing.id}_${buyerId}`;
      draftTarget = { conversationId: selectedId, listingId: listing.id, otherUserId: otherId };
    }
  }

  const paint = () => {
    const previousDraft = qs('#message-input', container)?.value ?? '';
    const conversations = select.conversationsFor(userId);
    let selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
    if (!selected && draftTarget?.conversationId === selectedId) {
      selected = { ...draftTarget, id: draftTarget.conversationId, messages: [], lastMessage: null, unread: 0, isNew: true };
    }
    const listItems = selected?.isNew ? [selected, ...conversations] : conversations;

    container.innerHTML = `
      ${sectionHeader('Mensajes', 'Conversaciones con compradores y vendedores.')}
      ${notice('Mensajería de demostración: los mensajes se guardan solo en este navegador. La mensajería real entre usuarios requiere backend. Cambia de cuenta de demostración para responder como la otra persona.')}
      <div class="messenger card ${selected ? 'has-selection' : ''}">
        <div class="messenger__list" role="list" aria-label="Conversaciones">
          ${listItems.length ? listItems.map((conversation) => {
            const listing = select.listing(conversation.listingId);
            const other = select.user(conversation.otherUserId);
            const image = listing?.images?.[0];
            return `
              <button type="button" role="listitem" class="conversation ${conversation.id === selected?.id ? 'is-active' : ''} ${conversation.unread ? 'is-unread' : ''}" data-conversation="${escapeHtml(conversation.id)}" ${conversation.id === selected?.id ? 'aria-current="true"' : ''}>
                ${image ? `<img class="conversation__img" src="${escapeHtml(image.src)}" alt="" />` : `<span class="conversation__img">${icon('image')}</span>`}
                <span class="conversation__body">
                  <span class="conversation__top"><strong>${escapeHtml(other?.displayName ?? 'Usuario')}</strong><small>${conversation.lastMessage ? timeAgo(conversation.lastMessage.createdAt) : 'Nuevo'}</small></span>
                  <span class="conversation__listing">${escapeHtml(listing?.title ?? '')}</span>
                  <span class="conversation__last">${conversation.lastMessage ? `${conversation.lastMessage.senderId === userId ? 'Tú: ' : ''}${escapeHtml(conversation.lastMessage.content)}` : 'Escribe el primer mensaje'}</span>
                </span>
                ${conversation.unread ? `<span class="count-pill" aria-label="${conversation.unread} sin leer">${conversation.unread}</span>` : ''}
              </button>`;
          }).join('') : emptyState({ iconName: 'message', title: 'No tienes conversaciones', text: 'Contacta con un vendedor desde cualquier anuncio.' })}
        </div>
        <div class="messenger__thread">
          ${selected ? renderThread(selected, userId) : `<div class="messenger__placeholder">${icon('message')}<p>Selecciona una conversación</p></div>`}
        </div>
      </div>`;

    qsa('[data-conversation]', container).forEach((button) => button.addEventListener('click', () => {
      selectedId = button.dataset.conversation;
      history.replaceState(null, '', `#/buyer/messages?c=${encodeURIComponent(selectedId)}`);
      paint();
      qs('#message-input', container)?.focus();
    }));
    qs('[data-back]', container)?.addEventListener('click', () => { selectedId = null; paint(); });

    const form = qs('#message-form', container);
    if (form) {
      const input = qs('#message-input', container);
      input.value = previousDraft && selected ? previousDraft : '';
      const thread = qs('.thread__messages', container);
      if (thread) thread.scrollTop = thread.scrollHeight;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const content = input.value.trim();
        if (!content) { input.focus(); return; }
        await withBusy(qs('button[type="submit"]', form), async () => {
          try {
            input.value = '';
            await actions.sendMessage({ listingId: selected.listingId, receiverId: selected.otherUserId, content });
            draftTarget = null;
            qs('#message-input', container)?.focus();
          } catch (error) {
            input.value = content;
            handleError(error);
          }
        });
      });
    }

    // Marcar como leídos los mensajes recibidos de la conversación abierta.
    if (selected && selected.unread > 0) actions.markConversationRead(selected.id).catch(handleError);
  };

  paint();
  return { update: paint };
}

function renderThread(conversation, userId) {
  const listing = select.listing(conversation.listingId);
  const other = select.user(conversation.otherUserId);
  const allowsMessages = other?.preferences?.privacy?.allowMessagesFrom !== 'nobody' || !conversation.isNew;
  return `
    <header class="thread__header">
      <button type="button" class="icon-btn thread__back" data-back aria-label="Volver a la lista">${icon('arrowLeft')}</button>
      ${avatar(other, 'sm')}
      <div>
        <strong>${escapeHtml(other?.displayName ?? 'Usuario')}</strong>
        <small class="muted">${listing ? `Sobre: <a href="#/listing/${listing.id}">${escapeHtml(listing.title)}</a>` : ''}</small>
      </div>
    </header>
    <ol class="thread__messages" aria-live="polite">
      ${conversation.messages.length ? conversation.messages.map((message) => `
        <li class="bubble ${message.senderId === userId ? 'bubble--mine' : ''}">
          <p>${escapeHtml(message.content)}</p>
          <small>${timeAgo(message.createdAt)}${message.senderId === userId ? ` · ${message.read ? 'Leído' : 'Enviado'}` : ''}</small>
        </li>`).join('') : '<li class="muted thread__empty">Aún no hay mensajes. Preséntate y pregunta lo que necesites.</li>'}
    </ol>
    ${allowsMessages ? `
      <form id="message-form" class="thread__composer">
        <label for="message-input" class="visually-hidden">Escribe un mensaje</label>
        <textarea id="message-input" rows="2" maxlength="1000" placeholder="Escribe un mensaje…"></textarea>
        <button type="submit" class="btn btn--primary" aria-label="Enviar mensaje">${icon('send')}<span class="hide-sm">Enviar</span></button>
      </form>` : notice('Este usuario no acepta mensajes nuevos.', 'warning')}`;
}

/* ==========================================================================
   Diálogo de compra / solicitud de alquiler
   ========================================================================== */

/**
 * Abre el formulario para iniciar una compra o una reserva de alquiler.
 * Valida en el cliente para dar mensajes inmediatos; la API vuelve a
 * comprobar todas las reglas (propio anuncio, duplicados, solapes…).
 */
export function openPurchaseDialog(listing) {
  const isRent = listing.operationType === 'rent';
  const period = RENTAL_PERIODS[listing.rental?.period];
  const useDateTime = isRent && listing.rental.period === 'hour';
  const inputType = useDateTime ? 'datetime-local' : 'date';
  const minValue = useDateTime ? `${todayIsoDate()}T00:00` : todayIsoDate();
  const deliveryOptions = Object.entries(DELIVERY_METHODS).filter(([key]) => listing.delivery?.[key]);
  const bookings = isRent ? select.confirmedBookings(listing.id) : [];
  const category = getCategory(listing.category);
  const defaultStart = new Date(Date.now() + 86_400_000);
  const defaultEnd = new Date(Date.now() + 86_400_000 * (1 + (listing.rental?.period === 'month' ? 30 : listing.rental?.period === 'week' ? 7 : (listing.rental?.minDuration ?? 1))));

  const { element, close } = openModal({
    title: isRent ? 'Solicitar alquiler' : 'Confirmar pedido',
    size: 'md',
    body: `
      <form id="purchase-form" novalidate>
        <div class="purchase-summary">
          ${listingMini(listing)}
          <span class="purchase-summary__price">${priceLabel(listing)}</span>
        </div>
        ${isRent ? `
          <fieldset class="fieldset">
            <legend>Fechas del alquiler</legend>
            <div class="field-row">
              <div class="field"><label class="field__label" for="f-startDate">Inicio <span class="req" aria-hidden="true">*</span></label>
                <input id="f-startDate" name="startDate" type="${inputType}" min="${minValue}" required value="${useDateTime ? '' : toIsoDate(defaultStart)}" /></div>
              <div class="field"><label class="field__label" for="f-endDate">Fin <span class="req" aria-hidden="true">*</span></label>
                <input id="f-endDate" name="endDate" type="${inputType}" min="${minValue}" required value="${useDateTime ? '' : toIsoDate(defaultEnd)}" /></div>
            </div>
            <p class="field__help">Periodicidad: ${escapeHtml(period?.label ?? '')} · mínimo ${listing.rental.minDuration} ${escapeHtml(listing.rental.minDuration === 1 ? period?.unit : period?.unitPlural)}${listing.rental.maxDuration ? ` · máximo ${listing.rental.maxDuration} ${escapeHtml(period?.unitPlural)}` : ''}.</p>
            ${bookings.length ? `<p class="field__help">${icon('calendar', 'icon--xs')}Fechas no disponibles: ${bookings.map((booking) => `${formatDate(booking.startDate)} → ${formatDate(booking.endDate)}`).join('; ')}</p>` : ''}
          </fieldset>` : ''}
        <fieldset class="fieldset">
          <legend>Modalidad de entrega</legend>
          <div class="radio-list">
            ${deliveryOptions.map(([key, method], index) => `
              <label class="radio-card"><input type="radio" name="deliveryMethod" value="${key}" ${index === 0 ? 'checked' : ''} />${icon(method.icon)}<span>${escapeHtml(method.label)}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="field">
          <label class="field__label" for="f-notes">Mensaje para el vendedor (opcional)</label>
          <textarea id="f-notes" name="notes" rows="2" maxlength="300" placeholder="${isRent ? 'Hora de recogida, dudas…' : 'Preferencias de entrega, dudas…'}"></textarea>
        </div>
        <div class="purchase-total" aria-live="polite" data-total></div>
        ${isRent && listing.attributes?.deposit ? `<p class="muted small">Fianza: ${formatMoney(listing.attributes.deposit)} (se gestiona aparte, no se incluye en el importe).</p>` : ''}
        ${category.rentNote && isRent ? `<p class="muted small">${escapeHtml(category.rentNote)}</p>` : ''}
        ${notice('Demostración: no se realizará ningún cobro. El pedido se registra solo en este navegador y queda pendiente de que el vendedor lo acepte.')}
        <div class="form-error" role="alert" data-form-error hidden></div>
      </form>`,
    footer: `<button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button>
      <button type="submit" form="purchase-form" class="btn btn--primary">${isRent ? 'Enviar solicitud' : 'Confirmar pedido'}</button>`,
  });

  const form = qs('#purchase-form', element);
  const totalElement = qs('[data-total]', element);
  const formError = qs('[data-form-error]', element);

  /** Calcula el importe y valida las fechas (sin llamar a la API). */
  const evaluate = () => {
    if (!isRent) return { errors: {}, amount: listing.price };
    const startDate = form.elements.startDate.value;
    const endDate = form.elements.endDate.value;
    const errors = {};
    if (!startDate) errors.startDate = 'Indica la fecha de inicio.';
    if (!endDate) errors.endDate = 'Indica la fecha de fin.';
    if (startDate && startDate < minValue) errors.startDate = 'La fecha de inicio no puede estar en el pasado.';
    if (startDate && endDate && endDate < startDate) errors.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
    const units = Object.keys(errors).length ? 0 : computeRentalUnits(listing.rental.period, startDate, endDate);
    if (units) {
      if (units < listing.rental.minDuration) errors.endDate = `La duración mínima es de ${listing.rental.minDuration} ${listing.rental.minDuration === 1 ? period.unit : period.unitPlural}.`;
      else if (listing.rental.maxDuration && units > listing.rental.maxDuration) errors.endDate = `La duración máxima es de ${listing.rental.maxDuration} ${period.unitPlural}.`;
      else if (bookings.some((booking) => bookingsOverlap(booking, { startDate, endDate }))) errors.startDate = 'Las fechas se solapan con una reserva confirmada.';
    }
    return { errors, units, amount: units * listing.price };
  };

  const paintTotal = () => {
    const { units, amount, errors } = evaluate();
    if (!isRent) {
      totalElement.innerHTML = `<span>Total</span><strong>${formatMoney(amount)}</strong>`;
    } else if (units && !Object.keys(errors).length) {
      totalElement.innerHTML = `<span>${units} ${units === 1 ? period.unit : period.unitPlural} × ${formatMoney(listing.price)}</span><strong>${formatMoney(amount)}</strong>`;
    } else {
      totalElement.innerHTML = '<span class="muted">Selecciona fechas válidas para calcular el importe.</span>';
    }
  };
  form.addEventListener('input', paintTotal);
  paintTotal();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;
    const { errors } = evaluate();
    if (!showFormErrors(form, errors)) return;
    const values = Object.fromEntries(new FormData(form).entries());
    await withBusy(qs('button[type="submit"]', element), async () => {
      try {
        const order = await actions.createOrder({ listingId: listing.id, startDate: values.startDate || null, endDate: values.endDate || null, deliveryMethod: values.deliveryMethod, notes: values.notes });
        close();
        toast(isRent ? `Solicitud ${order.id} enviada. El vendedor debe confirmarla.` : `Pedido ${order.id} creado. Lo verás en «Mis pedidos».`);
        navigate(isRent ? '#/buyer/rentals' : '#/buyer/orders');
      } catch (error) {
        formError.textContent = error.message ?? 'No se pudo crear el pedido.';
        formError.hidden = false;
        if (!(error?.name === 'ApiError')) console.error(error);
      }
    });
  });
}
