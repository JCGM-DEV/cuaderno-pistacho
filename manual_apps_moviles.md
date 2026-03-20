# 📱 Guía para Crear Aplicaciones Nativas (APK e IPA) a partir de Garuto

Garuto es una **PWA (Progressive Web App)**, lo que significa que ya es instalable directamente desde el navegador (Chrome en Android o Safari en iOS) sin necesidad de una tienda. Sin embargo, si quieres subirla a la **Google Play Store** o la **Apple App Store**, aquí tienes cómo obtener tus binarios `.apk` e `.ipa`.

---

## 🚀 Opción 1: PWABuilder (Recomendada y Rápida)
Esta es la forma más sencilla. No requiere que instales nada en tu ordenador.

1.  Asegúrate de que tu proyecto esté subido a **GitHub** (ya lo hemos hecho).
2.  Entra en **[PWABuilder.com](https://www.pwabuilder.com/)**.
3.  Introduce la URL de tu aplicación (ej: `https://tu-dominio.com/cuaderno-pistacho`).
4.  Haz clic en **"Package for Stores"**.
5.  **Para Android**: Descarga el paquete para Google Play (se genera un `.aab` o `.apk`).
6.  **Para iOS**: Descarga el paquete para App Store (se genera un `.ipa`).

> [!TIP]
> PWABuilder utiliza el `manifest.json` y los iconos que ya hemos configurado en el proyecto.

---

## 🛠️ Opción 2: Capacitor (Control Total)
He preparado el proyecto con **Capacitor**, el estándar para apps híbridas. Esto te permite generar apps nativas reales si tienes acceso a un entorno de desarrollo.

### Requisitos en tu PC
- **Node.js** instalado.
- **Android Studio** (para Android).
- **Xcode** y un **Mac** (solo para iOS).

### Pasos para generar el APK (Android):
1.  Clona el repositorio en tu ordenador.
2.  Ejecuta `npm install`.
3.  Añade la plataforma Android:
    ```bash
    npx cap add android
    ```
4.  Sincroniza el código:
    ```bash
    npx cap sync
    ```
5.  Abre el proyecto en Android Studio:
    ```bash
    npx cap open android
    ```
6.  En Android Studio, ve a **Build > Build Bundle(s) / APK(s) > Build APK(s)**. ¡Listo!

### Pasos para generar el IPA (iOS):
1.  En un Mac, ejecuta:
    ```bash
    npx cap add ios
    npx cap sync
    npx cap open ios
    ```
2.  Se abrirá Xcode. Selecciona tu firma de desarrollador y haz clic en **Product > Archive** para subirla a la App Store o generar el `.ipa`.

---

## 💡 ¿Por qué recomendamos PWA?
Para una herramienta agrícola como Garuto, la PWA es ideal porque:
- **Sin Comisiones**: No pagas a Apple o Google.
- **Actualizaciones Instantáneas**: En cuanto arreglo algo, lo tienes al recargar, sin esperar revisiones de la tienda.
- **Ligera**: No ocupa megas innecesarios en el móvil.

Si de todas formas necesitas el archivo físico, la **Opción 1 (PWABuilder)** es tu mejor amiga.

---
© 2026 </TheBrave> — Garuto Mobile Infrastructure Ready.
