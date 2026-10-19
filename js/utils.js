/**
 * utils.js
 * ---------------------------------------------------------------------------
 * Funciones auxiliares puras (sin acceso al DOM ni al estado): formateo,
 * escapado de HTML, fechas, identificadores y acceso a rutas de objetos.
 */

import { APP_CONFIG } from './data.js';

/** Escapa texto antes de insertarlo en HTML. Todo dato de usuario debe pasar por aquí. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const priceFormatter = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: 'currency',
  currency: APP_CONFIG.currency,
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formatea un importe en la moneda configurada (p. ej. «16.900 €»). */
export function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === '' || Number.isNaN(Number(amount))) return '—';
  return priceFormatter.format(Number(amount));
}

/** Formatea una fecha ISO como «19 oct 2026». */
export function formatDate(iso, options = {}) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(APP_CONFIG.locale, { day: 'numeric', month: 'short', year: 'numeric', ...options });
}

/** Formatea fecha y hora. */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${formatDate(iso)}, ${date.toLocaleTimeString(APP_CONFIG.locale, { hour: '2-digit', minute: '2-digit' })}`;
}

/** Texto relativo breve: «hace 3 h», «hace 2 días». */
export function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  return formatDate(iso);
}

/** Genera un identificador único con prefijo legible. */
export function createId(prefix) {
  const random = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replaceAll('-', '')
    .slice(0, 12);
  return `${prefix}_${random}`;
}

/**
 * Acceso al almacenamiento del navegador que nunca lanza excepciones.
 * En modo privado, con los datos del sitio bloqueados o dentro de algunos
 * marcos incrustados, localStorage/sessionStorage pueden no estar disponibles.
 */
export const safeStorage = {
  get(area, key) {
    try { return globalThis[area]?.getItem(key) ?? null; } catch { return null; }
  },
  set(area, key, value) {
    try { globalThis[area].setItem(key, value); return true; } catch { return false; }
  },
  remove(area, key) {
    try { globalThis[area].removeItem(key); } catch { /* sin almacenamiento: nada que borrar */ }
  },
};

/** Sustituye el hash de la URL sin añadir historial ni disparar el enrutador. */
export function replaceHash(hash) {
  try { history.replaceState(null, '', hash); } catch { /* entornos que no permiten la History API */ }
}

/** Copia profunda de datos serializables (los datos de la app siempre lo son). */
export function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Lee una propiedad anidada a partir de una ruta «a.b.c». */
export function getPath(object, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

/** Escribe una propiedad anidada a partir de una ruta «a.b.c», creando objetos intermedios. */
export function setPath(object, path, value) {
  const keys = path.split('.');
  let target = object;
  keys.slice(0, -1).forEach((key) => {
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

/** Retrasa la ejecución de una función hasta que dejen de producirse llamadas. */
export function debounce(fn, waitMs = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Fecha ISO de hoy en formato AAAA-MM-DD (hora local). */
export function todayIsoDate() {
  const now = new Date();
  return toIsoDate(now);
}

/** Convierte un Date a «AAAA-MM-DD» en hora local. */
export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Iniciales para avatares por defecto. */
export function initials(name) {
  return String(name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

/** Oculta parcialmente un correo: «la***@example.com». */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email ?? '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

/** Oculta parcialmente un teléfono dejando los 3 últimos dígitos. */
export function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\s/g, '');
  return `${digits.slice(0, 3)} *** *** ${digits.slice(-3)}`;
}
