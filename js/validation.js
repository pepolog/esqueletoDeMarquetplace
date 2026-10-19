/**
 * validation.js
 * ---------------------------------------------------------------------------
 * Reglas de validación de anuncios, compartidas por el asistente de
 * publicación (para mostrar errores campo a campo) y por la API local (que
 * vuelve a validar antes de guardar, como haría un servidor real).
 *
 * Las funciones devuelven un objeto { 'ruta.del.campo': 'mensaje' }.
 * Un objeto vacío significa que no hay errores.
 */

import { APP_CONFIG, getCategory } from './data.js';

export const WIZARD_STEPS = [
  { id: 1, title: 'Categoría' },
  { id: 2, title: 'Operación' },
  { id: 3, title: 'Información básica' },
  { id: 4, title: 'Detalles' },
  { id: 5, title: 'Fotografías' },
  { id: 6, title: 'Ubicación y entrega' },
  { id: 7, title: 'Revisión' },
];

const isEmpty = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Indica si un campo específico de categoría aplica a la operación elegida. */
export function isFieldVisible(field, listingData) {
  return !field.showIf?.operationType || field.showIf.operationType === listingData.operationType;
}

/** Campos específicos visibles para la categoría y operación actuales. */
export function visibleCategoryFields(listingData) {
  const category = getCategory(listingData.category);
  return category ? category.fields.filter((field) => isFieldVisible(field, listingData)) : [];
}

/** Valida un número con límites opcionales. Devuelve un mensaje o null. */
function checkNumber(value, { min, max, label, required, integer = false }) {
  if (isEmpty(value)) return required ? `Indica ${label.toLowerCase()}.` : null;
  const number = Number(value);
  if (!Number.isFinite(number)) return `${label} debe ser un número.`;
  if (integer && !Number.isInteger(number)) return `${label} debe ser un número entero.`;
  if (min !== undefined && number < min) return `${label} no puede ser inferior a ${min}.`;
  if (max !== undefined && number > max) return `${label} no puede ser superior a ${max}.`;
  return null;
}

/** Detecta textos que parecen una dirección completa (calle + número). */
function looksLikeFullAddress(text) {
  return /\b(calle|c\/|avda|avenida|plaza|paseo|carrer|n[ºo°]\.?)\b/i.test(text) && /\d/.test(text);
}

/** Validaciones de cada paso del asistente. */
const stepValidators = {
  1(data, errors) {
    if (!getCategory(data.category)) errors.category = 'Selecciona una categoría para continuar.';
  },

  2(data, errors) {
    const category = getCategory(data.category);
    if (!category) return;
    if (!category.operations.includes(data.operationType)) {
      errors.operationType = 'Selecciona si quieres vender o alquilar.';
      return;
    }
    if (data.operationType !== 'rent') return;

    const rental = data.rental ?? {};
    if (!category.rentalPeriods.includes(rental.period)) errors['rental.period'] = 'Indica la periodicidad del alquiler.';
    const priceError = checkNumber(data.price, { label: 'El precio del alquiler', min: 1, max: 1_000_000, required: true });
    if (priceError) errors.price = priceError;
    const minError = checkNumber(rental.minDuration, { label: 'La duración mínima', min: 1, max: 1000, required: true, integer: true });
    if (minError) errors['rental.minDuration'] = minError;
    const maxError = checkNumber(rental.maxDuration, { label: 'La duración máxima', min: 1, max: 1000, integer: true });
    if (maxError) errors['rental.maxDuration'] = maxError;
    else if (!minError && !isEmpty(rental.maxDuration) && Number(rental.maxDuration) < Number(rental.minDuration)) {
      errors['rental.maxDuration'] = 'La duración máxima no puede ser menor que la mínima.';
    }
    if (isEmpty(data.availability)) errors.availability = 'Describe la disponibilidad (p. ej. «Fines de semana»).';
    if ((rental.requirements ?? '').length > 600) errors['rental.requirements'] = 'Máximo 600 caracteres.';
  },

  3(data, errors) {
    const category = getCategory(data.category);
    if (!category) return;
    const title = (data.title ?? '').trim();
    if (title.length < 5) errors.title = 'El título debe tener al menos 5 caracteres.';
    else if (title.length > 80) errors.title = 'El título no puede superar los 80 caracteres.';

    const description = (data.description ?? '').trim();
    if (description.length < 20) errors.description = 'Describe el artículo con al menos 20 caracteres.';
    else if (description.length > 3000) errors.description = 'La descripción no puede superar los 3000 caracteres.';

    if (data.operationType === 'sale') {
      const priceError = checkNumber(data.price, { label: 'El precio', min: 1, max: 100_000_000, required: true });
      if (priceError) errors.price = priceError;
    }
    if (category.basic.condition && isEmpty(data.condition)) errors.condition = 'Selecciona el estado del artículo.';
    if (category.basic.brand === 'required' && isEmpty(data.brand)) errors.brand = 'Indica la marca.';
    if (category.basic.model === 'required' && isEmpty(data.model)) errors.model = 'Indica el modelo.';
    if ((data.deliveryNotes ?? '').length > 300) errors.deliveryNotes = 'Máximo 300 caracteres.';
  },

  4(data, errors) {
    visibleCategoryFields(data).forEach((field) => {
      const value = data.attributes?.[field.key];
      const path = `attributes.${field.key}`;
      if (field.type === 'checkbox') return;
      if (field.type === 'number') {
        const error = checkNumber(value, { label: field.label, min: field.min, max: field.max, required: field.required });
        if (error) errors[path] = error;
        return;
      }
      if (field.required && isEmpty(value)) {
        errors[path] = field.type === 'select' ? `Selecciona: ${field.label.toLowerCase()}.` : `Completa: ${field.label.toLowerCase()}.`;
        return;
      }
      if (field.maxLength && String(value ?? '').length > field.maxLength) errors[path] = `Máximo ${field.maxLength} caracteres.`;
      if (field.type === 'select' && !isEmpty(value) && !field.options.some(([optionValue]) => optionValue === String(value))) {
        errors[path] = 'Selecciona una opción válida.';
      }
      if (field.type === 'date' && !isEmpty(value) && Number.isNaN(new Date(value).getTime())) errors[path] = 'Fecha no válida.';
    });

    const category = getCategory(data.category);
    if (category?.allowCustomAttributes) {
      (data.customAttributes ?? []).forEach((attribute, index) => {
        const label = (attribute.label ?? '').trim();
        const value = (attribute.value ?? '').trim();
        if (!label && !value) return;
        if (!label) errors[`customAttributes.${index}.label`] = 'Indica el nombre del atributo.';
        if (!value) errors[`customAttributes.${index}.value`] = 'Indica el valor del atributo.';
      });
    }
  },

  5(data, errors, { forPublish = true } = {}) {
    const images = data.images ?? [];
    if (forPublish && APP_CONFIG.requireImageToPublish && images.length === 0) errors.images = 'Añade al menos una fotografía para publicar el anuncio.';
    if (images.length > APP_CONFIG.maxImagesPerListing) errors.images = `Puedes subir como máximo ${APP_CONFIG.maxImagesPerListing} fotografías.`;
  },

  6(data, errors) {
    const category = getCategory(data.category);
    const city = (data.location?.city ?? '').trim();
    if (city.length < 2) errors['location.city'] = 'Indica la ciudad.';
    const postalCode = (data.location?.postalCode ?? '').trim();
    if (postalCode && !/^[A-Za-z0-9 -]{3,10}$/.test(postalCode)) errors['location.postalCode'] = 'Código postal no válido.';
    const zone = (data.location?.zone ?? '').trim();
    if (zone.length > 60) errors['location.zone'] = 'Máximo 60 caracteres.';
    else if (looksLikeFullAddress(zone)) errors['location.zone'] = 'Indica solo una zona aproximada (barrio, distrito). No publiques tu dirección completa.';
    if (category && !category.deliveryOptions.some((option) => data.delivery?.[option])) {
      errors.delivery = 'Selecciona al menos una modalidad de entrega.';
    }
  },

  7() {},
};

/** Valida un paso concreto del asistente. */
export function validateListingStep(step, data, options) {
  const errors = {};
  stepValidators[step]?.(data, errors, options);
  return errors;
}

/**
 * Valida el anuncio completo.
 * - mode 'publish': todas las reglas.
 * - mode 'draft': solo lo imprescindible para poder guardarlo y recuperarlo.
 */
export function validateListing(data, { mode = 'publish' } = {}) {
  if (mode === 'draft') {
    const errors = validateListingStep(1, data);
    if ((data.title ?? '').trim().length < 3) errors.title = 'Para guardar un borrador indica al menos un título (3 caracteres).';
    return errors;
  }
  return WIZARD_STEPS.reduce((errors, step) => Object.assign(errors, validateListingStep(step.id, data, { forPublish: true })), {});
}

/** Primer paso del asistente que contiene alguno de los errores indicados. */
export function firstStepWithErrors(data) {
  return WIZARD_STEPS.find((step) => Object.keys(validateListingStep(step.id, data)).length > 0)?.id ?? null;
}
