# 🌿 Manual de Usuario — Garuto (v2026.3)
**Cuaderno de Campo Digital Inteligente para el Cultivo de Pistacho**

---

## 1. Introducción
Garuto es una plataforma integral diseñada para simplificar la gestión técnica y legal de explotaciones de pistacho. Combina la potencia de un cuaderno de campo oficial con la inteligencia de un asistente agronómico y la precisión de la cartografía digital.

---

## 2. Dashboard: Inteligencia de Negocio y Alertas
El panel principal ofrece una visión 360° de tu explotación:
- **Resumen Estadístico**: Visualiza tus gastos anuales, tipos de labores más frecuentes y stock de almacén en tiempo real mediante gráficos interactivos.
- **Meteorología Agrícola**: Datos en vivo de temperatura, viento, humedad y probabilidad de lluvia de la estación local (Open-Meteo).
- **🤖 Pistachín AI (Asistente Inteligente)**:
  - **Alertas Predictivas**: Pistachín analiza el clima y te avisa: *"¡No sulfutes hoy! Hay un 70% de probabilidad de lluvia"* o *"Viento de 30km/h: Riesgo de deriva en tratamientos"*.
  - **Control de Stock**: Te avisará automáticamente si te queda poco producto en el inventario.
  - **Recordatorios de Planning**: Si el calendario de cultivo indica que es tiempo de poda y no has registrado nada, Pistachín te lo recordará.

---

## 3. Gestión de Registros y Cumplimiento SIEX
El corazón de la aplicación es el registro de actividades:
- **Alta de Trabajos**: Registra cada labor (Fitosanitarios, Abonos, Riegos, Poda) vinculando parcelas, maquinaria y operarios.
- **Formatos Legales**: El sistema valida que los registros cumplan con la normativa de seguridad alimentaria y trazabilidad.
- **Galería Fotográfica**: Adjunta pruebas visuales de cada labor para posibles inspecciones o control de calidad.

### 📄 Exportación Oficial
En la sección **"Consultar Registros"**, dispones de dos herramientas clave:
1.  **Generar PDF CUE**: Crea un documento profesional imprimible con el formato de Cuaderno de Explotación, incluyendo los datos del titular y tu **firma digital**.
2.  **Generar SIEX (JSON)**: Genera el archivo electrónico necesario para la carga en el **Sistema de Información de Explotaciones (SIEX)** del Ministerio, cumpliendo con la obligatoriedad de 2026.

---

## 4. Cartografía y Gestión Árbol a Árbol
Garuto permite una gestión de precisión que otras apps genéricas no ofrecen:
- **Visor Geográfico**: Accede al mapa satelital de tus parcelas mediante integración SIGPAC.
- **Inventario de Árboles**: Haz clic en el mapa para marcar la ubicación exacta de cada árbol.
- **Estados**: Clasifica tus árboles por sexo (Macho/Hembra), estado de injerto o marca las "marras" (bajas) para reposición.
- **Backup de Mapa**: Puedes exportar e importar la base de datos de tus árboles en archivos JSON para tener copias de seguridad de tu plantación individual.

---

## 5. Módulos Auxiliares
- **Inventario**: Control de existencias de productos (fitos, herbicidas, abonos) con actualización automática tras cada registro de trabajo.
- **Maquinaria**: Ficha técnica de tus aperos y tractores, con seguimiento de reparaciones, mantenimientos y horas de uso.
- **Finanzas**: Control de ingresos (ventas de cosecha) y gastos (reparaciones, suministros, personal) con cálculo automático de rentabilidad anual.

---

## 6. Seguridad y Offline
- **Modo Sin Conexión**: Si estás en el campo sin cobertura, puedes seguir trabajando. Garuto guardará los datos localmente y los sincronizará automáticamente cuando recuperes la señal.
- **Privacidad**: Tus datos sensibles están protegidos mediante una capa de seguridad **CSRF** (Cross-Site Request Forgery) que impide que sitios maliciosos accedan a tu información legal.
- **Firma Digital**: Dibuja tu firma una sola vez en el perfil; el sistema la estampará automáticamente en todos los reportes oficiales que generes.

---
*© 2026 JCGM.DEV — Tecnología para el Pistacho Español. Todos los derechos reservados.*
