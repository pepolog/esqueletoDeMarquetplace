/**
 * orders.js
 * ---------------------------------------------------------------------------
 * Componentes de pedidos compartidos por el panel de comprador y el de
 * vendedor. Ambos paneles leen EL MISMO pedido del store, de modo que un
 * cambio de estado hecho por una de las partes se refleja en la otra.
 */

import { DELIVERY_METHODS, ORDER_STATUS, ORDER_TRANSITIONS, RENTAL_PERIODS } from './data.js';
import { icon } from './icons.js';
import { actions, select } from './store.js';
import {
  avatar, confirmDialog, emptyState, handleError, listingMini, notice, openModal, orderStatusBadge, orderTimeline, qs, qsa, toast, withBusy,
} from './ui.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney, timeAgo } from './utils.js';

/** Rol del usuario actual en un pedido. */
export function roleInOrder(order) {
  if (order.sellerId === select.currentUserId()) return 'seller';
  if (order.buyerId === select.currentUserId()) return 'buyer';
  return null;
}

/** Acciones de estado disponibles para el usuario actual. */
export function availableTransitions(order) {
  const role = roleInOrder(order);
  return role ? ORDER_TRANSITIONS[order.operationType][role][order.status] ?? [] : [];
}

/** Ejecuta un cambio de estado pidiendo confirmación si es una acción destructiva. */
export async function runOrderTransition(order, transition, button) {
  if (transition.danger) {
    const ok = await confirmDialog({
      title: transition.label,
      message: `¿Seguro que quieres continuar? El pedido ${order.id} pasará a «${ORDER_STATUS[order.operationType][transition.to].label}».`,
      confirmLabel: transition.label,
      danger: true,
    });
    if (!ok) return;
  }
  await withBusy(button, async () => {
    try {
      await actions.updateOrderStatus(order.id, transition.to);
      toast(`Pedido actualizado: ${ORDER_STATUS[order.operationType][transition.to].label}.`);
    } catch (error) { handleError(error); }
  });
}

/** Fila de pedido para listas (comprador o vendedor). */
export function orderRow(order) {
  const listing = select.listing(order.listingId);
  const role = roleInOrder(order);
  const counterpart = select.user(role === 'seller' ? order.buyerId : order.sellerId);
  const isRent = order.operationType === 'rent';
  return `
    <li class="order-row card">
      <div class="order-row__main">
        ${listingMini(listing)}
        <dl class="order-row__facts">
          <div><dt>Pedido</dt><dd><code>${escapeHtml(order.id)}</code></dd></div>
          <div><dt>${role === 'seller' ? 'Comprador' : 'Vendedor'}</dt><dd>${escapeHtml(counterpart?.displayName ?? '—')}</dd></div>
          <div><dt>Fecha</dt><dd>${formatDate(order.createdAt)}</dd></div>
          <div><dt>Importe</dt><dd><strong>${formatMoney(order.amount)}</strong></dd></div>
          ${isRent ? `<div><dt>Fechas</dt><dd>${formatDate(order.startDate)} → ${formatDate(order.endDate)}</dd></div>` : ''}
          <div><dt>Entrega</dt><dd>${escapeHtml(DELIVERY_METHODS[order.delivery?.method]?.label ?? '—')}</dd></div>
        </dl>
      </div>
      <div class="order-row__side">
        ${orderStatusBadge(order)}
        <button type="button" class="btn btn--ghost btn--sm" data-order-detail="${escapeHtml(order.id)}">Ver detalle</button>
      </div>
    </li>`;
}

export function orderList(orders, emptyOptions) {
  if (!orders.length) return emptyState(emptyOptions);
  return `<ul class="order-list">${orders.map(orderRow).join('')}</ul>`;
}

/** Conecta los botones «Ver detalle» de un contenedor. */
export function bindOrderDetailButtons(container) {
  qsa('[data-order-detail]', container).forEach((button) => button.addEventListener('click', () => openOrderDetail(button.dataset.orderDetail)));
}

/**
 * Ficha completa de un pedido en una ventana modal. Se repinta tras cada
 * acción, y muestra solo las acciones que corresponden al rol del usuario.
 */
export function openOrderDetail(orderId) {
  const modal = openModal({ title: `Pedido ${orderId}`, size: 'lg', body: '<div data-order-body></div>' });
  const body = qs('[data-order-body]', modal.element);

  const paint = () => {
    const order = select.order(orderId);
    if (!order) { body.innerHTML = emptyState({ iconName: 'alert', title: 'Pedido no encontrado' }); return; }
    const listing = select.listing(order.listingId);
    const buyer = select.user(order.buyerId);
    const seller = select.user(order.sellerId);
    const role = roleInOrder(order);
    const isRent = order.operationType === 'rent';
    const period = RENTAL_PERIODS[listing?.rental?.period];
    const transitions = availableTransitions(order);
    const review = select.reviewForOrder(order.id);
    const canReview = role === 'buyer' && order.status === 'completed' && !review;
    const counterpart = role === 'seller' ? buyer : seller;

    body.innerHTML = `
      <div class="order-detail">
        <div class="order-detail__head">
          ${listingMini(listing)}
          ${orderStatusBadge(order)}
        </div>
        <dl class="spec-list">
          <div><dt>Tipo de operación</dt><dd>${isRent ? 'Reserva de alquiler' : 'Compra'}</dd></div>
          <div><dt>Comprador</dt><dd>${avatar(buyer, 'xs')} ${escapeHtml(buyer?.displayName ?? '—')}</dd></div>
          <div><dt>Vendedor</dt><dd>${avatar(seller, 'xs')} ${escapeHtml(seller?.displayName ?? '—')}</dd></div>
          <div><dt>Fecha del pedido</dt><dd>${formatDateTime(order.createdAt)}</dd></div>
          ${isRent ? `
            <div><dt>Inicio</dt><dd>${formatDate(order.startDate)}</dd></div>
            <div><dt>Fin</dt><dd>${formatDate(order.endDate)}</dd></div>
            <div><dt>Duración</dt><dd>${order.units ?? '—'} ${escapeHtml(order.units === 1 ? period?.unit ?? '' : period?.unitPlural ?? '')}</dd></div>
            ${listing?.attributes?.deposit ? `<div><dt>Fianza</dt><dd>${formatMoney(listing.attributes.deposit)} <small class="muted">(no incluida en el importe)</small></dd></div>` : ''}` : ''}
          <div><dt>Importe</dt><dd><strong>${formatMoney(order.amount)}</strong></dd></div>
          <div><dt>Entrega</dt><dd>${escapeHtml(DELIVERY_METHODS[order.delivery?.method]?.label ?? '—')}</dd></div>
          ${order.delivery?.notes ? `<div><dt>Notas</dt><dd>${escapeHtml(order.delivery.notes)}</dd></div>` : ''}
          ${isRent && listing?.attributes?.pickupReturnConditions ? `<div><dt>Recogida y devolución</dt><dd>${escapeHtml(listing.attributes.pickupReturnConditions)}</dd></div>` : ''}
        </dl>
        ${notice('Operación de demostración: no se ha realizado ningún cobro ni pago. La pasarela de pagos requiere backend.')}
        <h3>Historial</h3>
        ${orderTimeline(order)}
        ${review ? `<p class="muted">${icon('star', 'icon--xs')} Valorado con ${review.rating}/5 ${timeAgo(review.createdAt)}.</p>` : ''}
        <div class="order-detail__actions">
          ${transitions.map((transition, index) => `<button type="button" class="btn ${transition.danger ? 'btn--danger-ghost' : 'btn--primary'}" data-transition="${index}">${escapeHtml(transition.label)}</button>`).join('')}
          ${canReview ? `<button type="button" class="btn btn--accent" data-review>${icon('star')}Valorar al vendedor</button>` : ''}
          ${counterpart && listing ? `<a class="btn btn--ghost" href="#/buyer/messages?listing=${listing.id}&with=${counterpart.id}" data-modal-close>${icon('message')}Enviar mensaje</a>` : ''}
        </div>
        ${!transitions.length && !canReview && !['completed', 'cancelled'].includes(order.status) ? `<p class="muted small">Esperando a que la otra parte actualice el pedido.</p>` : ''}
      </div>`;

    qsa('[data-transition]', body).forEach((button) => button.addEventListener('click', async () => {
      await runOrderTransition(order, transitions[Number(button.dataset.transition)], button);
      paint();
    }));
    qs('[data-review]', body)?.addEventListener('click', () => openReviewDialog(order, paint));
    qsa('[data-modal-close]', body).forEach((link) => link.addEventListener('click', modal.close));
  };
  paint();
}

/** Formulario de valoración tras una operación completada. */
export function openReviewDialog(order, onDone) {
  const { element, close } = openModal({
    title: 'Valorar la operación',
    size: 'sm',
    body: `
      <form id="review-form" novalidate>
        <fieldset class="rating-input">
          <legend>Puntuación</legend>
          ${[5, 4, 3, 2, 1].map((value) => `
            <input type="radio" id="rating-${value}" name="rating" value="${value}" ${value === 5 ? 'checked' : ''} />
            <label for="rating-${value}" title="${value} estrellas">${icon('star')}<span class="visually-hidden">${value} estrellas</span></label>`).join('')}
        </fieldset>
        <div class="field">
          <label class="field__label" for="review-comment">Comentario (opcional)</label>
          <textarea id="review-comment" name="comment" rows="3" maxlength="500"></textarea>
        </div>
      </form>`,
    footer: '<button type="button" class="btn btn--ghost" data-modal-close>Cancelar</button><button type="submit" form="review-form" class="btn btn--primary">Publicar valoración</button>',
  });
  qs('#review-form', element).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    await withBusy(qs('button[type="submit"]', element), async () => {
      try {
        await actions.createReview({ orderId: order.id, rating: Number(data.get('rating')), comment: data.get('comment') });
        close();
        toast('¡Gracias por tu valoración!');
        onDone?.();
      } catch (error) { handleError(error); }
    });
  });
}
