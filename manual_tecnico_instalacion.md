# 🛠️ Manual Técnico — Garuto (Arquitectura y Seguridad)
**Guía de Mantenimiento y Especificaciones de Backend**

---

## 1. Arquitectura del Sistema
Garuto opera bajo una arquitectura de **Single Page Application (SPA)** con persistencia **Offline-First**.

### Core Components
- **API (api.php)**: Punto de entrada único para todas las peticiones. Implementa un sistema de acciones (`action`) que gestionan el CRUD de todas las colecciones.
- **DataStore (app_v3.js)**: Clase encargada de la comunicación con la red. Utiliza una cola (`queue`) en `localStorage` para garantizar la integridad de los datos en entornos sin conexión.
- **Visor de Mapas (visor_mapa.php)**: Módulo geográfico independiente basado en Leaflet.js.
- **AI Proxy (ai_proxy.php)**: Puente seguro para la inteligencia artificial. Gestiona la comunicación con Groq (Llama 3) protegiendo las API Keys del lado del cliente.

---

## 2. Capas de Seguridad
El sistema ha sido blindado siguiendo estándares de seguridad modernos para aplicaciones agrícolas críticas:

### Protección CSRF (Implementada v2.2)
- **Mecanismo**: Se genera un token aleatorio de 32 bytes (`csrf_token`) al iniciar sesión.
- **Validación**: Todas las acciones mutativas (`add`, `update`, `borrar`, `import`) requieren el envío de la cabecera `X-CSRF-Token`.
- **Backend**: La función `checkCSRF()` en `api.php` valida que el token recibido coincida con el almacenado en la sesión de PHP.

### Autenticación y Autorización
- **Hashing**: Las contraseñas se almacenan mediante `password_hash()` (Argon2id o Bcrypt según versión PHP).
- **Roles**: Sistema binario de permisos (`admin` / `usuario`). El acceso a `saveUser`, `deleteUser` e `import` de sistema está restringido exclusivamente al rol `admin`.
- **XSS Prevention**: Las salidas de texto plano se sanean mediante `htmlspecialchars` con `ENT_QUOTES`.

---

## 3. Base de Datos (Esquema SIEX)
El esquema de MySQL se ha optimizado para la exportación oficial:
- **Parcelas**: Almacena `referencia_sigpac` (Provincia, Municipio, Polígono, Parcela, Recinto) y `mapa_datos` (un objeto JSON con la posición y estado de cada árbol).
- **Trabajos**: Incluye la columna `tipo_legal`, fundamental para clasificar los registros fitosanitarios y de fertilización exigidos por el Ministerio.
- **Finanzas**: Registra movimientos con flujos `ingreso` / `gasto` vinculados a colecciones de mantenimiento o ventas.

---

## 4. Endpoints de Interés
- `api.php?action=exportSIEX`: Consulta las tablas de parcelas y registros legales, estructura la información según el titular logueado y devuelve un archivo JSON compatible con la precarga de sistemas SIEX.
- `api.php?action=export`: Genera una copia de seguridad total del sistema en formato JSON (Solo Admin).
- `api.php?action=import`: Permite la restauración completa de la base de datos (Solo Admin, requiere CSRF).

---

## 5. PWA y Service Worker
- **Estrategia Caching**: `Stale-While-Revalidate` para activos estáticos (CSS, JS, Fonts).
- **API Exemption**: El SW está configurado para **nunca** cachear peticiones a `api.php`, garantizando que la comunicación con la base de datos sea siempre en tiempo real cuando hay conexión.

---
*© 2026 JCGM.DEV — Security & Infrastructure.*
