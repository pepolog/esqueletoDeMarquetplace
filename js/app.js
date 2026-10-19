/**
 * app.js
 * ---------------------------------------------------------------------------
 * Punto de entrada de la aplicación:
 *  - arranque (sprite de iconos, carga de datos);
 *  - enrutado por hash (#/ruta?parametros) sin recargar la página;
 *  - cabecera persistente, menú de usuario y menú móvil;
 *  - vistas públicas: inicio, explorar/buscar, categorías, detalle de
 *    anuncio y perfil público.
 *
 * Los paneles de vendedor, comprador y ajustes viven en seller.js, buyer.js
 * y profile.js respectivamente.
 */

import { APP_CONFIG, CATEGORIES, DELIVERY_METHODS, getCategory, ITEM_CONDITIONS, LISTING_STATUS, OPERATION_LABELS, RENTAL_PERIODS, VERTICALS } from './data.js';
import { icon, injectIconSprite } from './icons.js';
import { actions, initStore, select, subscribe } from './store.js';
import {
  avatar, backendBadge, badge, conditionLabel, confirmDialog, emptyState, formatAttribute, handleError, listingGrid,
  listingStatusBadge, navigate, notice, openReportDialog, priceLabel, qs, qsa, renderField, stars, toast, withBusy,
} from './ui.js';
import { debounce, escapeHtml, formatDate, formatMoney, replaceHash, safeStorage, timeAgo } from './utils.js';
import { isFieldVisible } from './validation.js';
import { renderSellerPanel } from './seller.js';
import { openPurchaseDialog, renderBuyerPanel } from './buyer.js';
import { renderSettings } from './profile.js';

/* ==========================================================================
   Enrutado
   ========================================================================== */

const viewContainer = () => qs('#view');
let currentView = null;
let isFirstRender = true;

/** Lee la ruta actual del hash: «#/seller/listings?status=active». */
export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

/** Tabla de rutas → función que dibuja la vista y la entrada del menú que se resalta. */
function resolveRoute({ segments, params }) {
  const [first = 'home', second, third] = segments;
  switch (first) {
    case 'home': return { nav: 'home', title: 'Inicio', render: (el) => renderHome(el) };
    case 'explore': return { nav: 'explore', title: 'Explorar anuncios', render: (el) => renderExplore(el, params, {}) };
    case 'vehicles': return { nav: 'vehicles', title: 'Vehículos', render: (el) => renderExplore(el, params, { vertical: 'vehicles' }) };
    case 'housing': return { nav: 'housing', title: 'Viviendas', render: (el) => renderExplore(el, params, { vertical: 'realestate' }) };
    case 'rentals': return { nav: 'rentals', title: 'Alquileres', render: (el) => renderExplore(el, params, { op: 'rent' }) };
    case 'categories': return { nav: 'categories', title: 'Categorías', render: (el) => renderCategories(el) };
    case 'listing': return { nav: 'explore', title: 'Anuncio', render: (el) => renderListingDetail(el, second) };
    case 'user': return { nav: second === select.currentUserId() ? 'profile' : 'explore', title: 'Perfil', render: (el) => renderPublicProfile(el, second) };
    case 'profile': return { nav: 'profile', title: 'Mi perfil', render: (el) => renderPublicProfile(el, select.currentUserId()) };
    case 'favorites': return { nav: 'favorites', title: 'Favoritos', render: (el) => renderBuyerPanel(el, 'favorites', params) };
    case 'purchases': return { nav: 'purchases', title: 'Mis compras', render: (el) => renderBuyerPanel(el, 'orders', params) };
    case 'buyer': return { nav: second === 'favorites' ? 'favorites' : 'purchases', title: 'Panel de comprador', render: (el) => renderBuyerPanel(el, second ?? 'overview', params) };
    case 'sell': return { nav: 'sell', title: 'Publicar anuncio', render: (el) => renderSellerPanel(el, 'new', null, params) };
    case 'seller': return { nav: 'sell', title: 'Panel de vendedor', render: (el) => renderSellerPanel(el, second ?? 'overview', third, params) };
    case 'settings': return { nav: 'settings', title: 'Ajustes', render: (el) => renderSettings(el, second ?? 'personal', params) };
    default: return { nav: '', title: 'Página no encontrada', render: (el) => renderNotFound(el) };
  }
}

function route() {
  const routeInfo = parseRoute();
  const resolved = resolveRoute(routeInfo);
  closeMenus();
  currentView?.destroy?.();
  const container = viewContainer();
  container.classList.remove('view--enter');
  void container.offsetWidth; // reinicia la animación de entrada
  container.classList.add('view--enter');
  try {
    currentView = resolved.render(container) ?? null;
  } catch (error) {
    console.error(error);
    container.innerHTML = emptyState({ iconName: 'alert', title: 'No se pudo mostrar esta sección', text: 'Se ha producido un error inesperado.' });
    currentView = null;
  }
  document.title = `${resolved.title} · ${APP_CONFIG.brandName}`;
  highlightNav(resolved.nav);
  if (!isFirstRender && !routeInfo.params.has('keepScroll')) {
    window.scrollTo({ top: 0 });
    qs('#main').focus({ preventScroll: true });
  }
  isFirstRender = false;
}

function highlightNav(navId) {
  qsa('[data-nav]').forEach((link) => {
    const isActive = link.dataset.nav === navId || (navId === 'purchases' && link.dataset.nav === 'account');
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/* ==========================================================================
   Cabecera, menú de usuario y menú móvil
   ========================================================================== */

function setupHeader() {
  const categorySelect = qs('#header-category');
  categorySelect.insertAdjacentHTML('beforeend', CATEGORIES.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join(''));

  // Búsqueda: navega a Explorar con los parámetros elegidos.
  const searchForm = qs('#header-search');
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    const query = searchForm.elements.q.value.trim();
    if (query) params.set('q', query);
    if (categorySelect.value) params.set('category', categorySelect.value);
    navigate(`#/explore${params.toString() ? `?${params}` : ''}`);
  });
  categorySelect.addEventListener('change', () => searchForm.requestSubmit());

  // Menú móvil (panel lateral)
  const menuToggle = qs('#menu-toggle');
  menuToggle.addEventListener('click', () => {
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Cerrar menú principal' : 'Abrir menú principal');
    qs('#nav-overlay').hidden = !open;
    if (open) qs('#main-nav a')?.focus();
  });
  qs('#nav-overlay').addEventListener('click', closeMenus);

  // Menú desplegable de usuario
  const trigger = qs('#user-menu-trigger');
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const panel = qs('#user-menu-panel');
    const open = panel.hidden;
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) qs('a, button, select', panel)?.focus();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#user-menu')) closeUserMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!qs('#user-menu-panel').hidden) { closeUserMenu(); trigger.focus(); }
    if (document.body.classList.contains('nav-open')) { closeMenus(); menuToggle.focus(); }
  });
}

function closeUserMenu() {
  qs('#user-menu-panel').hidden = true;
  qs('#user-menu-trigger').setAttribute('aria-expanded', 'false');
}

function closeMenus() {
  closeUserMenu();
  document.body.classList.remove('nav-open');
  qs('#menu-toggle').setAttribute('aria-expanded', 'false');
  qs('#nav-overlay').hidden = true;
}

/** Actualiza avatar, menú de usuario y contadores de la cabecera. */
function updateHeader() {
  const user = select.currentUser();
  if (!user) return;
  qs('#user-menu-avatar').innerHTML = avatar(user, 'sm');
  const stats = select.buyerStats(user.id);
  const sellerPending = select.sellerStats(user.id).pendingOrders;
  const setCount = (name, value) => {
    const dot = qs(`[data-count="${name}"]`);
    dot.hidden = !value;
    dot.textContent = value > 9 ? '9+' : String(value);
  };
  setCount('favorites', stats.favorites);
  setCount('orders', stats.activeOrders + stats.activeRentals);
  setCount('messages', stats.unreadMessages);

  const panel = qs('#user-menu-panel');
  const wasOpen = !panel.hidden;
  panel.innerHTML = `
    <div class="user-menu__header">
      ${avatar(user, 'md')}
      <div><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></div>
    </div>
    <ul class="user-menu__list">
      <li><a href="#/profile">${icon('user')}Mi perfil público</a></li>
      <li><a href="#/seller/overview">${icon('store')}Panel de vendedor${sellerPending ? `<span class="count-pill">${sellerPending}</span>` : ''}</a></li>
      <li><a href="#/buyer/overview">${icon('bag')}Panel de comprador</a></li>
      <li><a href="#/buyer/messages">${icon('message')}Mensajes${stats.unreadMessages ? `<span class="count-pill">${stats.unreadMessages}</span>` : ''}</a></li>
      <li><a href="#/settings/personal">${icon('sliders')}Ajustes</a></li>
      <li><a href="#/settings/help">${icon('help')}Ayuda y soporte</a></li>
    </ul>
    <div class="user-menu__demo">
      <label for="demo-user-switch">Cuenta de demostración</label>
      <select id="demo-user-switch">
        ${select.users().map((candidate) => `<option value="${candidate.id}" ${candidate.id === user.id ? 'selected' : ''}>${escapeHtml(candidate.displayName)} (@${escapeHtml(candidate.username)})</option>`).join('')}
      </select>
      <p class="field__help">Cambia de usuario para probar la compra y la venta entre cuentas. Sin autenticación real.</p>
    </div>
    <ul class="user-menu__list user-menu__list--footer">
      <li><button type="button" id="reset-demo">${icon('refresh')}Restablecer datos de prueba</button></li>
      <li><button type="button" disabled title="Requiere autenticación con backend">${icon('logout')}Cerrar sesión ${backendBadge()}</button></li>
    </ul>`;
  panel.hidden = !wasOpen;

  qs('#demo-user-switch', panel).addEventListener('change', async (event) => {
    try {
      await actions.switchDemoUser(event.target.value);
      toast(`Ahora navegas como ${select.currentUser().displayName}.`, { tone: 'info' });
      closeUserMenu();
      route();
    } catch (error) { handleError(error); }
  });
  qs('#reset-demo', panel).addEventListener('click', async () => {
    closeUserMenu();
    const ok = await confirmDialog({ title: 'Restablecer datos de prueba', message: 'Se borrarán los anuncios, pedidos, mensajes y cambios guardados en este navegador y se cargarán de nuevo los datos iniciales.', confirmLabel: 'Restablecer', danger: true });
    if (!ok) return;
    try {
      await actions.resetDemoData();
      toast('Datos de prueba restablecidos.');
      navigate('#/home');
    } catch (error) { handleError(error); }
  });
}

/* ==========================================================================
   Acciones globales delegadas (funcionan en cualquier vista)
   ========================================================================== */

function setupGlobalActions() {
  // El enlace «Saltar al contenido» mueve el foco sin pasar por el enrutador.
  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    qs('#main').focus();
  });
  // Un enlace a la ruta actual (p. ej. «Publicar anuncio» estando ya en el asistente)
  // no dispara hashchange: lo forzamos para que la vista se reinicie.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#/"]');
    if (link && !event.defaultPrevented && link.getAttribute('href') === location.hash && event.button === 0 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });
  document.addEventListener('click', async (event) => {
    const favButton = event.target.closest('[data-action="toggle-favorite"]');
    if (favButton) {
      event.preventDefault();
      await withBusy(favButton, async () => {
        try {
          const { favorite } = await actions.toggleFavorite(favButton.dataset.listingId);
          toast(favorite ? 'Añadido a favoritos.' : 'Eliminado de favoritos.', { tone: favorite ? 'success' : 'info', timeout: 2500 });
        } catch (error) { handleError(error); }
      });
    }
  });
}

/* ==========================================================================
   Vista: Inicio
   ========================================================================== */

function homeSection({ title, href, listings, emptyText, id }) {
  return `
    <section class="home-section" aria-labelledby="${id}">
      <div class="home-section__header">
        <h2 id="${id}">${escapeHtml(title)}</h2>
        ${href ? `<a href="${href}" class="link-arrow">Ver todo ${icon('chevronRight', 'icon--xs')}</a>` : ''}
      </div>
      ${listingGrid(listings, { emptyTitle: emptyText })}
    </section>`;
}

function renderHome(container) {
  const paint = () => {
    const recent = select.searchListings({ sort: 'recent' }).slice(0, 8);
    const featured = select.publicListings().filter((listing) => listing.featured).slice(0, 4);
    const vehicles = select.searchListings({ vertical: 'vehicles' }).slice(0, 4);
    const housing = select.searchListings({ vertical: 'realestate' }).slice(0, 4);
    const rentals = select.searchListings({ op: 'rent' }).slice(0, 4);
    const recommended = select.recommendations(4);
    const counts = Object.fromEntries(CATEGORIES.map((category) => [category.id, select.searchListings({ category: category.id }).length]));

    container.innerHTML = `
      <section class="hero">
        <div class="container hero__inner">
          <div class="hero__text">
            <h1>Compra, vende y alquila<br /><span>todo en un mismo sitio</span></h1>
            <p>Artículos de segunda mano, coches, motos, viviendas y habitaciones. Sin salir de una sola aplicación.</p>
          </div>
          <form class="hero-search card" id="hero-search" role="search" aria-label="Búsqueda con filtros básicos">
            <div class="hero-search__main">
              <label for="hero-q" class="visually-hidden">¿Qué buscas?</label>
              ${icon('search')}
              <input id="hero-q" name="q" type="search" placeholder="¿Qué estás buscando?" autocomplete="off" />
            </div>
            <div class="hero-search__filters">
              <div class="field field--compact"><label class="field__label" for="hero-category">Categoría</label>
                <select id="hero-category" name="category"><option value="">Todas</option>${CATEGORIES.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')}</select></div>
              <div class="field field--compact"><label class="field__label" for="hero-op">Operación</label>
                <select id="hero-op" name="op"><option value="">Venta y alquiler</option><option value="sale">Venta</option><option value="rent">Alquiler</option></select></div>
              <div class="field field--compact"><label class="field__label" for="hero-loc">Ubicación</label>
                <input id="hero-loc" name="loc" type="text" placeholder="Ciudad o zona" /></div>
              <div class="field field--compact"><label class="field__label" for="hero-max">Precio máximo</label>
                <input id="hero-max" name="max" type="number" min="0" inputmode="decimal" placeholder="€" /></div>
            </div>
            <button type="submit" class="btn btn--primary btn--lg">${icon('search')}Buscar</button>
          </form>
        </div>
      </section>

      <div class="container home">
        <section class="home-section" aria-labelledby="home-cats">
          <div class="home-section__header"><h2 id="home-cats">Categorías principales</h2><a href="#/categories" class="link-arrow">Todas ${icon('chevronRight', 'icon--xs')}</a></div>
          <ul class="category-strip">
            ${CATEGORIES.map((category) => `
              <li><a class="category-chip" href="#/explore?category=${category.id}" style="--cat-hue:${category.hue}">
                <span class="category-chip__icon">${icon(category.icon)}</span>
                <span class="category-chip__name">${escapeHtml(category.shortName)}</span>
                <span class="category-chip__count">${counts[category.id]}</span>
              </a></li>`).join('')}
          </ul>
        </section>

        ${homeSection({ id: 'home-recent', title: 'Anuncios recientes', href: '#/explore?sort=recent', listings: recent, emptyText: 'Todavía no hay anuncios' })}
        ${homeSection({ id: 'home-featured', title: 'Destacados', href: '', listings: featured, emptyText: 'No hay anuncios destacados' })}

        <section class="cta-banner">
          <div>
            <h2>¿Tienes algo que ya no usas?</h2>
            <p>Publica gratis en pocos pasos: artículos, vehículos, viviendas o habitaciones, en venta o en alquiler.</p>
          </div>
          <a href="#/sell" class="btn btn--accent btn--lg">${icon('plus')}Publicar anuncio</a>
        </section>

        ${homeSection({ id: 'home-reco', title: 'Recomendado para ti', href: '', listings: recommended, emptyText: 'Guarda favoritos para recibir recomendaciones' })}
        ${homeSection({ id: 'home-vehicles', title: 'Vehículos', href: '#/vehicles', listings: vehicles, emptyText: 'No hay vehículos publicados' })}
        ${homeSection({ id: 'home-housing', title: 'Viviendas y habitaciones', href: '#/housing', listings: housing, emptyText: 'No hay viviendas publicadas' })}
        ${homeSection({ id: 'home-rentals', title: 'Artículos en alquiler', href: '#/rentals', listings: rentals, emptyText: 'No hay artículos en alquiler' })}
      </div>`;

    qs('#hero-search', container).addEventListener('submit', (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      new FormData(event.target).forEach((value, key) => { if (String(value).trim()) params.set(key, String(value).trim()); });
      navigate(`#/explore${params.toString() ? `?${params}` : ''}`);
    });
  };
  paint();
  // Al cambiar los datos (p. ej. un favorito) se repinta conservando el scroll.
  return { update: paint };
}

/* ==========================================================================
   Vista: Explorar / búsqueda con filtros
   ========================================================================== */

const FILTER_KEYS = ['q', 'category', 'op', 'min', 'max', 'loc', 'cond', 'date', 'sort'];

function renderExplore(container, params, preset) {
  const routeBase = preset.vertical ? (preset.vertical === 'vehicles' ? '#/vehicles' : '#/housing') : preset.op ? '#/rentals' : '#/explore';
  const title = preset.vertical ? VERTICALS[preset.vertical].label : preset.op === 'rent' ? 'Alquileres' : 'Explorar anuncios';
  const subtitle = preset.vertical === 'vehicles' ? 'Coches y motos en venta o alquiler.'
    : preset.vertical === 'realestate' ? 'Viviendas en venta y alquiler, y habitaciones.'
      : preset.op === 'rent' ? 'Todo lo que puedes alquilar: vehículos, viviendas, material deportivo, tecnología…'
        : 'Busca entre todos los anuncios publicados.';
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const availableCategories = preset.vertical ? CATEGORIES.filter((category) => VERTICALS[preset.vertical].categories.includes(category.id)) : CATEGORIES;

  container.innerHTML = `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p class="muted">${escapeHtml(subtitle)}</p>
        </div>
        <button type="button" class="btn btn--ghost explore__filters-toggle" aria-expanded="false" aria-controls="explore-filters">${icon('filter')}Filtros</button>
      </header>
      <div class="explore">
        <aside class="explore__filters card" id="explore-filters" aria-label="Filtros de búsqueda">
          <form id="filters-form" novalidate>
            ${renderField({ name: 'q', label: 'Palabras clave', type: 'search', value: filters.q, placeholder: 'Marca, modelo, título…' })}
            ${renderField({ name: 'category', label: 'Categoría', type: 'select', value: filters.category, emptyOption: 'Todas', options: availableCategories.map((category) => [category.id, category.name]) })}
            ${preset.op ? '' : renderField({ name: 'op', label: 'Venta o alquiler', type: 'select', value: filters.op, emptyOption: 'Ambas', options: [['sale', 'Venta'], ['rent', 'Alquiler']] })}
            <div class="field-row">
              ${renderField({ name: 'min', label: 'Precio mínimo', type: 'number', value: filters.min, min: 0, unit: '€' })}
              ${renderField({ name: 'max', label: 'Precio máximo', type: 'number', value: filters.max, min: 0, unit: '€' })}
            </div>
            ${renderField({ name: 'loc', label: 'Ubicación', value: filters.loc, placeholder: 'Ciudad, zona o CP' })}
            ${renderField({ name: 'cond', label: 'Estado del artículo', type: 'select', value: filters.cond, emptyOption: 'Cualquiera', options: ITEM_CONDITIONS, help: 'Aplica a artículos de segunda mano.' })}
            ${renderField({ name: 'date', label: 'Fecha de publicación', type: 'select', value: filters.date, emptyOption: 'Cualquier fecha', options: [['1', 'Últimas 24 horas'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días']] })}
            <button type="button" class="btn btn--ghost btn--block" id="clear-filters">${icon('x')}Limpiar filtros</button>
          </form>
        </aside>
        <section class="explore__results" aria-labelledby="results-count">
          <div class="results-bar">
            <p id="results-count" class="results-bar__count" aria-live="polite"></p>
            <div class="field field--inline">
              <label for="sort-select" class="field__label">Ordenar por</label>
              <select id="sort-select" name="sort">
                <option value="recent" ${filters.sort === 'recent' || !filters.sort ? 'selected' : ''}>Más recientes</option>
                <option value="price_asc" ${filters.sort === 'price_asc' ? 'selected' : ''}>Precio más bajo</option>
                <option value="price_desc" ${filters.sort === 'price_desc' ? 'selected' : ''}>Precio más alto</option>
              </select>
            </div>
          </div>
          <div id="results"></div>
        </section>
      </div>
    </div>`;

  const form = qs('#filters-form', container);
  const sortSelect = qs('#sort-select', container);

  /** Lee los filtros del formulario, actualiza la URL (sin recargar) y repinta los resultados. */
  const readFilters = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    values.sort = sortSelect.value;
    return values;
  };
  const paintResults = () => {
    const values = readFilters();
    const query = { ...values, ...preset };
    const results = select.searchListings(query);
    const activeFilters = FILTER_KEYS.filter((key) => key !== 'sort' && values[key]).length;
    qs('#results-count', container).textContent = `${results.length} ${results.length === 1 ? 'anuncio' : 'anuncios'}${activeFilters ? ` · ${activeFilters} ${activeFilters === 1 ? 'filtro activo' : 'filtros activos'}` : ''}`;
    qs('#results', container).innerHTML = listingGrid(results, {
      emptyTitle: 'No hay resultados',
      emptyText: 'Prueba con otras palabras o elimina algunos filtros.',
      emptyAction: activeFilters ? '<button type="button" class="btn btn--primary" data-clear-filters>Limpiar filtros</button>' : '',
    });
  };
  const syncUrl = () => {
    const values = readFilters();
    const search = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value && !(key === 'sort' && value === 'recent')) search.set(key, value); });
    replaceHash(`${routeBase}${search.toString() ? `?${search}` : ''}`);
  };
  const onChange = () => { paintResults(); syncUrl(); };
  const onChangeDebounced = debounce(onChange, 220);
  const clearFilters = () => {
    form.reset();
    qsa('input, select', form).forEach((element) => { element.value = ''; });
    sortSelect.value = 'recent';
    onChange();
  };

  form.addEventListener('input', onChangeDebounced);
  form.addEventListener('change', onChange);
  form.addEventListener('submit', (event) => event.preventDefault());
  sortSelect.addEventListener('change', onChange);
  qs('#clear-filters', container).addEventListener('click', clearFilters);
  container.addEventListener('click', (event) => { if (event.target.closest('[data-clear-filters]')) clearFilters(); });
  const toggle = qs('.explore__filters-toggle', container);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    qs('#explore-filters', container).classList.toggle('is-open', open);
  });

  // Sincroniza el buscador de la cabecera con los filtros actuales.
  qs('#header-search-input').value = filters.q;
  qs('#header-category').value = availableCategories.some((category) => category.id === filters.category) ? filters.category : '';

  paintResults();
  return { update: paintResults };
}

/* ==========================================================================
   Vista: Categorías
   ========================================================================== */

function renderCategories(container) {
  container.innerHTML = `
    <div class="container page">
      <header class="page-header"><div><h1>Categorías</h1><p class="muted">Elige una categoría para ver sus anuncios activos.</p></div></header>
      <ul class="category-grid">
        ${CATEGORIES.map((category) => {
          const sale = select.searchListings({ category: category.id, op: 'sale' }).length;
          const rent = select.searchListings({ category: category.id, op: 'rent' }).length;
          return `
            <li>
              <a class="category-card card" href="#/explore?category=${category.id}" style="--cat-hue:${category.hue}">
                <span class="category-card__icon">${icon(category.icon)}</span>
                <span class="category-card__body">
                  <strong>${escapeHtml(category.name)}</strong>
                  <small>${category.operations.includes('sale') ? `${sale} en venta` : ''}${category.operations.length > 1 ? ' · ' : ''}${category.operations.includes('rent') ? `${rent} en alquiler` : ''}</small>
                </span>
                ${icon('chevronRight')}
              </a>
            </li>`;
        }).join('')}
      </ul>
    </div>`;
}

/* ==========================================================================
   Vista: Detalle de anuncio
   ========================================================================== */

/** Cuenta una visita por anuncio y sesión del navegador (evita inflar el contador al recargar). */
function registerViewOnce(listing) {
  if (listing.sellerId === select.currentUserId() || listing.status !== 'active') return;
  let viewed = [];
  try { viewed = JSON.parse(safeStorage.get('sessionStorage', 'trato.viewed') ?? '[]'); } catch { viewed = []; }
  const key = `${select.currentUserId()}:${listing.id}`;
  if (viewed.includes(key)) return;
  safeStorage.set('sessionStorage', 'trato.viewed', JSON.stringify([...viewed, key]));
  actions.registerView(listing.id).catch(() => {});
}

function renderListingDetail(container, listingId) {
  let activeImage = 0;
  const paint = () => {
    const listing = select.listing(listingId);
    // Los borradores y los anuncios en revisión solo los ve su propietario.
    const hiddenForOthers = ['draft', 'pending_review'].includes(listing?.status) && listing.sellerId !== select.currentUserId();
    if (!listing || listing.deletedAt || hiddenForOthers) {
      container.innerHTML = `<div class="container page">${emptyState({ iconName: 'alert', title: 'Anuncio no disponible', text: 'Puede que se haya eliminado o que el enlace no sea correcto.', action: '<a class="btn btn--primary" href="#/explore">Explorar anuncios</a>' })}</div>`;
      return;
    }
    const category = getCategory(listing.category);
    const seller = select.user(listing.sellerId);
    const rating = select.ratingSummary(seller.id);
    const isOwn = listing.sellerId === select.currentUserId();
    const isFav = select.isFavorite(listing.id);
    const availability = select.availability(listing);
    const images = listing.images ?? [];
    activeImage = Math.min(activeImage, Math.max(images.length - 1, 0));
    const isRent = listing.operationType === 'rent';
    const period = RENTAL_PERIODS[listing.rental?.period];
    const bookings = isRent ? select.confirmedBookings(listing.id) : [];
    const attributes = category.fields
      .filter((field) => isFieldVisible(field, listing))
      .map((field) => [field.label, formatAttribute(field, listing.attributes?.[field.key])])
      .filter(([, value]) => value !== null);
    const generalRows = [
      listing.condition ? ['Estado', conditionLabel(listing.condition)] : null,
      listing.brand ? ['Marca', listing.brand] : null,
      listing.model ? ['Modelo', listing.model] : null,
      listing.availability ? ['Disponibilidad', listing.availability] : null,
    ].filter(Boolean);
    const allRows = [...generalRows, ...attributes, ...(listing.customAttributes ?? []).map((item) => [item.label, item.value])];
    const deliveryList = Object.entries(DELIVERY_METHODS).filter(([key]) => listing.delivery?.[key]);
    const actionLabel = isRent ? 'Solicitar alquiler' : ['vehicles', 'realestate'].includes(category.vertical) ? 'Solicitar compra' : 'Comprar';

    let actionHtml;
    if (isOwn) {
      actionHtml = `
        ${notice(`Es tu anuncio (estado: <strong>${escapeHtml(LISTING_STATUS[listing.status]?.label ?? listing.status)}</strong>). Así lo ven los compradores.`)}
        <a href="#/seller/edit/${listing.id}" class="btn btn--primary btn--block">${icon('edit')}Editar anuncio</a>
        <a href="#/seller/listings" class="btn btn--ghost btn--block">Ir a Mis anuncios</a>`;
    } else if (availability.available) {
      actionHtml = `
        <button type="button" class="btn btn--primary btn--block btn--lg" data-buy>${icon(isRent ? 'calendar' : 'bag')}${actionLabel}</button>
        <a href="#/buyer/messages?listing=${listing.id}&with=${seller.id}" class="btn btn--ghost btn--block">${icon('message')}Contactar con el vendedor</a>`;
    } else {
      actionHtml = `
        ${notice(escapeHtml(availability.reason), 'warning')}
        ${availability.ownOrder ? `<a href="#/buyer/orders" class="btn btn--ghost btn--block">Ver mi pedido</a>` : ''}
        <a href="#/buyer/messages?listing=${listing.id}&with=${seller.id}" class="btn btn--ghost btn--block">${icon('message')}Contactar con el vendedor</a>`;
    }

    container.innerHTML = `
      <div class="container page">
        <nav class="breadcrumb" aria-label="Ruta de navegación">
          <ol>
            <li><a href="#/home">Inicio</a></li>
            <li><a href="#/explore?category=${category.id}">${escapeHtml(category.name)}</a></li>
            <li aria-current="page">${escapeHtml(listing.title)}</li>
          </ol>
        </nav>

        <div class="detail">
          <section class="detail__gallery" aria-label="Fotografías">
            <div class="gallery__main">
              ${images.length
                ? `<img src="${escapeHtml(images[activeImage].src)}" alt="${escapeHtml(images[activeImage].alt || listing.title)}" />`
                : `<div class="listing-card__noimg">${icon('image')}<span>Sin fotografías</span></div>`}
              <span class="listing-card__op listing-card__op--${listing.operationType}">${OPERATION_LABELS[listing.operationType]}</span>
            </div>
            ${images.length > 1 ? `
              <ul class="gallery__thumbs">
                ${images.map((image, index) => `
                  <li><button type="button" class="gallery__thumb ${index === activeImage ? 'is-active' : ''}" data-image-index="${index}" aria-label="Ver imagen ${index + 1} de ${images.length}" aria-pressed="${index === activeImage}">
                    <img src="${escapeHtml(image.src)}" alt="" />
                  </button></li>`).join('')}
              </ul>` : ''}
          </section>

          <aside class="detail__summary card">
            <div class="detail__badges">
              ${badge(category.name, 'neutral')}
              ${badge(OPERATION_LABELS[listing.operationType], isRent ? 'accent' : 'info')}
              ${listing.status !== 'active' ? listingStatusBadge(listing.status) : listing.operationType === 'sale' && select.openSaleOrder(listing.id) ? badge('Reservado', 'warning') : badge('Disponible', 'success')}
            </div>
            <h1 class="detail__title">${escapeHtml(listing.title)}</h1>
            <p class="detail__price">${priceLabel(listing)}</p>
            ${isRent && listing.attributes?.deposit ? `<p class="muted">Fianza: ${formatMoney(listing.attributes.deposit)}</p>` : ''}
            <p class="detail__meta">${icon('pin', 'icon--xs')}${escapeHtml([listing.location.zone, listing.location.city].filter(Boolean).join(', '))}</p>
            <p class="detail__meta">${icon('clock', 'icon--xs')}Publicado ${timeAgo(listing.createdAt)} · ${icon('eye', 'icon--xs')}${listing.views ?? 0} visitas · ${icon('heart', 'icon--xs')}${select.favoriteCountFor(listing.id)}</p>
            <div class="detail__actions">
              ${actionHtml}
              ${isOwn ? '' : `<button type="button" class="btn btn--ghost btn--block ${isFav ? 'is-active' : ''}" data-action="toggle-favorite" data-listing-id="${listing.id}" aria-pressed="${isFav}">${icon('heart')}${isFav ? 'Guardado en favoritos' : 'Añadir a favoritos'}</button>`}
            </div>
            <a class="seller-card" href="#/user/${seller.id}">
              ${avatar(seller, 'md')}
              <span class="seller-card__body">
                <strong>${escapeHtml(seller.displayName)}</strong>
                <small>@${escapeHtml(seller.username)}</small>
                ${seller.preferences?.privacy?.showRating !== false ? stars(rating.average) : ''}
              </span>
              ${icon('chevronRight')}
            </a>
            ${isOwn ? '' : `<button type="button" class="link-btn" data-report>${icon('flag', 'icon--xs')}Denunciar este anuncio</button>`}
          </aside>

          <div class="detail__content">
            <section class="card detail__section">
              <h2>Descripción</h2>
              <p class="prewrap">${escapeHtml(listing.description)}</p>
            </section>
            ${allRows.length ? `
              <section class="card detail__section">
                <h2>Características</h2>
                <dl class="spec-list">${allRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
              </section>` : ''}
            ${isRent ? `
              <section class="card detail__section">
                <h2>Condiciones del alquiler</h2>
                <dl class="spec-list">
                  <div><dt>Periodicidad</dt><dd>${escapeHtml(period?.label ?? '—')}</dd></div>
                  <div><dt>Duración mínima</dt><dd>${listing.rental.minDuration} ${escapeHtml(listing.rental.minDuration === 1 ? period?.unit : period?.unitPlural)}</dd></div>
                  <div><dt>Duración máxima</dt><dd>${listing.rental.maxDuration ? `${listing.rental.maxDuration} ${escapeHtml(period?.unitPlural)}` : 'Sin límite'}</dd></div>
                </dl>
                ${listing.rental.requirements ? `<h3>Requisitos del arrendatario</h3><p class="prewrap">${escapeHtml(listing.rental.requirements)}</p>` : ''}
                ${category.rentNote ? notice(escapeHtml(category.rentNote)) : ''}
                <h3>Fechas ya reservadas</h3>
                ${bookings.length ? `<ul class="booking-list">${bookings.map((booking) => `<li>${icon('calendar', 'icon--xs')}${formatDate(booking.startDate)} → ${formatDate(booking.endDate)}</li>`).join('')}</ul>` : '<p class="muted">No hay reservas confirmadas. Todas las fechas están libres.</p>'}
              </section>` : ''}
            <section class="card detail__section">
              <h2>Entrega y recogida</h2>
              <ul class="delivery-list">${deliveryList.map(([, method]) => `<li>${icon(method.icon)}${escapeHtml(method.label)}</li>`).join('')}</ul>
              ${listing.deliveryNotes ? `<p class="prewrap">${escapeHtml(listing.deliveryNotes)}</p>` : ''}
              <p class="muted small">La dirección exacta nunca se publica: se acuerda por mensaje entre las partes.</p>
            </section>
          </div>
        </div>
      </div>`;

    qsa('[data-image-index]', container).forEach((button) => button.addEventListener('click', () => {
      activeImage = Number(button.dataset.imageIndex);
      paint();
      qs(`[data-image-index="${activeImage}"]`, container)?.focus();
    }));
    qs('[data-buy]', container)?.addEventListener('click', () => openPurchaseDialog(listing));
    qs('[data-report]', container)?.addEventListener('click', () => openReportDialog(listing));
  };

  paint();
  const listing = select.listing(listingId);
  if (listing) registerViewOnce(listing);
  return { update: paint };
}

/* ==========================================================================
   Vista: Perfil público
   ========================================================================== */

function renderPublicProfile(container, userId) {
  const paint = () => {
    const user = select.user(userId);
    if (!user) {
      container.innerHTML = `<div class="container page">${emptyState({ iconName: 'user', title: 'Usuario no encontrado' })}</div>`;
      return;
    }
    const isOwn = user.id === select.currentUserId();
    const privacy = user.preferences?.privacy ?? {};
    if (privacy.profileVisibility === 'private' && !isOwn) {
      container.innerHTML = `<div class="container page">${emptyState({ iconName: 'lock', title: 'Perfil privado', text: 'Este usuario ha decidido no mostrar su perfil públicamente.' })}</div>`;
      return;
    }
    const rating = select.ratingSummary(user.id);
    const listings = select.listingsBySeller(user.id).filter((listing) => listing.status === 'active');
    const reviews = select.reviewsFor(user.id);

    container.innerHTML = `
      <div class="container page">
        ${isOwn ? notice(`Así ven tu perfil otros usuarios. Visibilidad actual: <strong>${{ public: 'pública', registered: 'solo usuarios registrados', private: 'privada' }[privacy.profileVisibility] ?? 'pública'}</strong>. <a href="#/settings/public">Editar perfil público</a>`) : ''}
        <section class="profile-hero card">
          ${avatar(user, 'xl')}
          <div class="profile-hero__body">
            <h1>${escapeHtml(user.displayName)}</h1>
            <p class="muted">@${escapeHtml(user.username)}</p>
            ${user.bio ? `<p>${escapeHtml(user.bio)}</p>` : ''}
            <ul class="profile-hero__facts">
              ${privacy.showCity !== false && user.publicLocation ? `<li>${icon('pin', 'icon--xs')}${escapeHtml(user.publicLocation)}</li>` : ''}
              ${privacy.showJoinDate !== false ? `<li>${icon('calendar', 'icon--xs')}En ${escapeHtml(APP_CONFIG.brandName)} desde ${formatDate(user.createdAt, { day: undefined })}</li>` : ''}
              <li>${icon('tag', 'icon--xs')}${listings.length} ${listings.length === 1 ? 'anuncio activo' : 'anuncios activos'}</li>
              ${privacy.showRating !== false ? `<li>${stars(rating.average)} <span class="muted">(${rating.count} ${rating.count === 1 ? 'valoración' : 'valoraciones'})</span></li>` : ''}
            </ul>
          </div>
        </section>

        <section class="home-section" aria-labelledby="profile-listings">
          <div class="home-section__header"><h2 id="profile-listings">Anuncios activos</h2></div>
          ${listingGrid(listings, { emptyTitle: 'No tiene anuncios activos' })}
        </section>

        ${privacy.showRating !== false ? `
          <section class="home-section" aria-labelledby="profile-reviews">
            <div class="home-section__header"><h2 id="profile-reviews">Valoraciones</h2></div>
            ${reviews.length ? `<ul class="review-list">${reviews.map((review) => {
              const reviewer = select.user(review.reviewerId);
              const reviewed = select.listing(review.listingId);
              return `<li class="review card">${avatar(reviewer, 'sm')}<div><p><strong>${escapeHtml(reviewer?.displayName ?? 'Usuario')}</strong> ${stars(review.rating, { showValue: false })}</p><p>${escapeHtml(review.comment)}</p><small class="muted">${escapeHtml(reviewed?.title ?? '')} · ${timeAgo(review.createdAt)}</small></div></li>`;
            }).join('')}</ul>` : emptyState({ iconName: 'star', title: 'Todavía no hay valoraciones' })}
          </section>` : ''}
      </div>`;
  };
  paint();
  return { update: paint };
}

function renderNotFound(container) {
  container.innerHTML = `<div class="container page">${emptyState({ iconName: 'compass', title: 'Página no encontrada', text: 'La sección que buscas no existe.', action: '<a class="btn btn--primary" href="#/home">Volver al inicio</a>' })}</div>`;
}

/* ==========================================================================
   Arranque
   ========================================================================== */

async function bootstrap() {
  injectIconSprite();
  qs('#footer-year').textContent = new Date().getFullYear();
  setupHeader();
  setupGlobalActions();
  try {
    await initStore();
  } catch (error) {
    console.error(error);
    viewContainer().innerHTML = `<div class="container page">${emptyState({ iconName: 'alert', title: 'No se pudieron cargar los datos', text: 'Comprueba que el navegador permite LocalStorage e inténtalo de nuevo.' })}</div>`;
    return;
  }
  subscribe(() => {
    updateHeader();
    currentView?.update?.();
  });
  updateHeader();
  window.addEventListener('hashchange', route);
  if (!location.hash) replaceHash('#/home');
  route();
  if (!select.isPersistent()) {
    toast('Este navegador no permite guardar datos: los cambios se perderán al recargar la página.', { tone: 'warning', timeout: 9000 });
  }
}

if (location.protocol !== 'file:') bootstrap();
