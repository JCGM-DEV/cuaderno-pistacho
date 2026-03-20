# 🚀 Guía de Actualización y Despliegue (Hostalia)

Esta guía te ayudará a subir las mejoras de "Grado Comercial" a tu servidor en Hostalia de forma segura.

## 🕒 Preparación
1. **Copia de Seguridad**: Antes de nada, descarga una copia de seguridad desde la sección "Ajustes" de tu app actual.
2. **Acceso FTP**: Asegúrate de tener tus claves de FTP de Hostalia a mano (FileZilla es una buena opción).

## 🛠️ Paso 1: Subir Archivos
Sube los siguientes archivos a la carpeta raíz de tu web en Hostalia, reemplazando los existentes:
- `api.php`
- `app_v3.js`
- `index.html`
- `index.css`
- `update_server.php` (Nuevo archivo de automatización)

## ⚡ Paso 2: Ejecutar Actualización de Base de Datos
Para que el nuevo sistema de seguridad y finanzas funcione, la base de datos necesita actualizarse. He creado un script que lo hace por ti:

1. Abre tu navegador y ve a: `https://tudominio.com/update_server.php`
2. El script creará la tabla de usuarios y configurará los permisos necesarios.
3. **IMPORTANTE**: Una vez termine, **borra el archivo `update_server.php`** de tu servidor por seguridad.

## 🔐 Paso 3: Primer Inicio de Sesión
1. Entra en la app con tus credenciales habituales.
2. Ve a **Ajustes > Seguridad**.
3. **Cambia tu contraseña** inmediatamente para activar el nuevo sistema de cifrado de alta seguridad.

---
*Si tienes algún problema durante el proceso, consulta el `manual_tecnico_instalacion.pdf` incluido en los archivos.*
