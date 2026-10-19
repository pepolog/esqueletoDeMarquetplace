# Trato — Esqueleto de marketplace multifuncional

Prototipo navegable de una plataforma para **comprar, vender y alquilar** artículos de segunda mano, coches, motos, viviendas y habitaciones desde una misma aplicación.

> **Importante:** es una **demostración 100 % local**. No hay servidor, autenticación, pagos ni mensajería reales. Todos los datos se guardan en el `LocalStorage` del navegador. «Trato» es un nombre provisional.

---

## 1. Instalación y ejecución

El proyecto usa **módulos ES** (`<script type="module">`), así que debe servirse desde un servidor local (si abres `index.html` con doble clic, la página muestra un aviso explicándolo).

No hay dependencias ni compilación. Desde la carpeta `marketplace/`:

```bash
# Opción A: Python 3
python3 -m http.server 8080

# Opción B: Node.js
npx serve -l 8080 .
```

Abre `http://localhost:8080` en un navegador moderno (Chrome, Edge, Firefox o Safari recientes).

**Restablecer los datos:** menú de usuario (avatar arriba a la derecha) › *Restablecer datos de prueba*.

### Prueba automática de los escenarios (opcional)

```bash
npm install --no-save playwright && npx playwright install chromium
BASE_URL=http://localhost:8080/ node tests/e2e.mjs
```

---

## 2. Estructura de carpetas

```
marketplace/
├── index.html          Estructura principal: cabecera, menú, contenedor de vistas, navegación móvil
├── styles.css          Sistema de estilos: variables, componentes y diseño responsive
├── README.md
├── tests/
│   └── e2e.mjs         Prueba de extremo a extremo (Playwright) de los escenarios de verificación
└── js/
    ├── app.js          Arranque, enrutado por hash, cabecera, inicio, explorar, categorías, detalle y perfil público
    ├── data.js         Configuración, categorías + esquema de campos dinámicos, estados y DATOS DE PRUEBA
    ├── api.js          "API" local: reglas de negocio + persistencia en LocalStorage (sustituible por REST)
    ├── store.js        Única fuente de datos de la interfaz: selectores (datos derivados) y acciones
    ├── validation.js   Validación de anuncios por pasos (compartida por el asistente y la API)
    ├── seller.js       Panel de vendedor: resumen, Mis anuncios, pedidos recibidos, ingresos, valoraciones
    ├── wizard.js       Asistente de publicación en 7 pasos (crear y editar anuncios)
    ├── buyer.js        Panel de comprador: resumen, pedidos, alquileres, favoritos, mensajes y diálogo de compra
    ├── orders.js       Componentes de pedido compartidos por comprador y vendedor (ficha, acciones, valoración)
    ├── profile.js      Ajustes: datos personales, foto, perfil público, seguridad, notificaciones y ayuda
    ├── ui.js           Componentes reutilizables: tarjetas, modales, toasts, campos de formulario, insignias…
    ├── media.js        Validación y reducción de imágenes subidas
    ├── icons.js        Iconos SVG (trazos estilo Lucide) inyectados como sprite
    └── utils.js        Funciones puras: formateo, fechas, escapado de HTML, rutas de objetos
```

Respecto a los archivos pedidos, `seller.js` delega el asistente en `wizard.js` y ambos paneles comparten `orders.js`, para que cada archivo tenga una única responsabilidad.

---

## 3. Arquitectura y componentes principales

```
Vistas (app.js, seller.js, buyer.js, profile.js, wizard.js)
        │  leen con select.*          │  escriben con actions.*
        ▼                              ▼
store.js  ── caché en memoria + notificación de cambios (subscribe)
        │
        ▼
api.js (LocalApi)  ── reglas de negocio + LocalStorage   ⇄  futura RestApi (fetch)
```

- **Una sola fuente de datos.** Usuarios, anuncios, pedidos, favoritos, mensajes y valoraciones viven en un único objeto persistido. Las vistas nunca lo modifican directamente: llaman a `actions.*`, que pasan por la API y, al terminar, refrescan el store y avisan a la interfaz.
- **Datos derivados, no duplicados.** Las estadísticas del vendedor, la disponibilidad («Reservado»), las conversaciones, la valoración media o los cambios de precio de favoritos se calculan a partir de las entidades (`select.sellerStats`, `select.availability`, `select.priceChangeSince`…).
- **Enrutado por hash** (`#/seller/listings?status=active`): permite usar los botones Atrás/Adelante y compartir enlaces sin backend. Los filtros de búsqueda se reflejan en la URL sin recargar.
- **Formularios dinámicos guiados por datos.** `data.js` define para cada categoría las operaciones admitidas, los periodos de alquiler y los campos específicos (`fields`). Un campo con `showIf: { operationType: 'rent' }` solo aparece y se valida si se alquila. El asistente pinta los campos a partir de ese esquema y la API normaliza los atributos con el mismo esquema.
- **Preparado para backend.** Todos los métodos de `api.js` son asíncronos y devuelven promesas, con errores de negocio tipados (`ApiError`). Al final de `api.js` hay un esqueleto `RestApi`: basta con implementarlo y cambiar la exportación `api` sin tocar la interfaz.

### Modelos de datos

| Entidad | Campos |
|---|---|
| **Usuario** | `id, username, displayName, firstName, lastName, email, phone, birthDate, country, city, address, avatar, bio, publicLocation, role, createdAt, preferences { notifications, privacy }` |
| **Anuncio** | `id, sellerId, title, description, category, subcategory, operationType, price, currency, rental { period, minDuration, maxDuration, requirements }, condition, brand, model, availability, deliveryNotes, attributes {…}, customAttributes [], images [], location { city, postalCode, zone }, delivery { inPerson, shipping, pickup, agreed }, status, featured, views, priceHistory [], createdAt, updatedAt, deletedAt` |
| **Pedido / reserva** | `id, listingId, buyerId, sellerId, operationType, amount, currency, units, startDate, endDate, status, delivery { method, notes }, statusHistory [], createdAt, updatedAt` |
| **Favorito** | `id, userId, listingId, createdAt` |
| **Mensaje** | `id, conversationId, senderId, receiverId, listingId, content, createdAt, read` |
| **Valoración** | `id, orderId, listingId, reviewerId, revieweeId, rating, comment, createdAt` |
| **Denuncia / consulta** | `id, type, userId, listingId, reason, details, status, createdAt` |

Estados de anuncio: `draft, pending_review, active, paused, sold, rented, finished`.
Estados de pedido de venta: `pending, accepted, preparing, shipped, completed, cancelled, disputed`.
Estados de reserva de alquiler: `pending, confirmed, in_progress, completed, cancelled, disputed`.
Las transiciones permitidas por rol están en `ORDER_TRANSITIONS` (`data.js`).

---

## 4. Datos de prueba

Cinco cuentas ficticias (correos `@example.com`). Se cambia de cuenta desde el **menú de usuario › Cuenta de demostración**:

| Cuenta | Perfil |
|---|---|
| **Laura M.** (`u1`, por defecto) | Vende moda, tecnología, material deportivo en alquiler; tiene borrador, anuncio pausado, en revisión y vendido; compras y alquileres propios |
| **Carlos Ruiz** (`u2`) | Coches y motos en venta y en alquiler (con reserva confirmada) |
| **Marta Gómez** (`u3`) | Pisos en venta y alquiler, habitaciones |
| **David López** (`u4`) | Tecnología y videojuegos |
| **Ana Torres** (`u5`) | Deporte y moda |

Incluye 27 anuncios variados (todos distintos, con ilustraciones SVG generadas localmente), 8 pedidos/reservas en distintos estados, favoritos (uno con bajada de precio), conversaciones con mensajes sin leer y valoraciones.

---

## 5. Funcionalidades implementadas

**Navegación y diseño**
- Cabecera persistente con logotipo sustituible, buscador, selector de categorías, favoritos, compras, mensajes (con contadores), botón «Publicar anuncio» y menú desplegable de usuario.
- Menú principal (Inicio, Explorar, Categorías, Vehículos, Viviendas, Alquileres, Favoritos, Mis compras, Vender, Mi perfil, Ajustes). En móvil: panel lateral desplegable + barra inferior.
- Menús laterales propios en los paneles de vendedor, comprador y ajustes (en móvil pasan a pestañas desplazables).
- Diseño responsive con Grid y Flexbox, sin desbordamiento horizontal (comprobado a 390, 768 y 1366 px).
- Estados vacíos, indicadores de carga, avisos (toasts), confirmaciones antes de acciones destructivas y animaciones breves.

**Marketplace**
- Inicio con buscador destacado y filtros básicos, accesos a categorías, recientes, destacados, recomendaciones, vehículos, viviendas y alquileres.
- Tarjetas con imagen, título, precio (con periodo de alquiler), ubicación, categoría, venta/alquiler, disponibilidad, vendedor y favorito.
- Búsqueda y filtros (palabras clave, categoría, precio mín./máx., ubicación, estado, venta/alquiler, fecha de publicación) y orden (recientes, precio ascendente/descendente), sin recargar la página y con «Limpiar filtros».
- Detalle del anuncio: galería, características según su categoría, condiciones de alquiler, fechas ya reservadas, entrega, vendedor con valoración, denuncia del anuncio.
- Perfil público que respeta las opciones de privacidad del usuario.

**Panel de vendedor**
- Resumen con 9 indicadores calculados a partir de los datos.
- Mis anuncios con filtros por estado y acciones: ver, editar, cambiar precio, pausar, reactivar, marcar vendido/alquilado (demostración) y eliminar con confirmación (borrado lógico: los pedidos históricos se conservan; no se permite si hay pedidos abiertos).
- Asistente de 7 pasos con indicador de progreso, validación por paso, borrador, edición y pantalla de confirmación. Campos específicos por categoría y operación (p. ej. edad mínima del conductor, fianza, seguro y límite de km solo en alquiler de vehículos; certificado energético solo en venta de viviendas). Fotos múltiples con vista previa, imagen principal, reordenación, eliminación y validación de formato/tamaño. Aviso para no publicar direcciones completas.
- Pedidos recibidos con ficha de detalle, historial y acciones según el estado.
- Ventas e ingresos: bruto, comisión configurable (`APP_CONFIG.commissionRate`), neto estimado y «Dinero recibido: —» (sin pasarela de pagos).
- Valoraciones con media y distribución.

**Panel de comprador**
- Resumen (pedidos activos, compras completadas, alquileres activos, favoritos, mensajes sin leer, últimos movimientos).
- Mis pedidos con filtros por estado; Mis alquileres (actuales, próximos, historial) con fechas, importe, fianza y condiciones de entrega/devolución.
- Favoritos sincronizados con las tarjetas, filtro por categoría y aviso de cambio de precio.
- Mensajes: lista de conversaciones con imagen del anuncio, interlocutor, último mensaje, fecha y estado de lectura; envío de mensajes locales.

**Reglas de negocio (en `api.js`)**
- No se puede comprar, alquilar ni guardar en favoritos un anuncio propio.
- Un artículo en venta con un pedido abierto queda «Reservado»; al completarse pasa a «Vendido».
- No se crean pedidos duplicados (botón bloqueado durante la operación + comprobación en la API).
- Las reservas no pueden solaparse con otras ya confirmadas, ni al solicitarlas ni al confirmarlas; se respetan duración mínima y máxima.
- Las transiciones de estado de un pedido dependen del rol (comprador o vendedor).
- Si el almacenamiento local se llena, se muestra un error comprensible y no se corrompen los datos.

**Ajustes**
- Datos personales con validación; los datos sensibles se muestran enmascarados y nunca en el perfil público.
- Foto de perfil: subida, vista previa, cambio, eliminación y avatar predeterminado con iniciales; validación de tipo y tamaño.
- Perfil público configurable; visibilidad del perfil y permisos de comunicación (operativos en local).
- Preferencias de notificaciones; exportación de los datos propios en JSON (descarga + copia en pantalla).
- Ayuda: centro de ayuda, preguntas frecuentes, normas de publicación, condiciones de uso, política de privacidad, contacto con soporte y comunicación de problemas (registrados en local).

**Accesibilidad**
- HTML semántico, enlace «Saltar al contenido», etiquetas asociadas a todos los campos, `aria-invalid` y `aria-describedby` en errores, foco visible, modales con foco atrapado y cierre con Escape, regiones `aria-live`, textos alternativos y soporte de `prefers-reduced-motion`.

---

## 6. Funciones demostrativas que requieren backend

Están señaladas en la interfaz con la etiqueta **«Requiere backend»** o con un aviso, y los controles correspondientes están deshabilitados:

| Función | Estado en esta versión |
|---|---|
| Registro, inicio y cierre de sesión | Sin autenticación: se cambia de «cuenta de demostración» libremente |
| Cambio de contraseña | Deshabilitado (no se almacenan contraseñas) |
| Gestión de sesiones y dispositivos | Solo se muestra la sesión actual |
| Eliminación definitiva de la cuenta | Deshabilitado |
| Persistencia compartida entre usuarios y dispositivos | Solo en el navegador actual |
| Mensajería en tiempo real | Mensajes locales; para «responder» hay que cambiar de cuenta |
| Pagos, cobros, liquidaciones y facturas | No existen; los importes son estimaciones |
| Almacenamiento definitivo de imágenes | Las fotos se reducen y se guardan como data URL en LocalStorage |
| Envío de notificaciones (correo/push) | Solo se guardan las preferencias |
| Moderación de anuncios y denuncias | Los anuncios se aprueban al instante; las denuncias se registran en local |
| Exportación oficial de datos (RGPD) | Se exporta una copia local en JSON |
| Contador de visitas fiable | Se cuenta una visita por anuncio y sesión del navegador |

Todas las validaciones del navegador (propietario, transiciones, solapes…) **deben repetirse en el servidor**: ocultar botones o campos en el cliente no aporta seguridad.

---

## 7. Escenarios verificados

Comprobados de forma automática con `tests/e2e.mjs` (sin errores de consola):

- Crear un anuncio de ropa y encontrarlo en su categoría, en la búsqueda y en «Mis anuncios».
- Crear un coche en venta (sin campos de alquiler) y otro en alquiler (con edad mínima, antigüedad del permiso, fianza, seguro, límite de km y condiciones de recogida).
- Crear una vivienda en venta (certificado energético) y otra en alquiler (fianza y fecha de disponibilidad).
- Editar un anuncio, cambiar su precio y pausarlo (deja de mostrarse en la marketplace).
- Añadir y quitar favoritos y ver que las tarjetas se sincronizan; aviso de bajada de precio.
- Crear un pedido con doble clic y comprobar que solo se crea uno y que el artículo queda reservado.
- Ver el pedido en el panel del comprador y, cambiando a la cuenta del vendedor, en «Pedidos recibidos»; aceptarlo y comprobar que ambos paneles muestran «Aceptado».
- Rechazo de una reserva que se solapa con otra confirmada; imposibilidad de comprar un anuncio propio.
- Recargar la página y comprobar que todo persiste.
- Eliminación con confirmación, mensajes en una conversación nueva y validación de imágenes.
- Escritorio (1366 px), tablet (768 px) y móvil (390 px) sin desbordamiento horizontal en ninguna sección.

---

## 8. Mejoras propuestas para una segunda versión

1. **Backend y base de datos** (p. ej. Node/NestJS o Django + PostgreSQL) implementando `RestApi` con las mismas reglas de `LocalApi`, transacciones y bloqueo de disponibilidad en el servidor.
2. **Autenticación** (OAuth/OIDC o correo + contraseña con hash), verificación de correo y teléfono, roles (usuario, moderador, administrador).
3. **Pagos** con un proveedor (Stripe Connect, Adyen…) con pago retenido hasta la entrega, fianzas, reembolsos y facturación.
4. **Imágenes** en almacenamiento de objetos con CDN, miniaturas y moderación automática.
5. **Mensajería en tiempo real** (WebSockets), notificaciones push y por correo, alertas de búsqueda guardadas.
6. **Calendario de disponibilidad** visual para alquileres, precios por temporada y bloqueos manuales.
7. **Búsqueda avanzada** (motor de búsqueda, filtros específicos por categoría, mapa con zonas aproximadas, paginación o scroll infinito).
8. **Moderación y confianza**: revisión de anuncios, gestión de denuncias, verificación de identidad para vehículos e inmuebles, sistema de disputas.
9. **Panel de administración** y analítica real (visitas, conversión).
10. **Calidad**: migración a TypeScript, pruebas unitarias de reglas de negocio, pruebas E2E en CI, internacionalización (i18n) y modo oscuro.
