/**
 * seller.js
 * ---------------------------------------------------------------------------
 * Panel de vendedor: resumen con estadísticas, gestión de «Mis anuncios»,
 * creación/edición (delegada en wizard.js), pedidos recibidos, ventas e
 * ingresos y valoraciones.
 *
 * Todas las cifras se calculan a partir de los datos almacenados (store.js);
 * no hay estadísticas inventadas ni dinero real.
 */

import { APP_CONFIG, getCategory, LISTING_STATUS, ORDER_STATUS, RENTAL_PERIODS } from './data.js';
import { icon } from './icons.js';
import { bindOrderDetailButtons, orderList } from './orders.js';
import { actions, select } from './store.js';
import {
  avatar, backendBadge, badge, confirmDialog, emptyState, filterTabs, handleError, listingMini, listingStatusBadge, notice, openModal,
  orderStatusBadge, panelSidebar, priceLabel, qs, qsa, renderField, sectionHeader, showFormErrors, stars, statCard, toast, withBusy,
} from './ui.js';
import { escapeHtml, formatDate, formatMoney, replaceHash, timeAgo } from './utils.js';
import { renderListingWizard } from './wizard.js';

const SECTIONS = {
  overview: { label: 'Resumen', icon: 'grid', render: renderOverview },
  listings: { label: 'Mis anuncios', icon: 'tag', render: renderMyListings },
  new: { label: 'Crear anuncio', icon: 'plus', render: (container) => renderListingWizard(container) },
  orders: { label: 'Pedidos recibidos', icon: 'box', render: renderReceivedOrders },
  revenue: { label: 'Ventas e ingresos', icon: 'euro', render: renderRevenue },
  reviews: { label: 'Valoraciones', icon: 'star', render: renderReviews },
};

/** Dibuja el panel de vendedor. `section` puede ser también «edit» con el id del anuncio. */
export function renderSellerPanel(container, section, listingId, params) {
  const sectionId = section === 'edit' ? 'edit' : SECTIONS[section] ? section : 'overview';
  const sidebarItems = () => {
    const stats = select.sellerStats(select.currentUserId());
    return Object.entries(SECTIONS).map(([id, info]) => ({
      id, label: info.label, icon: info.icon, href: `#/seller/${id}`,
      count: id === 'orders' ? stats.pendingOrders : undefined,
    }));
  };
  container.innerHTML = `
    <div class="container panel-layout">
      <aside class="panel-layout__aside" data-sidebar></aside>
      <section class="panel-layout__content" data-content></section>
    </div>`;
  const paintSidebar = () => {
    qs('[data-sidebar]', container).innerHTML = panelSidebar({ title: 'Panel de vendedor', items: sidebarItems(), activeId: sectionId === 'edit' ? 'listings' : sectionId, ariaLabel: 'Secciones del panel de vendedor' });
  };
  paintSidebar();
  const content = qs('[data-content]', container);
  const view = (sectionId === 'edit' ? renderListingWizard(content, { listingId }) : SECTIONS[sectionId].render(content, params)) ?? {};
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
    const stats = select.sellerStats(userId);
    const pending = select.ordersAsSeller(userId).filter((order) => order.status === 'pending').slice(0, 4);
    container.innerHTML = `
      ${sectionHeader('Resumen del vendedor', 'Indicadores calculados a partir de tus anuncios y pedidos de prueba.', `<a href="#/seller/new" class="btn btn--accent">${icon('plus')}Crear anuncio</a>`)}
      <div class="stat-grid">
        ${statCard({ label: 'Anuncios activos', value: stats.active, iconName: 'tag', href: '#/seller/listings?status=active' })}
        ${statCard({ label: 'Pendientes de revisión', value: stats.pendingReview, iconName: 'clock', tone: 'warning', href: '#/seller/listings?status=pending_review' })}
        ${statCard({ label: 'Vendidos', value: stats.sold, iconName: 'check', tone: 'success', href: '#/seller/listings?status=sold' })}
        ${statCard({ label: 'Alquilados', value: stats.rented, iconName: 'key', tone: 'accent', href: '#/seller/listings?status=rented' })}
        ${statCard({ label: 'Visitas', value: stats.views.toLocaleString('es-ES'), iconName: 'eye', tone: 'info', hint: 'Contadas en este navegador' })}
        ${statCard({ label: 'Favoritos recibidos', value: stats.favoritesReceived, iconName: 'heart', tone: 'danger' })}
        ${statCard({ label: 'Pedidos pendientes', value: stats.pendingOrders, iconName: 'box', tone: 'warning', href: '#/seller/orders?status=pending' })}
        ${statCard({ label: 'Ventas completadas', value: stats.completedSales, iconName: 'bag', tone: 'success', href: '#/seller/revenue' })}
        ${statCard({ label: 'Ingresos brutos registrados', value: formatMoney(stats.grossRevenue), iconName: 'euro', hint: 'Operaciones de prueba, sin cobros reales', href: '#/seller/revenue' })}
      </div>
      <section class="card panel-card">
        <div class="panel-card__header"><h2>Pedidos que requieren tu atención</h2><a href="#/seller/orders" class="link-arrow">Ver todos ${icon('chevronRight', 'icon--xs')}</a></div>
        ${orderList(pending, { iconName: 'box', title: 'No tienes pedidos pendientes', text: 'Cuando alguien compre o reserve uno de tus anuncios aparecerá aquí.' })}
      </section>`;
    bindOrderDetailButtons(container);
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Mis anuncios
   ========================================================================== */

const LISTING_FILTERS = ['all', 'draft', 'pending_review', 'active', 'paused', 'sold', 'rented', 'finished'];

function renderMyListings(container, params) {
  let filter = LISTING_FILTERS.includes(params.get('status')) ? params.get('status') : 'all';

  const paint = () => {
    const userId = select.currentUserId();
    const listings = select.listingsBySeller(userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const tabs = LISTING_FILTERS.map((id) => ({
      id,
      label: id === 'all' ? 'Todos' : id === 'draft' ? 'Borradores' : id === 'pending_review' ? 'Pendientes de revisión' : `${LISTING_STATUS[id].label}s`,
      count: id === 'all' ? listings.length : listings.filter((listing) => listing.status === id).length,
    }));
    const visible = filter === 'all' ? listings : listings.filter((listing) => listing.status === filter);

    container.innerHTML = `
      ${sectionHeader('Mis anuncios', 'Gestiona tus publicaciones: edita, cambia el precio, pausa o marca como vendido.', `<a href="#/seller/new" class="btn btn--accent">${icon('plus')}Crear anuncio</a>`)}
      ${filterTabs(tabs, filter, 'Filtrar anuncios por estado')}
      ${visible.length ? `<ul class="manage-list">${visible.map(manageRow).join('')}</ul>` : emptyState({ iconName: 'tag', title: filter === 'all' ? 'Todavía no has publicado nada' : 'No hay anuncios en este estado', action: '<a href="#/seller/new" class="btn btn--primary">Crear un anuncio</a>' })}`;

    qsa('[data-filter]', container).forEach((button) => button.addEventListener('click', () => {
      filter = button.dataset.filter;
      replaceHash(`#/seller/listings${filter === 'all' ? '' : `?status=${filter}`}`);
      paint();
      qs(`[data-filter="${filter}"]`, container)?.focus();
    }));
    qsa('[data-listing-action]', container).forEach((button) => button.addEventListener('click', () => handleListingAction(button)));
  };
  paint();
  return { update: paint };
}

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Fila de gestión de un anuncio con las acciones válidas según su estado. */
function manageRow(listing) {
  const category = getCategory(listing.category);
  const orders = select.ordersAsSeller(listing.sellerId).filter((order) => order.listingId === listing.id);
  const openOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const image = listing.images?.[0];
  const button = (action, label, iconName, extra = '') => `<button type="button" class="btn btn--ghost btn--sm ${extra}" data-listing-action="${action}" data-listing-id="${listing.id}">${icon(iconName)}${label}</button>`;
  const actionsByStatus = {
    draft: [button('edit', 'Continuar', 'edit')],
    pending_review: [button('view', 'Ver', 'eye'), button('edit', 'Editar', 'edit'), button('pause', 'Pausar', 'pause')],
    active: [button('view', 'Ver', 'eye'), button('edit', 'Editar', 'edit'), button('price', 'Cambiar precio', 'euro'), button('pause', 'Pausar', 'pause'),
      listing.operationType === 'sale' ? button('sold', 'Marcar vendido', 'check') : button('rented', 'Marcar alquilado', 'key')],
    paused: [button('view', 'Ver', 'eye'), button('edit', 'Editar', 'edit'), button('price', 'Cambiar precio', 'euro'), button('activate', 'Reactivar', 'play')],
    // Un artículo con una venta completada no puede volver a ofertarse (la API también lo impide).
    sold: [button('view', 'Ver', 'eye'), ...(orders.some((order) => order.status === 'completed') ? [] : [button('activate', 'Reactivar', 'play')])],
    rented: [button('view', 'Ver', 'eye'), button('activate', 'Volver a ofertar', 'play'), button('finish', 'Finalizar', 'x')],
    finished: [button('view', 'Ver', 'eye'), button('activate', 'Reactivar', 'play')],
  };
  return `
    <li class="manage-row card">
      <div class="manage-row__media">${image ? `<img src="${escapeHtml(image.src)}" alt="" />` : `<span class="listing-mini__noimg">${icon('image')}</span>`}</div>
      <div class="manage-row__body">
        <div class="manage-row__top">
          <h3>${listing.status === 'draft' ? escapeHtml(listing.title) : `<a href="#/listing/${listing.id}">${escapeHtml(listing.title)}</a>`}</h3>
          ${listingStatusBadge(listing.status)}
        </div>
        <p class="manage-row__price">${listing.price ? priceLabel(listing) : '<span class="muted">Sin precio</span>'}</p>
        <p class="manage-row__meta muted">
          ${escapeHtml(category?.name ?? '')} · ${listing.operationType === 'rent' ? 'Alquiler' : 'Venta'} · Actualizado ${timeAgo(listing.updatedAt)}
        </p>
        <p class="manage-row__stats">
          <span>${icon('eye', 'icon--xs')}${plural(listing.views ?? 0, 'visita', 'visitas')}</span>
          <span>${icon('heart', 'icon--xs')}${plural(select.favoriteCountFor(listing.id), 'favorito', 'favoritos')}</span>
          <span>${icon('box', 'icon--xs')}${plural(orders.length, 'pedido', 'pedidos')}${openOrders ? ` (${plural(openOrders, 'abierto', 'abiertos')})` : ''}</span>
        </p>
        <div class="manage-row__actions">
          ${(actionsByStatus[listing.status] ?? []).join('')}
          ${button('delete', 'Eliminar', 'trash', 'btn--danger-ghost')}
        </div>
      </div>
    </li>`;
}

/** Ejecuta la acción elegida sobre un anuncio (con confirmación cuando procede). */
async function handleListingAction(button) {
  const listing = select.listing(button.dataset.listingId);
  if (!listing) return;
  const action = button.dataset.listingAction;
  const statusChange = async (status, message) => withBusy(button, async () => {
    try {
      await actions.changeListingStatus(listing.id, status);
      toast(message);
    } catch (error) { handleError(error); }
  });

  switch (action) {
    case 'view': location.hash = `#/listing/${listing.id}`; break;
    case 'edit': location.hash = `#/seller/edit/${listing.id}`; break;
    case 'price': openPriceDialog(listing); break;
    case 'pause': await statusChange('paused', 'Anuncio pausado: ya no aparece en la marketplace.'); break;
    case 'activate': await statusChange('active', 'Anuncio activo de nuevo.'); break;
    case 'finish': await statusChange('finished', 'Anuncio finalizado.'); break;
    case 'sold':
    case 'rented': {
      const ok = await confirmDialog({
        title: action === 'sold' ? 'Marcar como vendido' : 'Marcar como alquilado',
        message: 'Modo demostración: el anuncio dejará de mostrarse en la marketplace. No se crea ningún pedido ni se registra ningún pago.',
        confirmLabel: action === 'sold' ? 'Marcar vendido' : 'Marcar alquilado',
      });
      if (ok) await statusChange(action, action === 'sold' ? 'Anuncio marcado como vendido.' : 'Anuncio marcado como alquilado.');
      break;
    }
    case 'delete': {
      const ok = await confirmDialog({
        title: 'Eliminar anuncio',
        message: `Se eliminará «${listing.title}» de la marketplace y de los favoritos de otros usuarios. Los pedidos y reservas históricos asociados se conservan. Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      try {
        await actions.deleteListing(listing.id);
        toast('Anuncio eliminado.');
      } catch (error) { handleError(error); }
      break;
    }
    default: break;
  }
}

/** Diálogo para cambiar el precio rápidamente. */
function openPriceDialog(listing) {
  const suffix = listing.operationType === 'rent' ? RENTAL_PERIODS[listing.rental?.period]?.suffix ?? '' : '';
  const { element, close } = openModal({
    title: 'Cambiar precio',
    size: 'sm',
    body: `
      <form id="price-form" novalidate>
        <p>${escapeHtml(listing.title)}</p>
        <p class="muted">Precio actual: <strong>${formatMoney(listing.price)}${suffix}</strong></p>
        ${renderField({ name: 'price', label: 'Nuevo precio', type: 'number', value: listing.price, min: 1, required: true, unit: `€${suffix}` })}
        <p class="field__help">Los usuarios que lo tengan en favoritos verán el cambio de precio.</p>
      </form>`,
    footer: '<button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button><button type="submit" form="price-form" class="btn btn--primary">Guardar precio</button>',
  });
  const form = qs('#price-form', element);
  form.elements.price.select();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const price = Number(form.elements.price.value);
    const errors = {};
    if (!form.elements.price.value || !Number.isFinite(price) || price <= 0) errors.price = 'Introduce un precio mayor que cero.';
    else if (price === listing.price) errors.price = 'El nuevo precio es igual al actual.';
    if (!showFormErrors(form, errors)) return;
    await withBusy(qs('button[type="submit"]', element), async () => {
      try {
        await actions.changeListingPrice(listing.id, price);
        close();
        toast(`Precio actualizado a ${formatMoney(price)}${suffix}.`);
      } catch (error) { handleError(error); }
    });
  });
}

/* ==========================================================================
   Pedidos recibidos
   ========================================================================== */

const RECEIVED_FILTERS = [
  { id: 'all', label: 'Todos', match: () => true },
  { id: 'pending', label: 'Pendientes', match: (order) => order.status === 'pending' },
  { id: 'progress', label: 'En curso', match: (order) => ['accepted', 'preparing', 'shipped', 'confirmed', 'in_progress'].includes(order.status) },
  { id: 'completed', label: 'Completados', match: (order) => order.status === 'completed' },
  { id: 'cancelled', label: 'Cancelados', match: (order) => order.status === 'cancelled' },
  { id: 'disputed', label: 'En disputa', match: (order) => order.status === 'disputed' },
];

function renderReceivedOrders(container, params) {
  let filter = RECEIVED_FILTERS.some((item) => item.id === params.get('status')) ? params.get('status') : 'all';
  const paint = () => {
    const orders = select.ordersAsSeller(select.currentUserId()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tabs = RECEIVED_FILTERS.map((item) => ({ ...item, count: orders.filter(item.match).length }));
    const visible = orders.filter(RECEIVED_FILTERS.find((item) => item.id === filter).match);
    container.innerHTML = `
      ${sectionHeader('Pedidos recibidos', 'Compras y solicitudes de alquiler de tus anuncios. Abre el detalle para aceptarlas o actualizarlas.')}
      ${filterTabs(tabs, filter, 'Filtrar pedidos recibidos')}
      ${orderList(visible, { iconName: 'box', title: 'No hay pedidos en este estado' })}`;
    qsa('[data-filter]', container).forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter; paint(); qs(`[data-filter="${filter}"]`, container)?.focus(); }));
    bindOrderDetailButtons(container);
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Ventas e ingresos
   ========================================================================== */

function renderRevenue(container) {
  const paint = () => {
    const userId = select.currentUserId();
    const stats = select.sellerStats(userId);
    const rate = APP_CONFIG.commissionRate;
    const operations = select.ordersAsSeller(userId)
      .filter((order) => order.status !== 'cancelled')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const openAmount = operations.filter((order) => order.status !== 'completed').reduce((sum, order) => sum + order.amount, 0);

    container.innerHTML = `
      ${sectionHeader('Ventas e ingresos', `Historial de operaciones. Comisión de la plataforma configurada: ${(rate * 100).toLocaleString('es-ES')} %.`)}
      ${notice('No existe integración de pagos: estas cifras son <strong>estimaciones calculadas a partir de pedidos de prueba</strong>. Ningún importe se ha cobrado ni transferido.', 'warning')}
      <div class="stat-grid stat-grid--4">
        ${statCard({ label: 'Ingresos brutos (completados)', value: formatMoney(stats.grossRevenue), iconName: 'euro' })}
        ${statCard({ label: `Comisión estimada (${(rate * 100).toLocaleString('es-ES')} %)`, value: formatMoney(stats.commission), iconName: 'tag', tone: 'warning' })}
        ${statCard({ label: 'Importe neto estimado', value: formatMoney(stats.netEstimated), iconName: 'chart', tone: 'success' })}
        ${statCard({ label: 'Dinero recibido', value: '—', iconName: 'lock', tone: 'neutral', hint: 'Requiere pasarela de pagos (backend)' })}
      </div>
      <p class="muted small">Operaciones abiertas pendientes de completar: ${formatMoney(openAmount)} (no computan como ingresos).</p>
      <section class="card panel-card">
        <h2>Historial de operaciones</h2>
        ${operations.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <caption class="visually-hidden">Operaciones de venta y alquiler</caption>
              <thead><tr><th scope="col">Artículo</th><th scope="col">Tipo</th><th scope="col" class="num">Importe bruto</th><th scope="col" class="num">Comisión</th><th scope="col" class="num">Neto estimado</th><th scope="col">Fecha</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                ${operations.map((order) => {
                  const counts = order.status === 'completed';
                  return `<tr>
                    <td data-label="Artículo">${listingMini(select.listing(order.listingId))}</td>
                    <td data-label="Tipo">${order.operationType === 'rent' ? 'Alquiler' : 'Venta'}</td>
                    <td data-label="Importe bruto" class="num">${formatMoney(order.amount)}</td>
                    <td data-label="Comisión" class="num">${counts ? `−${formatMoney(order.amount * rate)}` : '—'}</td>
                    <td data-label="Neto estimado" class="num">${counts ? formatMoney(order.amount * (1 - rate)) : '<span class="muted">Pendiente</span>'}</td>
                    <td data-label="Fecha">${formatDate(order.updatedAt)}</td>
                    <td data-label="Estado">${orderStatusBadge(order)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : emptyState({ iconName: 'euro', title: 'Todavía no hay operaciones' })}
      </section>
      <p class="muted small">${backendBadge()} Liquidaciones, facturas y retirada de fondos estarán disponibles al integrar un proveedor de pagos.</p>`;
  };
  paint();
  return { update: paint };
}

/* ==========================================================================
   Valoraciones
   ========================================================================== */

function renderReviews(container) {
  const paint = () => {
    const userId = select.currentUserId();
    const reviews = select.reviewsFor(userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const summary = select.ratingSummary(userId);
    const distribution = [5, 4, 3, 2, 1].map((value) => ({ value, count: reviews.filter((review) => review.rating === value).length }));
    container.innerHTML = `
      ${sectionHeader('Valoraciones', 'Reseñas que te han dejado los compradores tras operaciones completadas.')}
      <div class="reviews-summary card">
        <div class="reviews-summary__score">
          <strong>${summary.average ? summary.average.toFixed(1) : '—'}</strong>
          ${stars(summary.average, { showValue: false })}
          <span class="muted">${summary.count} ${summary.count === 1 ? 'valoración' : 'valoraciones'}</span>
        </div>
        <ul class="reviews-summary__bars">
          ${distribution.map(({ value, count }) => `
            <li><span>${value} ${icon('star', 'icon--xs')}</span><span class="bar"><span style="width:${reviews.length ? (count / reviews.length) * 100 : 0}%"></span></span><span>${count}</span></li>`).join('')}
        </ul>
      </div>
      ${reviews.length ? `<ul class="review-list">${reviews.map((review) => {
        const reviewer = select.user(review.reviewerId);
        const order = select.order(review.orderId);
        return `
          <li class="review card">
            ${avatar(reviewer, 'sm')}
            <div>
              <p><strong>${escapeHtml(reviewer?.displayName ?? 'Usuario')}</strong> ${stars(review.rating, { showValue: false })}</p>
              ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : '<p class="muted">Sin comentario</p>'}
              <p class="small muted">${listingMini(select.listing(review.listingId))} · ${order ? `${escapeHtml(order.id)} · ${escapeHtml(ORDER_STATUS[order.operationType][order.status].label)}` : ''} · ${timeAgo(review.createdAt)}</p>
            </div>
          </li>`;
      }).join('')}</ul>` : emptyState({ iconName: 'star', title: 'Aún no tienes valoraciones', text: 'Los compradores pueden valorarte cuando una operación se completa.' })}
      <p class="muted small">${badge('Demostración', 'neutral')} Responder a reseñas y moderarlas requerirá backend.</p>`;
  };
  paint();
  return { update: paint };
}
