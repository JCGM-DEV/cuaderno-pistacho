<?php
/* ======================================================
   Garuto — Server Update Utility (v2026 Commercial)
   Este script automatiza la actualización de la BD.
   ====================================================== */

require_once 'api.php';

header('Content-Type: text/html; charset=utf-8');
echo "<h1>🚀 Actualizador de Garuto Pro</h1>";

try {
    $db = getDB();
    echo "<p>📦 Conectado a la base de datos...</p>";

    // 1. Crear tabla de usuarios si no existe
    $db->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        email VARCHAR(100),
        telefono VARCHAR(20),
        role ENUM('admin', 'usuario') DEFAULT 'usuario',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    echo "<p>✅ Tabla 'usuarios' verificada/creada.</p>";

    // 2. Insertar usuarios por defecto si la tabla está vacía
    $check = $db->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
    if ($check == 0) {
        $users = [
            ['admin', 'admin123', 'Administrador', 'admin'],
            ['usuario', 'pistacho2026', 'Operario Pistachos', 'usuario']
        ];
        
        $stmt = $db->prepare("INSERT INTO usuarios (username, password, display_name, role) VALUES (?, ?, ?, ?)");
        foreach ($users as $u) {
            $hashed = password_hash($u[1], PASSWORD_DEFAULT);
            $stmt->execute([$u[0], $hashed, $u[2], $u[3]]);
        }
        echo "<p>✅ Usuarios por defecto creados (Recuerda cambiarlos).</p>";
    }

    // 3. Verificar columnas en maquinaria para historial de costes
    // (Ejemplo: precio_compra si se añadió recientemente)
    try {
        $db->exec("ALTER TABLE maquinaria ADD COLUMN IF NOT EXISTS precio_compra DECIMAL(10,2) DEFAULT 0");
        $db->exec("ALTER TABLE maquinaria ADD COLUMN IF NOT EXISTS fecha_compra DATE");
        echo "<p>✅ Columnas de costes en maquinaria verificadas.</p>";
    } catch (Exception $e) {
        // Ignorar si ya existen o el driver no soporta IF NOT EXISTS en ALTER
    }

    echo "<h2 style='color:green;'>¡Actualización completada con éxito!</h2>";
    echo "<p><b>⚠️ ATENCIÓN:</b> Por seguridad, borra este archivo (<code>update_server.php</code>) ahora mismo.</p>";
    echo "<a href='index.html' style='padding:1rem; background:#7ab648; color:white; text-decoration:none; border-radius:8px;'>Ir a la Aplicación</a>";

} catch (Exception $e) {
    echo "<h2 style='color:red;'>❌ Error durante la actualización</h2>";
    echo "<pre>" . $e->getMessage() . "</pre>";
}
