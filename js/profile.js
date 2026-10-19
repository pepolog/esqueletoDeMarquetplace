/**
 * profile.js
 * ---------------------------------------------------------------------------
 * Perfil de usuario y ajustes: datos personales, foto de perfil, perfil
 * público, seguridad y privacidad, notificaciones, y ayuda y soporte.
 *
 * Las funciones que necesitan un servidor (cambio de contraseña, gestión
 * real de sesiones, eliminación definitiva de la cuenta, envío de
 * notificaciones) se muestran deshabilitadas y marcadas como «Requiere backend».
 */

import { APP_CONFIG } from './data.js';
import { icon } from './icons.js';
import { processImageFile, validateImageFile } from './media.js';
import { actions, select } from './store.js';
import {
  avatar, backendBadge, confirmDialog, handleError, notice, openModal, openReportDialog, panelSidebar, qs, renderField, sectionHeader,
  showFormErrors, stars, toast, withBusy,
} from './ui.js';
import { escapeHtml, formatDate, maskEmail, maskPhone, timeAgo } from './utils.js';

const SECTIONS = {
  personal: { label: 'Datos personales', icon: 'idcard', render: renderPersonal },
  photo: { label: 'Foto de perfil', icon: 'camera', render: renderPhoto },
  public: { label: 'Perfil público', icon: 'user', render: renderPublicSettings },
  security: { label: 'Seguridad y privacidad', icon: 'shield', render: renderSecurity },
  notifications: { label: 'Notificaciones', icon: 'bell', render: renderNotifications },
  help: { label: 'Ayuda y soporte', icon: 'help', render: renderHelp },
};

export function renderSettings(container, section, params) {
  const sectionId = SECTIONS[section] ? section : 'personal';
  container.innerHTML = `
    <div class="container panel-layout">
      <aside class="panel-layout__aside">
        ${panelSidebar({ title: 'Ajustes', items: Object.entries(SECTIONS).map(([id, info]) => ({ id, label: info.label, icon: info.icon, href: `#/settings/${id}` })), activeId: sectionId, ariaLabel: 'Secciones de ajustes' })}
      </aside>
      <section class="panel-layout__content" data-content></section>
    </div>`;
  // Los formularios de ajustes no se repintan con cada cambio de datos para no perder lo que se está escribiendo.
  return SECTIONS[sectionId].render(qs('[data-content]', container), params) ?? {};
}

/** Guarda cambios del perfil mostrando el estado de carga en el botón. */
async function saveProfile(button, patch, successMessage = 'Cambios guardados.') {
  return withBusy(button, async () => {
    try {
      await actions.updateProfile(patch);
      toast(successMessage);
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  });
}

/* ==========================================================================
   Datos personales
   ========================================================================== */

const COUNTRIES = [['España', 'España'], ['Portugal', 'Portugal'], ['Francia', 'Francia'], ['Andorra', 'Andorra'], ['México', 'México'], ['Argentina', 'Argentina'], ['Otro', 'Otro']];

function renderPersonal(container) {
  const user = select.currentUser();
  container.innerHTML = `
    ${sectionHeader('Datos personales', 'Información privada de tu cuenta. No se muestra en tu perfil público.')}
    ${notice(`Datos de contacto guardados: ${escapeHtml(maskEmail(user.email))}${user.phone ? ` · ${escapeHtml(maskPhone(user.phone))}` : ''}. En una versión real, cambiar el correo exigiría verificarlo.`)}
    <form id="personal-form" class="card panel-card" novalidate>
      <div class="form-grid">
        ${renderField({ name: 'firstName', label: 'Nombre', value: user.firstName, required: true, maxLength: 50, autocomplete: 'given-name' })}
        ${renderField({ name: 'lastName', label: 'Apellidos', value: user.lastName, required: true, maxLength: 80, autocomplete: 'family-name' })}
        ${renderField({ name: 'username', label: 'Nombre de usuario', value: user.username, required: true, maxLength: 20, help: '3–20 caracteres: letras minúsculas, números, «_» o «.».', autocomplete: 'username' })}
        ${renderField({ name: 'email', label: 'Correo electrónico', type: 'email', value: user.email, required: true, autocomplete: 'email' })}
        ${renderField({ name: 'phone', label: 'Teléfono', type: 'tel', value: user.phone, autocomplete: 'tel', placeholder: '+34 600 000 000' })}
        ${renderField({ name: 'birthDate', label: 'Fecha de nacimiento (opcional)', type: 'date', value: user.birthDate, autocomplete: 'bday', help: 'Solo para verificar la mayoría de edad.' })}
        ${renderField({ name: 'country', label: 'País', type: 'select', value: user.country, options: COUNTRIES, required: true })}
        ${renderField({ name: 'city', label: 'Ciudad', value: user.city, required: true, maxLength: 60, autocomplete: 'address-level2' })}
      </div>
      ${renderField({ name: 'address', label: 'Dirección (opcional)', value: user.address, maxLength: 120, autocomplete: 'street-address', help: 'Solo se usaría para envíos. Nunca se publica. No la introduzcas en esta demostración si no es necesario.' })}
      <p class="muted small">${icon('calendar', 'icon--xs')} Fecha de registro: ${formatDate(user.createdAt)}</p>
      <div class="form-actions"><button type="submit" class="btn btn--primary">Guardar cambios</button></div>
    </form>`;

  const form = qs('#personal-form', container);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((key) => { values[key] = values[key].trim(); });
    const errors = {};
    if (values.firstName.length < 2) errors.firstName = 'Indica tu nombre.';
    if (values.lastName.length < 2) errors.lastName = 'Indica tus apellidos.';
    if (!/^[a-z0-9_.]{3,20}$/.test(values.username)) errors.username = 'Usa entre 3 y 20 caracteres en minúscula: letras, números, «_» o «.».';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'Introduce un correo electrónico válido.';
    if (values.phone && !/^\+?[0-9 ]{9,16}$/.test(values.phone)) errors.phone = 'Introduce un teléfono válido (solo números y espacios, opcionalmente con prefijo +).';
    if (values.birthDate) {
      const birth = new Date(values.birthDate);
      const adultLimit = new Date();
      adultLimit.setFullYear(adultLimit.getFullYear() - 18);
      if (Number.isNaN(birth.getTime()) || birth > new Date()) errors.birthDate = 'Fecha no válida.';
      else if (birth > adultLimit) errors.birthDate = 'Debes ser mayor de edad para usar la plataforma.';
    }
    if (!values.country) errors.country = 'Selecciona un país.';
    if (values.city.length < 2) errors.city = 'Indica tu ciudad.';
    if (!showFormErrors(form, errors)) return;
    await saveProfile(qs('button[type="submit"]', form), values, 'Datos personales actualizados.');
  });
}

/* ==========================================================================
   Foto de perfil
   ========================================================================== */

function renderPhoto(container) {
  let pendingImage = null; // imagen elegida pero aún no guardada
  const AVATAR_MAX_MB = 2;

  const paint = () => {
    const user = select.currentUser();
    const preview = pendingImage ? { ...user, avatar: pendingImage } : user;
    container.innerHTML = `
      ${sectionHeader('Foto de perfil', 'Una foto ayuda a generar confianza. Se muestra en tus anuncios y mensajes.')}
      <div class="card panel-card photo-settings">
        <div class="photo-settings__preview">
          ${avatar(preview, 'xxl')}
          <p class="muted small">${pendingImage ? 'Vista previa (sin guardar)' : user.avatar ? 'Foto actual' : 'Avatar predeterminado con tus iniciales'}</p>
        </div>
        <div class="photo-settings__controls">
          <label class="btn btn--ghost" for="avatar-input">${icon('upload')}${user.avatar || pendingImage ? 'Cambiar imagen' : 'Subir imagen'}</label>
          <input id="avatar-input" type="file" accept="${APP_CONFIG.acceptedImageTypes.join(',')}" class="visually-hidden" aria-describedby="avatar-help" />
          <p id="avatar-help" class="field__help">JPG, PNG o WEBP. Máximo ${AVATAR_MAX_MB} MB. Se recorta en formato cuadrado.</p>
          <div class="photo-feedback" aria-live="polite" data-feedback></div>
          <div class="form-actions">
            ${pendingImage ? '<button type="button" class="btn btn--primary" data-save>Guardar foto</button><button type="button" class="btn btn--ghost" data-cancel>Cancelar</button>' : ''}
            ${user.avatar && !pendingImage ? `<button type="button" class="btn btn--danger-ghost" data-remove>${icon('trash')}Eliminar foto</button>` : ''}
          </div>
        </div>
      </div>
      ${notice('Demostración: la imagen se guarda reducida en este navegador. El almacenamiento definitivo de imágenes requerirá un servicio de almacenamiento o backend.')}`;

    const input = qs('#avatar-input', container);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const feedback = qs('[data-feedback]', container);
      const error = validateImageFile(file, { maxSizeMb: AVATAR_MAX_MB });
      if (error) {
        feedback.innerHTML = `<p class="field__error">${icon('alert', 'icon--xs')}${escapeHtml(error)}</p>`;
        input.value = '';
        return;
      }
      feedback.innerHTML = '<span class="spinner" aria-hidden="true"></span> Procesando imagen…';
      try {
        pendingImage = (await processImageFile(file, { maxDimension: 320, square: true, quality: 0.85 })).src;
        paint();
        qs('[data-save]', container)?.focus();
      } catch (processingError) {
        feedback.innerHTML = `<p class="field__error">${icon('alert', 'icon--xs')}${escapeHtml(processingError.message)}</p>`;
      }
    });
    qs('[data-save]', container)?.addEventListener('click', async (event) => {
      if (await saveProfile(event.currentTarget, { avatar: pendingImage }, 'Foto de perfil actualizada.')) {
        pendingImage = null;
        paint();
      }
    });
    qs('[data-cancel]', container)?.addEventListener('click', () => { pendingImage = null; paint(); });
    qs('[data-remove]', container)?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const ok = await confirmDialog({ title: 'Eliminar foto de perfil', message: 'Se mostrará el avatar predeterminado con tus iniciales.', confirmLabel: 'Eliminar', danger: true });
      if (ok && await saveProfile(button, { avatar: null }, 'Foto eliminada.')) paint();
    });
  };
  paint();
  return {};
}

/* ==========================================================================
   Perfil público
   ========================================================================== */

function renderPublicSettings(container) {
  const user = select.currentUser();
  const privacy = user.preferences.privacy;
  const rating = select.ratingSummary(user.id);
  const activeListings = select.listingsBySeller(user.id).filter((listing) => listing.status === 'active').length;
  container.innerHTML = `
    ${sectionHeader('Perfil público', 'Decide qué información ven los demás usuarios.', `<a href="#/profile" class="btn btn--ghost">${icon('eye')}Ver mi perfil público</a>`)}
    <form id="public-form" class="card panel-card" novalidate>
      <div class="form-grid">
        ${renderField({ name: 'displayName', label: 'Nombre público', value: user.displayName, required: true, maxLength: 40, help: 'Puede ser tu nombre o un alias.' })}
        ${renderField({ name: 'publicLocation', label: 'Ubicación pública (opcional)', value: user.publicLocation, maxLength: 60, help: 'Por ejemplo, tu ciudad o barrio.' })}
      </div>
      ${renderField({ name: 'bio', label: 'Descripción personal', type: 'textarea', value: user.bio, maxLength: 300, rows: 3 })}
      <fieldset class="fieldset">
        <legend class="fieldset__legend">Qué se muestra en tu perfil</legend>
        ${renderField({ name: 'showCity', label: 'Mostrar mi ubicación pública', type: 'checkbox', value: privacy.showCity })}
        ${renderField({ name: 'showJoinDate', label: 'Mostrar la fecha de incorporación', type: 'checkbox', value: privacy.showJoinDate })}
        ${renderField({ name: 'showRating', label: 'Mostrar mi valoración media y reseñas', type: 'checkbox', value: privacy.showRating })}
      </fieldset>
      <dl class="spec-list">
        <div><dt>Fecha de incorporación</dt><dd>${formatDate(user.createdAt)}</dd></div>
        <div><dt>Valoración media</dt><dd>${rating.count ? `${stars(rating.average)} (${rating.count})` : 'Sin reseñas todavía'}</dd></div>
        <div><dt>Anuncios activos</dt><dd>${activeListings}</dd></div>
      </dl>
      <div class="form-actions"><button type="submit" class="btn btn--primary">Guardar perfil público</button></div>
    </form>`;

  const form = qs('#public-form', container);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = form.elements.displayName.value.trim();
    const errors = {};
    if (displayName.length < 2) errors.displayName = 'El nombre público debe tener al menos 2 caracteres.';
    if (!showFormErrors(form, errors)) return;
    await saveProfile(qs('button[type="submit"]', form), {
      displayName,
      publicLocation: form.elements.publicLocation.value.trim(),
      bio: form.elements.bio.value.trim(),
      preferences: {
        ...user.preferences,
        privacy: { ...privacy, showCity: form.elements.showCity.checked, showJoinDate: form.elements.showJoinDate.checked, showRating: form.elements.showRating.checked },
      },
    }, 'Perfil público actualizado.');
  });
}

/* ==========================================================================
   Seguridad y privacidad
   ========================================================================== */

/**
 * Exporta en JSON los datos del usuario guardados en este navegador.
 * Intenta descargar el archivo y, además, muestra el contenido en una
 * ventana con botón de copiar: algunos navegadores o visores incrustados
 * bloquean las descargas iniciadas por script.
 */
function exportMyData() {
  const user = select.currentUser();
  const data = {
    exportedAt: new Date().toISOString(),
    note: 'Copia de los datos guardados en este navegador (demostración). Una exportación oficial requeriría backend.',
    user,
    listings: select.listingsBySeller(user.id, { includeDeleted: true }),
    ordersAsBuyer: select.ordersAsBuyer(user.id),
    ordersAsSeller: select.ordersAsSeller(user.id),
    favorites: select.favoritesOf(user.id),
    conversations: select.conversationsFor(user.id),
    reviewsReceived: select.reviewsFor(user.id),
    reports: select.reportsBy(user.id),
  };
  const json = JSON.stringify(data, null, 2);
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mis-datos-${user.username}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* la copia en pantalla sigue disponible */ }

  const { element } = openModal({
    title: 'Mis datos',
    size: 'lg',
    body: `
      <p class="muted small">Si la descarga no se ha iniciado, copia el contenido y guárdalo como <code>mis-datos-${escapeHtml(user.username)}.json</code>.</p>
      <label class="visually-hidden" for="export-json">Datos en formato JSON</label>
      <textarea id="export-json" class="code-area" rows="14" readonly>${escapeHtml(json)}</textarea>`,
    footer: '<button type="button" class="btn btn--ghost" data-modal-close>Cerrar</button><button type="button" class="btn btn--primary" data-copy>Copiar</button>',
  });
  const textarea = qs('#export-json', element);
  qs('[data-copy]', element).addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast('Datos copiados al portapapeles.');
    } catch {
      textarea.focus();
      textarea.select();
      toast('Selecciona el texto y cópialo con Ctrl+C (Cmd+C en Mac).', { tone: 'info' });
    }
  });
}

function renderSecurity(container) {
  const user = select.currentUser();
  const privacy = user.preferences.privacy;
  const browser = /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome/.test(navigator.userAgent) ? 'Chrome' : /Safari/.test(navigator.userAgent) ? 'Safari' : 'Navegador';
  const device = /Mobi|Android/i.test(navigator.userAgent) ? 'móvil' : 'ordenador';

  container.innerHTML = `
    ${sectionHeader('Seguridad y privacidad', 'Controla el acceso a tu cuenta y quién puede ver o contactar contigo.')}

    <section class="card panel-card">
      <div class="panel-card__header"><h2>${icon('lock')} Cambiar contraseña</h2>${backendBadge()}</div>
      <p class="muted">Esta demostración no tiene autenticación y <strong>no almacena contraseñas</strong>. El cambio de contraseña requiere un servidor que guarde las credenciales cifradas.</p>
      <form class="form-grid" aria-disabled="true">
        ${renderField({ name: 'currentPassword', label: 'Contraseña actual', type: 'password', disabled: true, autocomplete: 'current-password' })}
        ${renderField({ name: 'newPassword', label: 'Nueva contraseña', type: 'password', disabled: true, autocomplete: 'new-password' })}
      </form>
      <div class="form-actions"><button type="button" class="btn btn--primary" disabled>Actualizar contraseña</button></div>
    </section>

    <section class="card panel-card">
      <div class="panel-card__header"><h2>${icon('laptop')} Sesiones activas</h2>${backendBadge()}</div>
      <ul class="session-list">
        <li>${icon(device === 'móvil' ? 'message' : 'laptop')}<div><strong>${escapeHtml(browser)} en ${device}</strong><br /><small class="muted">Esta sesión · sesión de demostración local</small></div><span class="badge badge--success">Actual</span></li>
      </ul>
      <p class="muted small">La lista real de dispositivos y el cierre remoto de sesiones necesitan backend.</p>
      <button type="button" class="btn btn--ghost" disabled>Cerrar las demás sesiones</button>
    </section>

    <form id="privacy-form" class="card panel-card" novalidate>
      <h2>${icon('eye')} Visibilidad y comunicación</h2>
      ${renderField({ name: 'profileVisibility', label: 'Visibilidad del perfil', type: 'select', value: privacy.profileVisibility, required: true,
        options: [['public', 'Público: cualquiera puede verlo'], ['registered', 'Solo usuarios registrados'], ['private', 'Privado: solo yo']], help: 'Tus anuncios activos siguen siendo visibles en la marketplace.' })}
      ${renderField({ name: 'allowMessagesFrom', label: '¿Quién puede iniciar conversaciones contigo?', type: 'select', value: privacy.allowMessagesFrom, required: true,
        options: [['everyone', 'Cualquier usuario interesado en mis anuncios'], ['nobody', 'Nadie (solo conversaciones ya iniciadas)']] })}
      <div class="form-actions"><button type="submit" class="btn btn--primary">Guardar privacidad</button></div>
    </form>

    <section class="card panel-card">
      <h2>${icon('download')} Tus datos</h2>
      <p>Obtén una copia en formato JSON de tus datos guardados en este navegador: perfil, anuncios, pedidos, favoritos, mensajes y valoraciones.</p>
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-download>${icon('download')}Exportar mis datos</button></div>
      <p class="muted small">Una solicitud formal de acceso a datos (RGPD) se gestionaría desde el backend.</p>
    </section>

    <section class="card panel-card panel-card--danger">
      <div class="panel-card__header"><h2>${icon('trash')} Eliminar la cuenta</h2>${backendBadge()}</div>
      <p>La eliminación definitiva de una cuenta, con sus anuncios y datos personales, debe realizarse en el servidor y no puede simularse de forma fiable.</p>
      <p class="muted small">Si solo quieres empezar de cero en esta demostración, usa «Restablecer datos de prueba» en el menú de usuario.</p>
      <button type="button" class="btn btn--danger" disabled>Solicitar eliminación de la cuenta</button>
    </section>`;

  const form = qs('#privacy-form', container);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveProfile(qs('button[type="submit"]', form), {
      preferences: { ...user.preferences, privacy: { ...user.preferences.privacy, profileVisibility: form.elements.profileVisibility.value, allowMessagesFrom: form.elements.allowMessagesFrom.value } },
    }, 'Preferencias de privacidad guardadas.');
  });
  qs('[data-download]', container).addEventListener('click', exportMyData);
}

/* ==========================================================================
   Notificaciones
   ========================================================================== */

const NOTIFICATION_OPTIONS = [
  ['messages', 'Mensajes recibidos', 'Cuando alguien te escribe sobre un anuncio.'],
  ['newOrders', 'Nuevos pedidos', 'Cuando alguien compra o solicita alquilar uno de tus anuncios.'],
  ['saleStatus', 'Cambios en el estado de una venta', 'Aceptaciones, envíos, entregas y cancelaciones.'],
  ['favoritePriceDrops', 'Favoritos con cambios de precio', 'Cuando baja o sube el precio de algo que guardaste.'],
  ['listingAlerts', 'Alertas de anuncios', 'Nuevos anuncios que encajan con tus búsquedas.'],
  ['platformUpdates', 'Actualizaciones de la plataforma', 'Novedades y cambios en las condiciones.'],
];

function renderNotifications(container) {
  const user = select.currentUser();
  const preferences = user.preferences.notifications;
  container.innerHTML = `
    ${sectionHeader('Notificaciones', 'Elige qué avisos quieres recibir.')}
    ${notice('Tus preferencias se guardan en este navegador. El envío real de correos o notificaciones push requiere backend.')}
    <form id="notifications-form" class="card panel-card" novalidate>
      <ul class="toggle-list">
        ${NOTIFICATION_OPTIONS.map(([key, label, help]) => `
          <li>
            <label class="switch" for="notif-${key}">
              <span class="switch__text"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span>
              <input type="checkbox" id="notif-${key}" name="${key}" role="switch" ${preferences[key] ? 'checked' : ''} />
              <span class="switch__track" aria-hidden="true"></span>
            </label>
          </li>`).join('')}
      </ul>
      ${renderField({ name: 'channel', label: 'Canal preferido', type: 'select', value: preferences.channel, required: true, options: [['email', 'Correo electrónico'], ['push', 'Notificaciones push'], ['both', 'Ambos']] })}
      <div class="form-actions"><button type="submit" class="btn btn--primary">Guardar preferencias</button></div>
    </form>`;
  const form = qs('#notifications-form', container);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const notifications = Object.fromEntries(NOTIFICATION_OPTIONS.map(([key]) => [key, form.elements[key].checked]));
    notifications.channel = form.elements.channel.value;
    await saveProfile(qs('button[type="submit"]', form), { preferences: { ...user.preferences, notifications } }, 'Preferencias de notificación guardadas.');
  });
}

/* ==========================================================================
   Ayuda y soporte
   ========================================================================== */

const FAQ = [
  ['¿Cómo publico un anuncio?', 'Pulsa «Publicar anuncio», elige la categoría y sigue los 7 pasos del asistente. Puedes guardar un borrador y terminarlo más tarde desde «Mis anuncios».'],
  ['¿Qué diferencia hay entre vender y alquilar?', 'En una venta el artículo cambia de propietario y deja de estar disponible cuando se completa el pedido. En un alquiler indicas un precio por hora, día, semana o mes y los interesados solicitan fechas concretas.'],
  ['¿Cómo funciona una compra en esta demostración?', 'Al confirmar un pedido se crea una operación pendiente vinculada al anuncio, visible tanto en tu panel de comprador como en el panel del vendedor. No se realiza ningún pago.'],
  ['¿Puedo reservar fechas que ya están ocupadas?', 'No. Si el vendedor ya ha confirmado una reserva en esas fechas, la plataforma rechaza la solicitud. Las solicitudes pendientes no bloquean el calendario hasta que se confirman.'],
  ['¿Cómo pruebo la compra y la venta entre usuarios?', 'Desde el menú de usuario puedes cambiar de cuenta de demostración. Por ejemplo, crea un pedido como Laura y acéptalo después como el vendedor.'],
  ['¿Dónde se guardan mis datos?', 'En esta versión, solo en el almacenamiento local de tu navegador. Si borras los datos del sitio, se pierden. No introduzcas información sensible.'],
];

const LEGAL = {
  rules: ['Normas de publicación', [
    'Publica solo artículos o inmuebles que te pertenezcan o que estés autorizado a ofrecer.',
    'No se permiten productos ilegales, falsificaciones, armas, medicamentos ni animales.',
    'Las fotos deben corresponder al artículo real. No uses imágenes con datos personales.',
    'No incluyas teléfonos, correos ni direcciones completas en el título o la descripción.',
    'Los anuncios de alquiler de vehículos e inmuebles deben cumplir la normativa aplicable.',
  ]],
  terms: ['Condiciones de uso', [
    'Este prototipo es una demostración sin validez contractual.',
    'Las operaciones creadas no generan obligaciones de pago ni de entrega.',
    'La versión definitiva incluirá unas condiciones redactadas y revisadas por asesoría legal.',
  ]],
  privacy: ['Política de privacidad', [
    'Los datos introducidos se guardan exclusivamente en el LocalStorage de tu navegador.',
    'No se envían datos a ningún servidor ni a terceros.',
    'Puedes descargar tus datos desde Ajustes › Seguridad y privacidad, o borrarlos restableciendo los datos de prueba.',
  ]],
};

function renderHelp(container, params) {
  const openSection = params?.get('open');
  const paintReports = () => {
    const reports = select.reportsBy(select.currentUserId());
    return reports.length
      ? `<ul class="report-list">${reports.map((report) => `<li>${icon(report.type === 'listing' ? 'flag' : 'help', 'icon--xs')}<span><strong>${escapeHtml({ listing: 'Denuncia', problem: 'Problema', support: 'Consulta' }[report.type] ?? report.type)}</strong> · ${escapeHtml(report.details.slice(0, 80))}${report.details.length > 80 ? '…' : ''}</span><small class="muted">${timeAgo(report.createdAt)} · registrado localmente</small></li>`).join('')}</ul>`
      : '<p class="muted">No has enviado ninguna consulta ni denuncia.</p>';
  };

  container.innerHTML = `
    ${sectionHeader('Ayuda y soporte', 'Respuestas rápidas, normas de la plataforma y contacto.')}

    <section class="card panel-card" id="help-center">
      <h2>${icon('help')} Centro de ayuda</h2>
      <div class="help-topics">
        <a href="#/sell" class="help-topic">${icon('tag')}<span><strong>Vender</strong><small>Crear y gestionar anuncios</small></span></a>
        <a href="#/buyer/orders" class="help-topic">${icon('bag')}<span><strong>Comprar</strong><small>Pedidos y estados</small></span></a>
        <a href="#/buyer/rentals" class="help-topic">${icon('key')}<span><strong>Alquilar</strong><small>Reservas y fechas</small></span></a>
        <a href="#/settings/security" class="help-topic">${icon('shield')}<span><strong>Seguridad</strong><small>Privacidad y cuenta</small></span></a>
      </div>
    </section>

    <section class="card panel-card">
      <h2>Preguntas frecuentes</h2>
      <div class="accordion">
        ${FAQ.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}
      </div>
    </section>

    <section class="card panel-card">
      <h2>Normas y documentos legales</h2>
      <div class="accordion">
        ${Object.entries(LEGAL).map(([id, [title, items]]) => `
          <details id="legal-${id}" ${openSection === id ? 'open' : ''}><summary>${escapeHtml(title)}</summary><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>`).join('')}
      </div>
    </section>

    <form id="support-form" class="card panel-card" novalidate>
      <h2>${icon('message')} Contactar con soporte</h2>
      ${notice('Tu consulta se registrará solo en este navegador. La atención real por parte de un equipo de soporte requiere backend.')}
      ${renderField({ name: 'reason', label: 'Tema', type: 'select', required: true, options: [['account', 'Mi cuenta'], ['listing', 'Mis anuncios'], ['order', 'Un pedido o reserva'], ['payment', 'Pagos'], ['other', 'Otro']] })}
      ${renderField({ name: 'details', label: 'Mensaje', type: 'textarea', required: true, maxLength: 1000, help: 'Mínimo 10 caracteres.' })}
      <div class="form-actions">
        <button type="submit" class="btn btn--primary">Enviar consulta</button>
        <button type="button" class="btn btn--ghost" data-report-problem>${icon('flag')}Comunicar un problema</button>
      </div>
      <p class="muted small">Para denunciar un anuncio concreto, usa el enlace «Denunciar este anuncio» en su página.</p>
    </form>

    <section class="card panel-card">
      <h2>Mis consultas y denuncias</h2>
      <div data-reports>${paintReports()}</div>
    </section>`;

  if (openSection && LEGAL[openSection]) qs(`#legal-${openSection}`, container)?.scrollIntoView({ block: 'start' });

  const form = qs('#support-form', container);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const errors = {};
    if (!values.reason) errors.reason = 'Selecciona un tema.';
    if ((values.details ?? '').trim().length < 10) errors.details = 'Escribe al menos 10 caracteres.';
    if (!showFormErrors(form, errors)) return;
    await withBusy(qs('button[type="submit"]', form), async () => {
      try {
        await actions.createReport({ type: 'support', ...values });
        form.reset();
        toast('Consulta registrada localmente.');
      } catch (error) { handleError(error); }
    });
  });
  qs('[data-report-problem]', container).addEventListener('click', () => openReportDialog());

  return { update: () => { qs('[data-reports]', container).innerHTML = paintReports(); } };
}
