/**
 * wizard.js
 * ---------------------------------------------------------------------------
 * ASISTENTE DE PUBLICACIÓN DE ANUNCIOS (7 pasos), usado desde el panel de
 * vendedor tanto para crear como para editar anuncios.
 *
 * Funcionamiento de los formularios dinámicos:
 *  1. El estado del asistente (wizardState) guarda los datos en el mismo
 *     formato que espera la API, con rutas como «rental.period» o
 *     «attributes.mileage».
 *  2. Cada control del formulario tiene como atributo `name` su ruta. Un
 *     único listener (bindFormInputs) copia cualquier cambio al estado.
 *  3. La categoría elegida en el paso 1 decide, a través del esquema de
 *     data.js, qué operaciones, periodos de alquiler y campos específicos
 *     se muestran en los pasos siguientes.
 *  4. Los campos con showIf.operationType solo se pintan (y validan) para
 *     esa operación: por ejemplo, la fianza o la edad mínima del conductor
 *     solo aparecen si el vehículo se alquila.
 *  5. Al cambiar un control marcado con data-rerender (categoría,
 *     operación…) el paso se vuelve a dibujar para mostrar u ocultar campos.
 *
 * El estado vive en memoria del módulo: si el usuario sale a otra sección y
 * vuelve, el anuncio a medio crear sigue ahí.
 */

import { APP_CONFIG, CATEGORIES, DELIVERY_METHODS, getCategory, ITEM_CONDITIONS, OPERATION_LABELS, RENTAL_PERIODS } from './data.js';
import { icon } from './icons.js';
import { processImageFile, validateImageFile } from './media.js';
import { actions, select } from './store.js';
import {
  badge, conditionLabel, emptyState, formatAttribute, handleError, listingStatusBadge, notice, qs, qsa, renderField, sectionHeader, toast, withBusy,
} from './ui.js';
import { deepClone, escapeHtml, formatMoney, getPath, replaceHash, setPath } from './utils.js';
import { firstStepWithErrors, validateListing, validateListingStep, visibleCategoryFields, WIZARD_STEPS } from './validation.js';

/** Estado del asistente (persistente mientras la pestaña siga abierta). */
let wizardState = null;

/** Datos vacíos de un anuncio nuevo. */
function emptyListingData() {
  const user = select.currentUser();
  return {
    category: '',
    operationType: '',
    price: '',
    rental: { period: '', minDuration: '1', maxDuration: '', requirements: '' },
    title: '',
    description: '',
    condition: '',
    brand: '',
    model: '',
    availability: '',
    deliveryNotes: '',
    attributes: {},
    customAttributes: [],
    images: [],
    location: { city: user?.city ?? '', postalCode: '', zone: '' },
    delivery: { inPerson: false, shipping: false, pickup: false, agreed: false },
  };
}

/** Convierte un anuncio guardado al formato editable del asistente. */
function listingToData(listing) {
  const data = deepClone(listing);
  return {
    ...emptyListingData(),
    ...data,
    price: listing.price ?? '',
    rental: listing.rental
      ? { period: listing.rental.period, minDuration: String(listing.rental.minDuration ?? 1), maxDuration: listing.rental.maxDuration ? String(listing.rental.maxDuration) : '', requirements: listing.rental.requirements ?? '' }
      : { period: '', minDuration: '1', maxDuration: '', requirements: '' },
    condition: listing.condition ?? '',
  };
}

function createState({ mode, listing = null }) {
  return {
    mode, // 'create' | 'edit'
    listingId: listing?.id ?? null,
    originalStatus: listing?.status ?? null,
    step: 1,
    maxStepReached: mode === 'edit' ? 7 : 1,
    data: listing ? listingToData(listing) : emptyListingData(),
    errors: {},
    published: null, // anuncio resultante tras publicar
    ownerId: select.currentUserId(),
  };
}

/**
 * Punto de entrada: dibuja el asistente en `container`.
 * Si listingId se indica, se edita ese anuncio (solo si es del usuario).
 */
export function renderListingWizard(container, { listingId = null } = {}) {
  if (listingId) {
    const listing = select.listing(listingId);
    if (!listing || listing.deletedAt || listing.sellerId !== select.currentUserId()) {
      container.innerHTML = emptyState({ iconName: 'alert', title: 'No puedes editar este anuncio', text: 'No existe o pertenece a otro usuario.', action: '<a href="#/seller/listings" class="btn btn--primary">Ir a Mis anuncios</a>' });
      return {};
    }
    if (wizardState?.listingId !== listingId || wizardState.ownerId !== select.currentUserId() || wizardState.published) {
      wizardState = createState({ mode: 'edit', listing });
    }
  } else if (!wizardState || wizardState.mode !== 'create' || wizardState.ownerId !== select.currentUserId() || wizardState.published) {
    wizardState = createState({ mode: 'create' });
  }
  paintWizard(container);
  return {};
}

/* ==========================================================================
   Pintado general (cabecera, progreso, paso actual y botones)
   ========================================================================== */

function paintWizard(container) {
  const state = wizardState;
  if (state.published) {
    paintSuccess(container);
    return;
  }
  const isEditingPublished = state.mode === 'edit' && state.originalStatus !== 'draft';
  const title = state.mode === 'edit' ? 'Editar anuncio' : 'Publicar un anuncio';
  const resumeNotice = state.mode === 'create' && state.maxStepReached > 1
    ? `<button type="button" class="btn btn--ghost btn--sm" data-restart>${icon('refresh')}Empezar de nuevo</button>` : '';
  const errorCount = Object.keys(state.errors).length;

  container.innerHTML = `
    ${sectionHeader(title, state.mode === 'edit' ? `Estás editando «${state.data.title}».` : 'Completa los pasos. Puedes guardar un borrador en cualquier momento a partir del paso 3.', resumeNotice)}
    <div class="wizard card">
      <div class="wizard__progress">
        <p class="wizard__progress-label">Paso ${state.step} de ${WIZARD_STEPS.length}: <strong>${escapeHtml(WIZARD_STEPS[state.step - 1].title)}</strong></p>
        <div class="progress" role="progressbar" aria-label="Progreso del anuncio" aria-valuemin="1" aria-valuemax="${WIZARD_STEPS.length}" aria-valuenow="${state.step}">
          <span style="width:${(state.step / WIZARD_STEPS.length) * 100}%"></span>
        </div>
        <ol class="stepper">
          ${WIZARD_STEPS.map((step) => {
            const reachable = step.id <= state.maxStepReached;
            const status = step.id === state.step ? 'current' : step.id < state.step || (reachable && step.id !== state.step) ? 'done' : 'todo';
            return `<li class="stepper__item stepper__item--${status}">
              <button type="button" data-go-step="${step.id}" ${reachable ? '' : 'disabled'} ${step.id === state.step ? 'aria-current="step"' : ''}>
                <span class="stepper__num">${status === 'done' ? icon('check', 'icon--xs') : step.id}</span><span class="stepper__label">${escapeHtml(step.title)}</span>
              </button></li>`;
          }).join('')}
        </ol>
      </div>

      <form id="wizard-form" class="wizard__body" novalidate>
        ${errorCount ? `<div class="error-summary" role="alert" tabindex="-1">${icon('alert')}<div><strong>Revisa ${errorCount === 1 ? 'el campo marcado' : `los ${errorCount} campos marcados`}</strong> para continuar.</div></div>` : ''}
        ${renderStep(state.step)}
      </form>

      <footer class="wizard__footer">
        <div>${state.step > 1 ? `<button type="button" class="btn btn--ghost" data-prev>${icon('chevronLeft')}${state.step === 7 ? 'Volver a editar' : 'Atrás'}</button>` : ''}</div>
        <div class="wizard__footer-right">
          ${state.step >= 3 && !isEditingPublished ? '<button type="button" class="btn btn--ghost" data-save-draft>Guardar como borrador</button>' : ''}
          ${state.step < 7
            ? `<button type="button" class="btn btn--primary" data-next>Siguiente${icon('chevronRight')}</button>`
            : `<button type="button" class="btn btn--accent" data-publish>${icon('check')}${isEditingPublished ? 'Guardar cambios' : 'Publicar anuncio'}</button>`}
        </div>
      </footer>
    </div>`;

  bindWizard(container);
}

/** Cambia de paso y vuelve a pintar, llevando el foco al formulario. */
function goToStep(container, step) {
  wizardState.step = step;
  wizardState.maxStepReached = Math.max(wizardState.maxStepReached, step);
  paintWizard(container);
  const errorSummary = qs('.error-summary', container);
  (errorSummary ?? qs('.wizard__progress-label', container))?.scrollIntoView({ block: 'nearest' });
  if (errorSummary) qs('[aria-invalid="true"]', container)?.focus();
  else qs('#wizard-form input:not([type="hidden"]), #wizard-form select, #wizard-form textarea', container)?.focus({ preventScroll: true });
}

/** Valida el paso actual. Si hay errores, los muestra y devuelve false. */
function validateCurrentStep(container) {
  const errors = validateListingStep(wizardState.step, wizardState.data);
  wizardState.errors = errors;
  if (Object.keys(errors).length) {
    paintWizard(container);
    qs('[aria-invalid="true"]', container)?.focus() ?? qs('.error-summary', container)?.focus();
    return false;
  }
  return true;
}

function bindWizard(container) {
  const form = qs('#wizard-form', container);
  bindFormInputs(container, form);

  qs('[data-next]', container)?.addEventListener('click', () => {
    if (!validateCurrentStep(container)) return;
    goToStep(container, wizardState.step + 1);
  });
  qs('[data-prev]', container)?.addEventListener('click', () => {
    wizardState.errors = {};
    goToStep(container, wizardState.step - 1);
  });
  qsa('[data-go-step]', container).forEach((button) => button.addEventListener('click', () => {
    const target = Number(button.dataset.goStep);
    // Para avanzar saltando pasos hay que validar el actual.
    if (target > wizardState.step && !validateCurrentStep(container)) return;
    wizardState.errors = {};
    goToStep(container, target);
  }));
  qs('[data-restart]', container)?.addEventListener('click', () => {
    wizardState = createState({ mode: 'create' });
    paintWizard(container);
    toast('Formulario reiniciado.', { tone: 'info' });
  });
  qs('[data-save-draft]', container)?.addEventListener('click', (event) => saveDraft(container, event.currentTarget));
  qs('[data-publish]', container)?.addEventListener('click', (event) => publish(container, event.currentTarget));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    qs('[data-next]', container)?.click();
  });

  if (wizardState.step === 4) bindCustomAttributes(container);
  if (wizardState.step === 5) bindPhotos(container);
  qsa('[data-edit-step]', container).forEach((button) => button.addEventListener('click', () => goToStep(container, Number(button.dataset.editStep))));
}

/**
 * Enlaza todos los controles del formulario con el estado. Cada control usa
 * su atributo name como ruta dentro de wizardState.data.
 */
function bindFormInputs(container, form) {
  const handle = (event) => {
    const element = event.target;
    if (!element.name || element.dataset.ignore !== undefined) return;
    const value = element.type === 'checkbox' ? element.checked : element.value;
    setPath(wizardState.data, element.name, value);
    if (wizardState.errors[element.name]) {
      // Limpia el error del campo en cuanto el usuario lo corrige.
      delete wizardState.errors[element.name];
      element.removeAttribute('aria-invalid');
      element.closest('.field')?.classList.remove('has-error');
      qs(`#${element.id}-error`, container)?.remove();
    }
    if (event.type === 'change' && element.dataset.rerender !== undefined) {
      onStructuralChange(element.name);
      paintWizard(container);
      qs(`[name="${element.name}"]${element.type === 'radio' ? `[value="${element.value}"]` : ''}`, container)?.focus();
    }
  };
  form.addEventListener('input', handle);
  form.addEventListener('change', handle);
}

/**
 * Ajusta datos dependientes cuando cambia la categoría o la operación,
 * para no arrastrar campos que ya no aplican.
 */
function onStructuralChange(fieldName) {
  const data = wizardState.data;
  const category = getCategory(data.category);
  if (!category) return;
  if (fieldName === 'category') {
    data.attributes = {};
    data.customAttributes = [];
    data.operationType = category.operations.length === 1 ? category.operations[0] : '';
    data.rental.period = category.rentalPeriods.length === 1 ? category.rentalPeriods[0] : '';
    if (!category.basic.condition) data.condition = '';
    Object.keys(data.delivery).forEach((key) => { data.delivery[key] = category.deliveryOptions.length === 1 && category.deliveryOptions[0] === key; });
    wizardState.maxStepReached = 1;
  }
  if (fieldName === 'operationType' && data.operationType === 'rent' && !category.rentalPeriods.includes(data.rental.period)) {
    data.rental.period = category.rentalPeriods[0];
  }
}

/* ==========================================================================
   Pasos
   ========================================================================== */

/** Helper: pinta un campo leyendo valor y error del estado. */
function field(options) {
  const value = getPath(wizardState.data, options.name);
  return renderField({ ...options, value: value ?? '', error: wizardState.errors[options.name] });
}

/** Grupo de tarjetas de opción (radio) accesible. */
function optionCards({ name, legend, options, value, error, rerender = true, columns = '' }) {
  const errorId = `${name.replace(/\./g, '-')}-group-error`;
  return `
    <fieldset class="fieldset ${error ? 'has-error' : ''}" ${error ? `aria-describedby="${errorId}"` : ''}>
      <legend class="fieldset__legend">${escapeHtml(legend)}</legend>
      <div class="option-cards ${columns}">
        ${options.map((option) => `
          <label class="option-card ${String(value) === String(option.value) ? 'is-selected' : ''}">
            <input type="radio" name="${name}" value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'checked' : ''} ${rerender ? 'data-rerender' : ''} />
            ${option.icon ? `<span class="option-card__icon" style="--cat-hue:${option.hue ?? 215}">${icon(option.icon)}</span>` : ''}
            <span class="option-card__text"><strong>${escapeHtml(option.label)}</strong>${option.hint ? `<small>${escapeHtml(option.hint)}</small>` : ''}</span>
          </label>`).join('')}
      </div>
      ${error ? `<p class="field__error" id="${errorId}">${icon('alert', 'icon--xs')}${escapeHtml(error)}</p>` : ''}
    </fieldset>`;
}

function renderStep(step) {
  const renderers = { 1: renderStepCategory, 2: renderStepOperation, 3: renderStepBasics, 4: renderStepDetails, 5: renderStepPhotos, 6: renderStepLocation, 7: renderStepReview };
  return renderers[step]();
}

/* ---------- Paso 1: categoría ---------- */
function renderStepCategory() {
  return optionCards({
    name: 'category',
    legend: '¿Qué tipo de artículo o propiedad quieres publicar?',
    value: wizardState.data.category,
    error: wizardState.errors.category,
    columns: 'option-cards--categories',
    options: CATEGORIES.map((category) => ({
      value: category.id, label: category.name, icon: category.icon, hue: category.hue,
      hint: category.operations.length === 2 ? 'Venta o alquiler' : category.operations[0] === 'rent' ? 'Solo alquiler' : 'Venta',
    })),
  });
}

/* ---------- Paso 2: tipo de operación (+ condiciones de alquiler) ---------- */
function renderStepOperation() {
  const { data, errors } = wizardState;
  const category = getCategory(data.category);
  const period = RENTAL_PERIODS[data.rental.period];
  const isVehicleOrHousing = ['vehicles', 'realestate'].includes(category.vertical);
  let html = '';

  if (category.operations.length > 1) {
    html += optionCards({
      name: 'operationType',
      legend: isVehicleOrHousing ? '¿Quieres venderlo o alquilarlo?' : '¿Qué modalidad corresponde a tu anuncio?',
      value: data.operationType,
      error: errors.operationType,
      options: [
        { value: 'sale', label: 'Venta', icon: 'tag', hint: 'Transfieres la propiedad al comprador.' },
        { value: 'rent', label: 'Alquiler', icon: 'key', hint: 'Lo cedes temporalmente a cambio de un precio.' },
      ],
    });
  } else {
    html += notice(`La categoría <strong>${escapeHtml(category.name)}</strong> solo admite <strong>${OPERATION_LABELS[category.operations[0]].toLowerCase()}</strong>.`);
  }

  if (data.operationType === 'rent') {
    html += `
      <div class="wizard__group">
        <h3>Condiciones del alquiler</h3>
        ${category.rentNote ? notice(escapeHtml(category.rentNote)) : ''}
        ${category.rentalPeriods.length > 1 ? optionCards({
          name: 'rental.period',
          legend: '¿Se alquila por horas, días, semanas o meses?',
          value: data.rental.period,
          error: errors['rental.period'],
          columns: 'option-cards--compact',
          options: category.rentalPeriods.map((periodId) => ({ value: periodId, label: RENTAL_PERIODS[periodId].label })),
        }) : `<p class="muted">Periodicidad: <strong>${escapeHtml(period?.label ?? '')}</strong></p>`}
        <div class="field-row">
          ${field({ name: 'price', label: '¿Cuál es el precio del alquiler?', type: 'number', min: 1, required: true, unit: period ? `€${period.suffix}` : '€' })}
          ${field({ name: 'availability', label: '¿Qué disponibilidad tiene?', required: true, placeholder: 'p. ej. Fines de semana, de lunes a viernes…', maxLength: 120 })}
        </div>
        <div class="field-row">
          ${field({ name: 'rental.minDuration', label: '¿Cuál es la duración mínima?', type: 'number', min: 1, required: true, unit: period?.unitPlural ?? '' })}
          ${field({ name: 'rental.maxDuration', label: '¿Cuál es la duración máxima? (si procede)', type: 'number', min: 1, unit: period?.unitPlural ?? '', help: 'Déjalo vacío si no hay máximo.' })}
        </div>
        ${field({ name: 'rental.requirements', label: '¿Qué condiciones debe cumplir el arrendatario?', type: 'textarea', maxLength: 600, rows: 3, placeholder: 'Documentación, fianza, uso permitido…' })}
      </div>`;
  } else if (data.operationType === 'sale') {
    html += `<p class="muted">${icon('info', 'icon--xs')} Indicarás el precio de venta en el siguiente paso.</p>`;
  }
  return html;
}

/* ---------- Paso 3: información básica ---------- */
function renderStepBasics() {
  const { data } = wizardState;
  const category = getCategory(data.category);
  const isSale = data.operationType === 'sale';
  const specificCondition = !category.basic.condition;
  return `
    ${field({ name: 'title', label: 'Título del anuncio', required: true, maxLength: 80, placeholder: 'p. ej. Bicicleta de montaña talla M', help: 'Entre 5 y 80 caracteres. Sé claro y concreto.' })}
    ${field({ name: 'description', label: 'Descripción detallada', type: 'textarea', required: true, rows: 6, maxLength: 3000, help: 'Mínimo 20 caracteres. Incluye estado, uso, defectos y motivo de la venta.' })}
    <div class="field-row">
      ${isSale ? field({ name: 'price', label: 'Precio', type: 'number', min: 1, required: true, unit: '€' }) : ''}
      ${category.basic.condition ? field({ name: 'condition', label: 'Estado del artículo', type: 'select', required: true, options: ITEM_CONDITIONS }) : ''}
    </div>
    ${specificCondition ? `<p class="muted small">${icon('info', 'icon--xs')} El estado ${category.vertical === 'vehicles' ? 'del vehículo' : 'del inmueble'} se indica en el paso siguiente con campos específicos.</p>` : ''}
    ${category.basic.brand || category.basic.model ? `<div class="field-row">
      ${category.basic.brand ? field({ name: 'brand', label: 'Marca', required: category.basic.brand === 'required', maxLength: 40 }) : ''}
      ${category.basic.model ? field({ name: 'model', label: 'Modelo', required: category.basic.model === 'required', maxLength: 60 }) : ''}
    </div>` : ''}
    ${isSale ? field({ name: 'availability', label: 'Disponibilidad', maxLength: 120, placeholder: 'p. ej. Inmediata, a partir del día 15…' }) : ''}
    ${field({ name: 'deliveryNotes', label: 'Condiciones de entrega o recogida', type: 'textarea', rows: 2, maxLength: 300, placeholder: 'Horarios, gastos de envío, cómo se embala…' })}
    <p class="muted small">${icon('pin', 'icon--xs')} La ubicación se indica en el paso 6.</p>`;
}

/* ---------- Paso 4: campos específicos de la categoría ---------- */
function renderStepDetails() {
  const { data, errors } = wizardState;
  const category = getCategory(data.category);
  const fields = visibleCategoryFields(data);
  const renderSpecificField = (definition) => field({
    name: `attributes.${definition.key}`, label: definition.label, type: definition.type, required: definition.required,
    options: definition.options, unit: definition.unit, min: definition.min, max: definition.max, maxLength: definition.maxLength,
    placeholder: definition.placeholder, help: definition.help, rows: 3,
  });
  const generalFields = fields.filter((definition) => !definition.showIf);
  const operationFields = fields.filter((definition) => definition.showIf);

  let html = `<h3 class="wizard__step-title">${icon(category.icon)} Detalles de ${escapeHtml(category.name.toLowerCase())}</h3>`;
  if (generalFields.length) html += `<div class="form-grid">${generalFields.map(renderSpecificField).join('')}</div>`;
  if (operationFields.length) {
    html += `
      <div class="wizard__group">
        <h3>${data.operationType === 'rent' ? (category.vertical === 'vehicles' ? 'Condiciones de alquiler del vehículo' : 'Condiciones del alquiler') : 'Datos de la compraventa'}</h3>
        <div class="form-grid">${operationFields.map(renderSpecificField).join('')}</div>
      </div>`;
  }
  if (category.allowCustomAttributes) {
    const attributes = data.customAttributes.length ? data.customAttributes : [];
    html += `
      <div class="wizard__group">
        <h3>Atributos personalizados</h3>
        <p class="muted small">Añade características relevantes que no estén en los campos generales (máximo 10).</p>
        <ul class="custom-attributes">
          ${attributes.map((attribute, index) => `
            <li class="custom-attributes__row">
              ${renderField({ name: `customAttributes.${index}.label`, label: 'Característica', value: attribute.label, maxLength: 40, error: errors[`customAttributes.${index}.label`] })}
              ${renderField({ name: `customAttributes.${index}.value`, label: 'Valor', value: attribute.value, maxLength: 80, error: errors[`customAttributes.${index}.value`] })}
              <button type="button" class="icon-btn" data-remove-attribute="${index}" aria-label="Eliminar atributo ${index + 1}">${icon('trash')}</button>
            </li>`).join('')}
        </ul>
        <button type="button" class="btn btn--ghost btn--sm" data-add-attribute ${attributes.length >= 10 ? 'disabled' : ''}>${icon('plus')}Añadir atributo</button>
      </div>`;
  }
  if (!fields.length && !category.allowCustomAttributes) html += '<p class="muted">Esta categoría no tiene campos adicionales.</p>';
  return html;
}

function bindCustomAttributes(container) {
  qs('[data-add-attribute]', container)?.addEventListener('click', () => {
    wizardState.data.customAttributes.push({ label: '', value: '' });
    paintWizard(container);
    qs(`[name="customAttributes.${wizardState.data.customAttributes.length - 1}.label"]`, container)?.focus();
  });
  qsa('[data-remove-attribute]', container).forEach((button) => button.addEventListener('click', () => {
    wizardState.data.customAttributes.splice(Number(button.dataset.removeAttribute), 1);
    wizardState.errors = {};
    paintWizard(container);
    qs('[data-add-attribute]', container)?.focus();
  }));
}

/* ---------- Paso 5: fotografías ---------- */
function renderStepPhotos() {
  const { data, errors } = wizardState;
  const max = APP_CONFIG.maxImagesPerListing;
  const full = data.images.length >= max;
  return `
    <div class="photo-uploader ${errors.images ? 'has-error' : ''}">
      <label class="dropzone ${full ? 'is-disabled' : ''}" for="photo-input">
        ${icon('upload')}
        <strong>${full ? 'Has alcanzado el máximo de fotografías' : 'Selecciona o arrastra tus fotografías'}</strong>
        <small>JPG, PNG o WEBP · máximo ${APP_CONFIG.maxImageSizeMb} MB por foto · hasta ${max} fotos${APP_CONFIG.requireImageToPublish ? ' · al menos 1 para publicar' : ''}</small>
        <input id="photo-input" type="file" accept="${APP_CONFIG.acceptedImageTypes.join(',')}" multiple data-ignore ${full ? 'disabled' : ''} class="visually-hidden" aria-describedby="photo-help ${errors.images ? 'photo-error' : ''}" />
      </label>
      <p id="photo-help" class="field__help">${data.images.length}/${max} fotografías. La primera es la imagen principal. Usa las flechas para reordenarlas.</p>
      ${errors.images ? `<p class="field__error" id="photo-error">${icon('alert', 'icon--xs')}${escapeHtml(errors.images)}</p>` : ''}
      <div class="photo-feedback" aria-live="polite" data-photo-feedback></div>
      <ul class="photo-grid">
        ${data.images.map((image, index) => `
          <li class="photo-item ${index === 0 ? 'is-main' : ''}">
            <img src="${escapeHtml(image.src)}" alt="Fotografía ${index + 1}" />
            ${index === 0 ? '<span class="photo-item__badge">Principal</span>' : ''}
            <div class="photo-item__actions">
              <button type="button" class="icon-btn icon-btn--sm" data-photo-move="${index}:-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover fotografía ${index + 1} a la izquierda">${icon('chevronLeft')}</button>
              ${index > 0 ? `<button type="button" class="icon-btn icon-btn--sm" data-photo-main="${index}" aria-label="Usar fotografía ${index + 1} como principal">${icon('star')}</button>` : ''}
              <button type="button" class="icon-btn icon-btn--sm" data-photo-move="${index}:1" ${index === data.images.length - 1 ? 'disabled' : ''} aria-label="Mover fotografía ${index + 1} a la derecha">${icon('chevronRight')}</button>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-photo-remove="${index}" aria-label="Eliminar fotografía ${index + 1}">${icon('trash')}</button>
            </div>
          </li>`).join('')}
      </ul>
      ${notice('Demostración: las fotos se reducen y se guardan en este navegador. El almacenamiento definitivo de imágenes requiere un servicio de almacenamiento o backend.')}
    </div>`;
}

function bindPhotos(container) {
  const input = qs('#photo-input', container);
  const dropzone = qs('.dropzone', container);
  const feedback = qs('[data-photo-feedback]', container);

  /** Valida, procesa y añade los archivos seleccionados, informando de cada error. */
  const addFiles = async (files) => {
    const images = wizardState.data.images;
    const available = APP_CONFIG.maxImagesPerListing - images.length;
    const messages = [];
    const selected = [...files];
    if (selected.length > available) messages.push(`Solo se han añadido ${Math.max(available, 0)} fotos: el máximo es ${APP_CONFIG.maxImagesPerListing}.`);
    feedback.innerHTML = `<span class="spinner" aria-hidden="true"></span> Procesando ${Math.min(selected.length, available)} foto(s)…`;
    for (const file of selected.slice(0, Math.max(available, 0))) {
      const error = validateImageFile(file);
      if (error) { messages.push(error); continue; }
      try {
        images.push(await processImageFile(file));
      } catch (processingError) {
        messages.push(processingError.message);
      }
    }
    delete wizardState.errors.images;
    paintWizard(container);
    const newFeedback = qs('[data-photo-feedback]', container);
    newFeedback.innerHTML = messages.length ? `<ul class="error-list">${messages.map((message) => `<li>${icon('alert', 'icon--xs')}${escapeHtml(message)}</li>`).join('')}</ul>` : '';
    qs('#photo-input', container)?.focus();
  };

  input?.addEventListener('change', () => { if (input.files.length) addFiles(input.files); });
  dropzone?.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('is-dragging'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    if (!input.disabled && event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });

  const images = wizardState.data.images;
  qsa('[data-photo-move]', container).forEach((button) => button.addEventListener('click', () => {
    const [index, direction] = button.dataset.photoMove.split(':').map(Number);
    const target = index + direction;
    [images[index], images[target]] = [images[target], images[index]];
    paintWizard(container);
    qs(`[data-photo-move="${target}:${direction}"]`, container)?.focus() ?? qs(`[data-photo-move="${target}:${-direction}"]`, container)?.focus();
  }));
  qsa('[data-photo-main]', container).forEach((button) => button.addEventListener('click', () => {
    const [image] = images.splice(Number(button.dataset.photoMain), 1);
    images.unshift(image);
    paintWizard(container);
    toast('Imagen principal actualizada.', { tone: 'info', timeout: 2000 });
  }));
  qsa('[data-photo-remove]', container).forEach((button) => button.addEventListener('click', () => {
    images.splice(Number(button.dataset.photoRemove), 1);
    paintWizard(container);
    qs('#photo-input', container)?.focus();
  }));
}

/* ---------- Paso 6: ubicación y entrega ---------- */
function renderStepLocation() {
  const { data, errors } = wizardState;
  const category = getCategory(data.category);
  return `
    ${notice('Por tu seguridad, <strong>no publiques tu dirección completa</strong>. Indica solo la ciudad y una zona aproximada; la dirección exacta se comparte por mensaje cuando lo acordéis.', 'warning')}
    <div class="form-grid">
      ${field({ name: 'location.city', label: 'Ciudad', required: true, maxLength: 60, autocomplete: 'address-level2' })}
      ${field({ name: 'location.postalCode', label: 'Código postal (opcional)', maxLength: 10, autocomplete: 'postal-code' })}
      ${field({ name: 'location.zone', label: 'Zona aproximada', maxLength: 60, placeholder: 'Barrio o distrito', help: 'p. ej. «Ruzafa» o «Centro». Nunca calle y número.' })}
    </div>
    <fieldset class="fieldset ${errors.delivery ? 'has-error' : ''}">
      <legend class="fieldset__legend">¿Cómo se entrega?</legend>
      <div class="option-cards option-cards--compact">
        ${category.deliveryOptions.map((option) => `
          <label class="option-card option-card--check ${data.delivery[option] ? 'is-selected' : ''}">
            <input type="checkbox" name="delivery.${option}" ${data.delivery[option] ? 'checked' : ''} data-rerender />
            <span class="option-card__icon">${icon(DELIVERY_METHODS[option].icon)}</span>
            <span class="option-card__text"><strong>${escapeHtml(DELIVERY_METHODS[option].label)}</strong></span>
          </label>`).join('')}
      </div>
      ${errors.delivery ? `<p class="field__error">${icon('alert', 'icon--xs')}${escapeHtml(errors.delivery)}</p>` : ''}
    </fieldset>`;
}

/* ---------- Paso 7: revisión ---------- */
function renderStepReview() {
  const { data } = wizardState;
  const category = getCategory(data.category);
  const allErrors = validateListing(data, { mode: 'publish' });
  const period = RENTAL_PERIODS[data.rental.period];
  const isRent = data.operationType === 'rent';
  const specificRows = visibleCategoryFields(data)
    .map((definition) => [definition.label, formatAttribute(definition, definition.type === 'number' && data.attributes[definition.key] !== '' && data.attributes[definition.key] !== undefined ? Number(data.attributes[definition.key]) : data.attributes[definition.key])])
    .filter(([, value]) => value !== null);
  const customRows = (data.customAttributes ?? []).filter((item) => item.label && item.value).map((item) => [item.label, item.value]);
  const deliveryLabels = category.deliveryOptions.filter((option) => data.delivery[option]).map((option) => DELIVERY_METHODS[option].label);
  const section = (title, step, rows) => `
    <section class="review-section">
      <header><h3>${escapeHtml(title)}</h3><button type="button" class="link-btn" data-edit-step="${step}">${icon('edit', 'icon--xs')}Editar</button></header>
      <dl class="spec-list">${rows.filter(([, value]) => value !== '' && value !== null && value !== undefined).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    </section>`;
  const mainImage = data.images[0];

  return `
    ${Object.keys(allErrors).length ? `
      <div class="error-summary" role="alert">${icon('alert')}<div><strong>Faltan datos para publicar:</strong>
        <ul>${[...new Set(Object.keys(allErrors).map((key) => WIZARD_STEPS.find((step) => Object.keys(validateListingStep(step.id, data)).includes(key))?.id))].filter(Boolean).map((stepId) => `<li><button type="button" class="link-btn" data-edit-step="${stepId}">Paso ${stepId}: ${escapeHtml(WIZARD_STEPS[stepId - 1].title)}</button></li>`).join('')}</ul>
      </div></div>` : notice('Así verán tu anuncio los demás usuarios. Revisa los datos antes de publicar.')}
    <div class="review">
      <div class="review__preview">
        <article class="listing-card listing-card--preview">
          <div class="listing-card__media">
            ${mainImage ? `<img src="${escapeHtml(mainImage.src)}" alt="Imagen principal del anuncio" />` : `<div class="listing-card__noimg">${icon('image')}<span>Sin fotografía</span></div>`}
            <span class="listing-card__op listing-card__op--${data.operationType}">${OPERATION_LABELS[data.operationType] ?? ''}</span>
          </div>
          <div class="listing-card__body">
            <p class="listing-card__price">${formatMoney(data.price)}${isRent && period ? `<small>${period.suffix}</small>` : ''}</p>
            <h3 class="listing-card__title">${escapeHtml(data.title || 'Sin título')}</h3>
            <p class="listing-card__meta">${icon('pin', 'icon--xs')}${escapeHtml(data.location.city || '—')} · ${escapeHtml(category.shortName)}</p>
          </div>
        </article>
        ${data.images.length > 1 ? `<p class="muted small">${data.images.length} fotografías</p>` : ''}
      </div>
      <div class="review__details">
        ${section('Categoría y operación', 1, [['Categoría', category.name], ['Operación', OPERATION_LABELS[data.operationType] ?? '—'],
          ...(isRent ? [['Periodicidad', period?.label], ['Duración mínima', `${data.rental.minDuration} ${period?.unitPlural ?? ''}`], ['Duración máxima', data.rental.maxDuration ? `${data.rental.maxDuration} ${period?.unitPlural ?? ''}` : 'Sin límite'], ['Requisitos', data.rental.requirements]] : [])])}
        ${section('Información básica', 3, [['Título', data.title], ['Precio', `${formatMoney(data.price)}${isRent && period ? period.suffix : ''}`], ['Estado', conditionLabel(data.condition)], ['Marca', data.brand], ['Modelo', data.model], ['Disponibilidad', data.availability], ['Entrega / recogida', data.deliveryNotes]])}
        <section class="review-section"><header><h3>Descripción</h3><button type="button" class="link-btn" data-edit-step="3">${icon('edit', 'icon--xs')}Editar</button></header><p class="prewrap">${escapeHtml(data.description)}</p></section>
        ${specificRows.length || customRows.length ? section('Detalles', 4, [...specificRows, ...customRows]) : ''}
        ${section('Ubicación y entrega', 6, [['Ciudad', data.location.city], ['Código postal', data.location.postalCode], ['Zona', data.location.zone], ['Entrega', deliveryLabels.join(', ')]])}
        ${isEditingPublishedNotice()}
      </div>
    </div>`;
}

function isEditingPublishedNotice() {
  if (wizardState.mode !== 'edit') return '';
  const hasOrders = select.ordersAsSeller(select.currentUserId()).some((order) => order.listingId === wizardState.listingId);
  return hasOrders ? notice('Este anuncio tiene pedidos asociados. Los pedidos existentes conservan el importe y las condiciones con las que se crearon.') : '';
}

/* ==========================================================================
   Guardar y publicar
   ========================================================================== */

/** Si la API devuelve errores de validación, lleva al primer paso con errores. */
function showApiValidationErrors(container, error) {
  if (error?.code === 'validation' && error.details) {
    wizardState.errors = error.details;
    const step = firstStepWithErrors(wizardState.data) ?? wizardState.step;
    wizardState.step = step;
    paintWizard(container);
    qs('[aria-invalid="true"]', container)?.focus();
  }
  handleError(error);
}

async function saveDraft(container, button) {
  await withBusy(button, async () => {
    try {
      const listing = wizardState.listingId
        ? await actions.updateListing(wizardState.listingId, wizardState.data)
        : await actions.createListing(wizardState.data, { status: 'draft' });
      // A partir de aquí se edita el mismo borrador (evita crear duplicados).
      wizardState.listingId = listing.id;
      wizardState.mode = 'edit';
      wizardState.originalStatus = 'draft';
      wizardState.errors = {};
      toast('Borrador guardado. Lo encontrarás en «Mis anuncios».');
      replaceHash(`#/seller/edit/${listing.id}`);
    } catch (error) { showApiValidationErrors(container, error); }
  });
}

async function publish(container, button) {
  const errors = validateListing(wizardState.data, { mode: 'publish' });
  if (Object.keys(errors).length) {
    wizardState.errors = errors;
    wizardState.step = firstStepWithErrors(wizardState.data);
    paintWizard(container);
    qs('[aria-invalid="true"]', container)?.focus();
    toast('Faltan datos obligatorios. Te llevamos al paso correspondiente.', { tone: 'warning' });
    return;
  }
  await withBusy(button, async () => {
    try {
      const listing = wizardState.listingId
        ? await actions.updateListing(wizardState.listingId, wizardState.data, { publish: true })
        : await actions.createListing(wizardState.data, { status: 'active' });
      wizardState.published = { listing, wasEdit: wizardState.mode === 'edit' && wizardState.originalStatus !== 'draft' };
      paintWizard(container);
      qs('.wizard-success h2', container)?.focus();
    } catch (error) { showApiValidationErrors(container, error); }
  });
}

/** Pantalla de confirmación tras publicar o guardar cambios. */
function paintSuccess(container) {
  const { listing, wasEdit } = wizardState.published;
  const category = getCategory(listing.category);
  container.innerHTML = `
    <div class="wizard-success card">
      <span class="wizard-success__icon">${icon('check')}</span>
      <h2 tabindex="-1">${wasEdit ? 'Cambios guardados' : '¡Anuncio publicado!'}</h2>
      <p>«${escapeHtml(listing.title)}» ${wasEdit ? 'se ha actualizado' : 'ya aparece en la marketplace'}. ${listingStatusBadge(listing.status)} ${badge(category.name)}</p>
      <p class="muted small">Registrado en el almacenamiento local de este navegador (sin servidor).</p>
      <div class="wizard-success__actions">
        <a href="#/listing/${listing.id}" class="btn btn--primary">${icon('eye')}Ver anuncio</a>
        <a href="#/seller/listings" class="btn btn--ghost">Ir a Mis anuncios</a>
        <a href="#/explore?category=${listing.category}" class="btn btn--ghost">Ver en ${escapeHtml(category.shortName)}</a>
        <button type="button" class="btn btn--ghost" data-new-listing>${icon('plus')}Publicar otro</button>
      </div>
    </div>`;
  qs('[data-new-listing]', container).addEventListener('click', () => {
    wizardState = createState({ mode: 'create' });
    if (location.hash !== '#/seller/new') replaceHash('#/seller/new');
    paintWizard(container);
  });
}
