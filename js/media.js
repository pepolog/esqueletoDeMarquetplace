/**
 * media.js
 * ---------------------------------------------------------------------------
 * Validación y preparación de imágenes subidas desde el dispositivo.
 *
 * ⚠️ SOLUCIÓN LOCAL DE DEMOSTRACIÓN: las imágenes se reducen y se guardan
 * como "data URL" dentro de LocalStorage (límite habitual ≈ 5 MB por sitio).
 * En producción deben subirse a un servicio de almacenamiento (S3, Cloud
 * Storage…) a través del backend, que devolvería una URL pública.
 */

import { APP_CONFIG } from './data.js';
import { createId } from './utils.js';

const TYPE_NAMES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' };

/** Comprueba tipo y tamaño. Devuelve un mensaje de error o null si el archivo es válido. */
export function validateImageFile(file, { maxSizeMb = APP_CONFIG.maxImageSizeMb } = {}) {
  if (!APP_CONFIG.acceptedImageTypes.includes(file.type)) {
    return `«${file.name}»: formato no permitido. Usa ${Object.values(TYPE_NAMES).join(', ')}.`;
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `«${file.name}»: pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${maxSizeMb} MB.`;
  }
  return null;
}

/** Carga un archivo como elemento <img>. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`«${file.name}» no es una imagen válida o está dañada.`)); };
    image.src = url;
  });
}

/**
 * Reduce la imagen para que su lado mayor no supere maxDimension y la
 * convierte a JPEG comprimido. Devuelve { id, src, alt }.
 */
export async function processImageFile(file, { maxDimension = APP_CONFIG.imageMaxDimension, quality = 0.8, square = false } = {}) {
  const image = await loadImage(file);
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (square) {
    const side = Math.min(sourceWidth, sourceHeight);
    sourceX = (sourceWidth - side) / 2;
    sourceY = (sourceHeight - side) / 2;
    sourceWidth = side;
    sourceHeight = side;
  }
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return { id: createId('img'), src: canvas.toDataURL('image/jpeg', quality), alt: '' };
}
