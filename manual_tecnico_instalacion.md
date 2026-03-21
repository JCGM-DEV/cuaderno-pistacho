# Manual Técnico — Garuto (Arquitectura y Despliegue)

Garuto es una aplicación híbrida (PWA + Capacitor) diseñada para la gestión agrícola de pistachos.

## 1. Stack Tecnológico
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Backend**: API REST en PHP 7.4+.
- **Base de Datos**: MySQL / MariaDB.
- **Mobile**: Capacitor JS para empaquetado nativo (Android/iOS).

## 2. Estructura de Datos (MySQL)
Las tablas principales son:
- `usuarios`: Gestión de accesos y roles (admin/usuario).
- `parcelas`: Información geográfica y catastral.
- `trabajos`: Catálogo de tipos de labores (fito, abono, poda, etc.).
- `registros`: Tabla central de actividad (vincula parcela, trabajo, maquinaria y fotos).
- `maquinaria`: Inventario de máquinas y costes de operación.
- `inventario`: Stock de productos y suministros.

## 3. Lógica de Sincronización (DataStore)
La clase `DataStore` en `app_v3.js` gestiona la persistencia:
- **Offline First**: Las acciones mutativas (`add`, `update`, `borrar`) se encolan en `localStorage` si no hay conexión.
- **Auto-Sync**: Un evento de `window.online` dispara el procesamiento de la cola pendiente.
- **Validación**: La API valida cada colección y ID antes de aplicar los cambios en el servidor.

## 4. Despliegue y Configuración
- **API**: Configurada en `api.php`. Requiere conexión PDO a la base de datos definida en las constantes `DB_HOST`, `DB_NAME`, etc.
- **Uploads**: Las fotos se almacenan en la carpeta `/uploads/` y se vinculan por ID en la tabla `fotos`.
- **CORS**: Configurado para permitir peticiones desde orígenes locales (desarrollo móvil).

---
© 2026 Garuto — Desarrollo Técnico
