/**
 * tests/e2e.mjs
 * ---------------------------------------------------------------------------
 * Prueba de extremo a extremo de los escenarios de verificación del proyecto
 * (crear anuncios de cada tipo, editar/pausar, favoritos, pedidos entre
 * cuentas, solapes de reservas, persistencia tras recargar…).
 *
 * Uso (con el servidor local arrancado en la raíz del repositorio):
 *   npm install --no-save playwright && npx playwright install chromium
 *   BASE_URL=http://localhost:8080/ node tests/e2e.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQklEQVR4nO3PQQ0AIBDAMMC/5+OPAvYKkLzr1tm5+gT8AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8nQCpAAFeeZqUAAAAAElFTkSuQmCC', 'base64');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const log = (...a) => console.log('✔', ...a);

const go = async (hash) => { await page.evaluate((h) => { if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; }, hash); await page.waitForTimeout(300); };
const next = async () => { await page.click('[data-next]'); await page.waitForTimeout(80); };
const pickCard = (name, value) => page.locator(`label.option-card:has(input[name="${name}"][value="${value}"])`).click();
async function setField(name, value) {
  const el = page.locator(`#view [name="${name}"], .modal [name="${name}"]`).first();
  const tag = await el.evaluate((n) => n.tagName + ':' + n.type);
  if (tag.startsWith('SELECT')) await el.selectOption(String(value));
  else if (tag.endsWith('checkbox')) { if (value) await el.check(); else await el.uncheck(); }
  else await el.fill(String(value));
}
async function stepLabel() { return (await page.locator('.wizard__progress-label').textContent()).trim(); }

async function createListing(o) {
  await go('#/sell');
  if (await page.locator('[data-restart]').count()) await page.click('[data-restart]');
  await pickCard('category', o.category);
  await next();
  if (o.op && await page.locator('input[name="operationType"]').count()) await pickCard('operationType', o.op);
  if (o.op === 'rent') {
    if (o.period && await page.locator('input[name="rental.period"]').count()) await pickCard('rental.period', o.period);
    await setField('price', o.price);
    await setField('availability', o.availability ?? 'Todos los días');
    await setField('rental.minDuration', o.minDuration ?? 1);
  }
  if (o.onStep2) await o.onStep2();
  await next();
  assert.match(await stepLabel(), /Paso 3/);
  await setField('title', o.title);
  await setField('description', o.description ?? `${o.title}. Descripción de prueba suficientemente larga.`);
  if (o.op !== 'rent') await setField('price', o.price);
  for (const [k, v] of Object.entries(o.basic ?? {})) await setField(k, v);
  await next();
  assert.match(await stepLabel(), /Paso 4/);
  if (o.onStep4) await o.onStep4();
  for (const [k, v] of Object.entries(o.attrs ?? {})) await setField(`attributes.${k}`, v);
  await next();
  assert.match(await stepLabel(), /Paso 5/, 'should reach photos');
  await page.setInputFiles('#photo-input', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.photo-item');
  await next();
  assert.match(await stepLabel(), /Paso 6/);
  await setField('location.city', o.city ?? 'Zaragoza');
  await setField('location.zone', o.zone ?? 'Centro');
  for (const d of o.delivery ?? []) {
    const box = page.locator(`input[name="delivery.${d}"]`);
    if (!(await box.isChecked())) await page.locator(`label.option-card:has(input[name="delivery.${d}"])`).click();
  }
  await next();
  assert.match(await stepLabel(), /Paso 7/);
  await page.click('[data-publish]');
  await page.waitForSelector('.wizard-success');
  const href = await page.locator('.wizard-success a[href^="#/listing/"]').getAttribute('href');
  return href.split('/').pop();
}

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '#/home');
await page.waitForSelector('.listing-card');

// --- Validación del asistente ---
await go('#/sell');
await next();
assert.equal(await page.locator('.error-summary').count(), 1, 'step 1 error without category');
await pickCard('category', 'fashion');
await next(); await next();
assert.ok(await page.locator('#operationType-group-error').count(), 'operation required');
await pickCard('operationType', 'sale');
await next();
await next(); // step 3 empty
assert.ok(await page.locator('#f-title[aria-invalid="true"]').count(), 'title invalid');
assert.ok(await page.locator('#f-price[aria-invalid="true"]').count(), 'price invalid');
log('Validaciones por paso muestran errores específicos');

// 1. Ropa
const fashionId = await createListing({ category: 'fashion', op: 'sale', title: 'Abrigo de lana E2E', price: 45, basic: { condition: 'good', brand: 'Zara' }, attrs: { garmentType: 'coat', size: 'L', color: 'Negro' }, delivery: ['inPerson'] });
await go('#/explore?category=fashion');
assert.ok(await page.locator('.listing-card', { hasText: 'Abrigo de lana E2E' }).count(), 'fashion in category');
await go('#/explore?q=abrigo%20lana');
assert.equal(await page.locator('.listing-card').count(), 1, 'search finds it');
await go('#/seller/listings');
assert.ok(await page.locator('.manage-row', { hasText: 'Abrigo de lana E2E' }).count(), 'in Mis anuncios');
log('1. Anuncio de ropa creado, visible en su categoría, búsqueda y Mis anuncios', fashionId);

// 2. Coche en venta: sin campos de alquiler
const carSaleId = await createListing({ category: 'cars', op: 'sale', title: 'Renault Clio E2E venta', price: 9000, basic: { brand: 'Renault', model: 'Clio' },
  onStep4: async () => { assert.equal(await page.locator('[name="attributes.driverMinAge"]').count(), 0, 'no rent fields for sale'); },
  attrs: { year: 2017, mileage: 90000, fuel: 'diesel', transmission: 'manual', vehicleCondition: 'used_good' }, delivery: ['inPerson'] });
log('2. Coche en venta creado sin campos de alquiler', carSaleId);

// 3. Coche en alquiler: campos específicos
const carRentId = await createListing({ category: 'cars', op: 'rent', period: 'day', price: 40, minDuration: 1, title: 'Fiat 500 E2E alquiler', basic: { brand: 'Fiat', model: '500' },
  onStep2: async () => { assert.ok(await page.locator('[name="rental.requirements"]').count(), 'rent questions in step 2'); },
  onStep4: async () => { for (const f of ['driverMinAge', 'licenseMinYears', 'deposit', 'insuranceIncluded', 'kmLimit', 'pickupReturnConditions']) assert.equal(await page.locator(`[name="attributes.${f}"]`).count(), 1, f); },
  attrs: { year: 2021, mileage: 20000, fuel: 'gasoline', transmission: 'manual', vehicleCondition: 'semi_new', driverMinAge: 21, licenseMinYears: 1, deposit: 200, insuranceIncluded: true, pickupReturnConditions: 'En la estación de tren.' }, delivery: ['pickup'] });
await go(`#/listing/${carRentId}`);
assert.match(await page.locator('.detail__price').textContent(), /40.*\/día/);
log('3. Coche en alquiler con campos específicos (edad, permiso, fianza, seguro, km)', carRentId);

// 4. Viviendas
const houseSaleId = await createListing({ category: 'housing', op: 'sale', title: 'Piso E2E en venta', price: 200000,
  onStep4: async () => { assert.equal(await page.locator('[name="attributes.deposit"]').count(), 0); assert.equal(await page.locator('[name="attributes.energyRating"]').count(), 1); },
  attrs: { propertyType: 'flat', area: 80, bedrooms: 2, bathrooms: 1, propertyCondition: 'good', furnished: 'unfurnished' } });
const houseRentId = await createListing({ category: 'housing', op: 'rent', period: 'month', price: 800, minDuration: 12, title: 'Piso E2E en alquiler',
  onStep4: async () => { assert.equal(await page.locator('[name="attributes.energyRating"]').count(), 0); assert.equal(await page.locator('[name="attributes.deposit"]').count(), 1); },
  attrs: { propertyType: 'flat', area: 70, bedrooms: 2, bathrooms: 1, propertyCondition: 'good', furnished: 'furnished', deposit: 1600, availableFrom: '2027-01-01' } });
await go('#/housing');
assert.ok(await page.locator('.listing-card', { hasText: 'Piso E2E en venta' }).count() && await page.locator('.listing-card', { hasText: 'Piso E2E en alquiler' }).count());
log('4. Vivienda en venta y en alquiler (campos de compraventa vs. alquiler)', houseSaleId, houseRentId);

// 5. Editar y pausar
await go(`#/seller/edit/${fashionId}`);
await page.click('[data-go-step="3"]');
await setField('title', 'Abrigo de lana E2E editado');
await page.click('[data-go-step="7"]');
await page.click('[data-publish]');
await page.waitForSelector('.wizard-success');
await go('#/seller/listings');
const row = page.locator('.manage-row', { hasText: 'Abrigo de lana E2E editado' });
await row.locator('[data-listing-action="pause"]').click();
await page.waitForTimeout(500);
assert.match(await page.locator('.manage-row', { hasText: 'Abrigo de lana E2E editado' }).locator('.badge').first().textContent(), /Pausado/);
await go('#/explore?category=fashion');
assert.equal(await page.locator('.listing-card', { hasText: 'Abrigo de lana E2E' }).count(), 0, 'paused hidden');
log('5. Anuncio editado y pausado (desaparece de la marketplace)');

// Cambio de precio
await go('#/seller/listings');
await page.locator('.manage-row', { hasText: 'Renault Clio E2E venta' }).locator('[data-listing-action="price"]').click();
await page.fill('#f-price', '8500');
await page.click('button[form="price-form"]');
await page.waitForTimeout(500);
assert.match(await page.locator('.manage-row', { hasText: 'Renault Clio' }).textContent(), /8500/);
log('   Cambio de precio rápido');

// 6. Favoritos
await go('#/explore?q=yamaha');
const favBtn = page.locator('.listing-card', { hasText: 'Yamaha' }).locator('.fav-btn');
await favBtn.click(); await page.waitForTimeout(500);
assert.equal(await page.locator('.listing-card', { hasText: 'Yamaha' }).locator('.fav-btn').getAttribute('aria-pressed'), 'true');
await go('#/favorites');
assert.ok(await page.locator('.listing-card', { hasText: 'Yamaha' }).count());
assert.ok(await page.locator('.price-change', { hasText: 'Ha bajado' }).count(), 'golf price drop shown');
await page.locator('.listing-card', { hasText: 'Yamaha' }).locator('.fav-btn').click(); await page.waitForTimeout(500);
assert.equal(await page.locator('.listing-card', { hasText: 'Yamaha' }).count(), 0);
await go('#/home');
assert.equal(await page.locator('.listing-card', { hasText: 'Yamaha' }).first().locator('.fav-btn').getAttribute('aria-pressed'), 'false');
log('6. Favoritos añadidos/quitados y sincronizados con las tarjetas; aviso de bajada de precio');

// No se puede comprar lo propio
await go(`#/listing/${carSaleId}`);
assert.equal(await page.locator('[data-buy]').count(), 0, 'no buy on own listing');
log('   No se puede comprar el propio anuncio');

// 7-8. Pedido de demostración: Laura compra el Seat León de Carlos
await go('#/listing/lst_008');
await page.click('[data-buy]');
await page.waitForSelector('#purchase-form');
const submit = page.locator('button[form="purchase-form"]');
await submit.dblclick(); // doble pulsación: no debe crear duplicados
await page.waitForURL(/#\/buyer\/orders/);
await page.waitForTimeout(400);
const orderRows = page.locator('.order-row', { hasText: 'Seat León' });
assert.equal(await orderRows.count(), 1, 'single order created');
const orderId = (await orderRows.locator('code').textContent()).trim();
await go('#/listing/lst_008');
assert.equal(await page.locator('[data-buy]').count(), 0);
assert.match(await page.locator('.detail__summary').textContent(), /pedido abierto/);
log('7. Pedido creado (una sola vez pese a doble clic) y artículo reservado', orderId);

// Cambiar a Carlos (vendedor)
await page.click('#user-menu-trigger');
await page.selectOption('#demo-user-switch', 'u2');
await page.waitForTimeout(600);
await go('#/seller/orders');
const sellerRow = page.locator('.order-row', { hasText: orderId });
assert.equal(await sellerRow.count(), 1, 'order visible to seller');
assert.match(await sellerRow.locator('.badge').textContent(), /Pendiente/);
await sellerRow.locator('[data-order-detail]').click();
await page.click('.order-detail__actions >> text=Aceptar pedido');
await page.waitForTimeout(500);
assert.match(await page.locator('.order-detail__head .badge').textContent(), /Aceptado/);
await page.keyboard.press('Escape');
// Carlos intenta alquilar su propio Corolla: no puede; comprobamos solape como Ana
await page.click('#user-menu-trigger');
await page.selectOption('#demo-user-switch', 'u5');
await page.waitForTimeout(600);
await go('#/listing/lst_009');
await page.click('[data-buy]');
const bookedStart = await page.evaluate(() => { const d = new Date(Date.now() + 6 * 864e5); return d.toISOString().slice(0, 10); });
const bookedEnd = await page.evaluate(() => { const d = new Date(Date.now() + 9 * 864e5); return d.toISOString().slice(0, 10); });
await page.fill('#f-startDate', bookedStart); await page.fill('#f-endDate', bookedEnd);
await page.click('button[form="purchase-form"]');
await page.waitForTimeout(300);
assert.match(await page.locator('#purchase-form').textContent(), /solapan/);
await page.keyboard.press('Escape');
log('   Reserva solapada rechazada');
// Volver a Laura y comprobar el estado compartido
await page.click('#user-menu-trigger');
await page.selectOption('#demo-user-switch', 'u1');
await page.waitForTimeout(600);
await go('#/buyer/orders');
assert.match(await page.locator('.order-row', { hasText: orderId }).locator('.badge').textContent(), /Aceptado/);
log('8. El pedido aparece en comprador y vendedor con el mismo estado (Aceptado)');

// 9. Persistencia tras recarga
await page.reload();
await page.waitForSelector('.order-row');
assert.match(await page.locator('.order-row', { hasText: orderId }).locator('.badge').textContent(), /Aceptado/);
await go('#/seller/listings');
assert.ok(await page.locator('.manage-row', { hasText: 'Abrigo de lana E2E editado' }).count());
assert.ok(await page.locator('.manage-row', { hasText: 'Piso E2E en alquiler' }).count());
log('9. Datos persistentes tras recargar (LocalStorage)');

// Eliminar con confirmación: el anuncio con pedidos abiertos no se puede borrar
await go('#/seller/listings');
await page.locator('.manage-row', { hasText: 'Piso E2E en venta' }).locator('[data-listing-action="delete"]').click();
await page.click('[data-confirm]');
await page.waitForTimeout(500);
assert.equal(await page.locator('.manage-row', { hasText: 'Piso E2E en venta' }).count(), 0);
log('   Eliminación con confirmación');

// Mensajes
await go('#/buyer/messages?listing=lst_010&with=u2');
await page.fill('#message-input', 'Hola, ¿sigue disponible la moto?');
await page.click('#message-form button[type="submit"]');
await page.waitForTimeout(500);
assert.ok(await page.locator('.bubble--mine', { hasText: 'sigue disponible' }).count());
log('   Mensaje enviado en conversación nueva');

// Imagen no válida
await go('#/sell');
if (await page.locator('[data-restart]').count()) await page.click('[data-restart]');
await pickCard('category', 'other'); await next(); await pickCard('operationType', 'sale'); await next();
await setField('title', 'Prueba de imagen'); await setField('description', 'Descripción de prueba de imagen inválida.'); await setField('price', 10); await setField('condition', 'good');
await next(); await next();
await page.setInputFiles('#photo-input', { name: 'doc.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
await page.waitForTimeout(300);
assert.match(await page.locator('[data-photo-feedback]').textContent(), /formato no permitido/);
await next();
assert.ok(await page.locator('#photo-error').count(), 'image required');
log('   Validación de formato de imagen y foto obligatoria');

console.log(errors.length ? `Errores de consola: ${errors.join('\n')}` : 'Sin errores de consola.');
assert.equal(errors.length, 0);
await browser.close();
