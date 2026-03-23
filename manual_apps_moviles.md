# 📱 Guía Móvil: Garuto Native Experience
**Despliegue PWA y Empaquetado Nativo**

---

## 1. La Experiencia PWA (Recomendado)
Garuto está diseñado como una **Progressive Web App**. No necesitas las app stores para tener una experiencia nativa.

### Ventajas de la instalación PWA:
- **Uso sin Internet**: Gracias a su Service Worker, la app carga instantáneamente incluso en medio del campo sin señal.
- **Actualización Transparente**: Al corregir un error o añadir una mejora (como el nuevo SIEX o Pistachín), la actualización se aplica sola al abrir la app.
- **Sincronización Inteligente**: Los datos se guardan en el dispositivo y se suben solos cuando vuelves a tener WiFi o 4G.

### Cómo instalarla:
1. Abre tu navegador (Chrome en Android, Safari en iOS).
2. Toca el menú de opciones (tres puntos en Android, botón compartir en iOS).
3. Selecciona **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.

---

## 2. Generación de Binarios (.apk / .ipa)
Si necesitas el archivo instalable físicamente, Garuto está preparado para **Capacitor JS**.

### Pasos Técnicos para Android (APK):
1. Asegúrate de tener **Android Studio** instalado.
2. En la terminal de Garuto:
   ```bash
   npx cap add android
   npx cap sync
   npx cap open android
   ```
3. En Android Studio, selecciona **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

### Pasos Técnicos para iOS (IPA):
1. Requiere un **Mac** con **Xcode**.
   ```bash
   npx cap add ios
   npx cap sync
   npx cap open ios
   ```
2. En Xcode, ve a **Product > Archive** para generar la compilación de la App Store.

---

## 3. Notas de Hardware y GPS
- **Geolocalización**: Garuto solicita permiso para usar el GPS del móvil al abrir el **Mapa SIGPAC**. Esto permite centrar el mapa automáticamente en tu posición real en la parcela.
- **Cámara**: Al subir una foto de tratamiento o cosecha, la app abrirá la interfaz de cámara nativa para una captura más fluida.
- **Firma**: El panel de firma digital de Garuto está optimizado para respuesta táctil de alta sensibilidad, detectando la presión y velocidad del trazo.

---
*© 2026 </JCGM.DEV> — Mobile Infrastructure.*
