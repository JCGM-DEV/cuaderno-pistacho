-- ======================================================
-- Garuto — Esquema de Base de Datos MySQL
-- Versión Consolidada v2026.03.19
-- Ejecuta este SQL en phpMyAdmin o en la consola MySQL
-- ======================================================

-- 1. TABLA PARCELAS
CREATE TABLE IF NOT EXISTS parcelas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    superficie DECIMAL(10,2) DEFAULT NULL,
    referencia_sigpac VARCHAR(255) DEFAULT NULL,
    notas TEXT DEFAULT NULL,
    lat DECIMAL(10, 8) DEFAULT NULL,
    lng DECIMAL(11, 8) DEFAULT NULL,
    mapa_datos LONGTEXT DEFAULT NULL, -- Almacena el JSON de árboles e iconos interactivos
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABLA TRABAJOS (TIPOS DE LABOR)
CREATE TABLE IF NOT EXISTS trabajos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    icono VARCHAR(10) DEFAULT '🔧',
    tipo_legal ENUM('general', 'fitosanitario', 'abono', 'cosecha') DEFAULT 'general',
    predefinido TINYINT(1) DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. TABLA INVENTARIO (ALMACÉN)
CREATE TABLE IF NOT EXISTS inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    tipo ENUM('fitosanitario', 'abono', 'herbicida', 'otro') DEFAULT 'otro',
    stock DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    unidad VARCHAR(20) DEFAULT 'unidades',
    ubicacion VARCHAR(255) DEFAULT NULL,
    precio_unidad DECIMAL(10,2) DEFAULT 0.00,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. TABLA MAQUINARIA
CREATE TABLE IF NOT EXISTS maquinaria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    tipo VARCHAR(100) DEFAULT NULL,
    coste_hora DECIMAL(10,2) DEFAULT 0.00,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. TABLA REGISTROS DE ACTIVIDAD (CUADERNO DE CAMPO)
CREATE TABLE IF NOT EXISTS registros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parcelaId INT NOT NULL,
    trabajoId INT NOT NULL,
    maquinariaId INT DEFAULT NULL,
    fecha DATE NOT NULL,
    notas TEXT DEFAULT NULL,
    coste DECIMAL(10,2) DEFAULT 0.00,
    num_personas INT DEFAULT 1,
    nombres_personas VARCHAR(255) DEFAULT NULL,
    duracion_horas DECIMAL(10,2) DEFAULT NULL,
    
    -- Enlace a Inventario
    inventarioId INT DEFAULT NULL,
    cantidad_usada DECIMAL(10,2) DEFAULT NULL,
    
    -- Campos SIEX (Fitosanitario)
    producto_fito VARCHAR(255) DEFAULT NULL,
    num_registro_fito VARCHAR(50) DEFAULT NULL,
    dosis VARCHAR(100) DEFAULT NULL,
    plaga VARCHAR(255) DEFAULT NULL,
    carnet_aplicador VARCHAR(100) DEFAULT NULL,
    
    -- Campos SIEX (Abono / Riego)
    nutrientes VARCHAR(255) DEFAULT NULL,
    cantidad_abono VARCHAR(100) DEFAULT NULL,
    agua_riego DECIMAL(10,2) DEFAULT NULL,
    
    -- Campos SIEX (Cosecha / Trazabilidad)
    kg_recolectados DECIMAL(10,2) DEFAULT NULL,
    lote_trazabilidad VARCHAR(255) DEFAULT NULL,
    
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parcelaId) REFERENCES parcelas(id) ON DELETE CASCADE,
    FOREIGN KEY (trabajoId) REFERENCES trabajos(id) ON DELETE CASCADE,
    FOREIGN KEY (maquinariaId) REFERENCES maquinaria(id) ON DELETE SET NULL,
    FOREIGN KEY (inventarioId) REFERENCES inventario(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. TABLA FOTOS (GALERÍA)
CREATE TABLE IF NOT EXISTS fotos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parcelaId INT NOT NULL,
    registroId INT DEFAULT NULL,
    anio INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parcelaId) REFERENCES parcelas(id) ON DELETE CASCADE,
    FOREIGN KEY (registroId) REFERENCES registros(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. TABLA PLANING PROGRESO (CHECKLIST ANUAL)
CREATE TABLE IF NOT EXISTS planing_progreso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anio INT NOT NULL,
    mes_idx INT NOT NULL,
    tarea_idx INT NOT NULL,
    completado TINYINT(1) DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_anio (anio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- 8. TABLA DOCUMENTACIÓN (ESCRITURAS, SIGPAC, ETC)
CREATE TABLE IF NOT EXISTS documentacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parcelaId INT NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    url VARCHAR(2048) DEFAULT NULL,
    filename VARCHAR(255) DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parcelaId) REFERENCES parcelas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. TABLA MAQUINARIA REPARACIONES
CREATE TABLE IF NOT EXISTS maquinaria_reparaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maquinariaId INT NOT NULL,
    fecha DATE NOT NULL,
    descripcion TEXT NOT NULL,
    coste DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maquinariaId) REFERENCES maquinaria(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. DATOS PREDEFINIDOS
INSERT INTO trabajos (nombre, icono, tipo_legal, predefinido) VALUES
    ('Riego',         '💧', 'general',        1),
    ('Arar',          '🚜', 'general',        1),
    ('Abono',         '🌾', 'abono',          1),
    ('Fitosanitario', '🧪', 'fitosanitario',  1),
    ('Herbicida',     '☠️', 'fitosanitario',  1),
    ('Poda',          '✂️', 'general',        1),
    ('Cosecha',       '🧺', 'cosecha',        1)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);
