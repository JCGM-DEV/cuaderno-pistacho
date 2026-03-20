<?php
$debug = getenv('APP_DEBUG') === '1';
error_reporting(E_ALL);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
/* ======================================================
   Garuto — API REST (PHP + MySQL)
   ====================================================== */

// ---- Configuración de Base de Datos ----
define('DB_HOST', getenv('DB_HOST') ?: 'PMYSQL187.dns-servicio.com');
define('DB_NAME', getenv('DB_NAME') ?: '10833629_cuadernodecampo');
define('DB_USER', getenv('DB_USER') ?: 'garuto');
define('DB_PASS', getenv('DB_PASS') ?: '2G80j%6kq');
define('DB_CHARSET', 'utf8mb4');

// Usuarios cargados desde la base de datos (se usa password_verify)

// ---- Configuración de Sesiones ----
session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax'
]);

// ---- Directorio de uploads ----
define('UPLOAD_DIR', __DIR__ . '/uploads/');

// ---- CORS y Headers ----
header('Content-Type: application/json; charset=utf-8');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ---- Conexión PDO ----
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => true // Fix for error 1615 (Prepared statement needs to be re-prepared)
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

// ---- Validar colección (tabla) permitida ----
function validCollection($name) {
    $allowed = ['parcelas', 'trabajos', 'registros', 'fotos', 'planing_progreso', 'inventario', 'maquinaria', 'documentacion', 'maquinaria_reparaciones', 'finanzas', 'cosechas_ventas'];
    if (!in_array($name, $allowed)) {
        http_response_code(400);
        echo json_encode(['error' => 'Colección no válida']);
        exit;
    }
    return $name;
}
// ---- Validar autenticación ----
function checkAuth() {
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['error' => 'No autorizado. Inicie sesión.']);
        exit;
    }
}

function checkAdmin() {
    checkAuth();
    if (($_SESSION['user']['role'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Acceso denegado. Se requieren permisos de administrador.']);
        exit;
    }
}

// ---- Router ----
$action = $_GET['action'] ?? '';

// Rutas públicas
if ($action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?)");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        session_regenerate_id(true);
        $_SESSION['user'] = [
            'id' => $user['id'],
            'username' => $user['username'],
            'displayName' => $user['display_name'],
            'role' => $user['role']
        ];
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
        exit;
    }
    http_response_code(401);
    echo json_encode(['error' => 'Usuario o contraseña incorrectos']);
    exit;
}

if ($action === 'checkSession') {
    if (isset($_SESSION['user'])) {
        echo json_encode(['authenticated' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['authenticated' => false]);
    }
    exit;
}

if ($action === 'logout') {
    session_unset();
    session_destroy();
    // Clear the session cookie from the browser
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    echo json_encode(['success' => true]);
    exit;
}
if ($action === 'changePassword') {
    checkAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $oldPass = trim($input['oldPassword'] ?? '');
    $newPass = trim($input['newPassword'] ?? '');
    
    if (strlen($newPass) < 4) {
        http_response_code(400);
        echo json_encode(['error' => 'La nueva contraseña debe tener al menos 4 caracteres']);
        exit;
    }

    $db = getDB();
    $username = $_SESSION['user']['username'];
    $stmt = $db->prepare("SELECT password FROM usuarios WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && password_verify($oldPass, $user['password'])) {
        $hashed = password_hash($newPass, PASSWORD_DEFAULT);
        $update = $db->prepare("UPDATE usuarios SET password = ? WHERE username = ?");
        $update->execute([$hashed, $username]);
        echo json_encode(['success' => true, 'message' => 'Contraseña actualizada correctamente']);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'La contraseña actual es incorrecta']);
    }
    exit;
    exit;
}

// ---- Gestión de Usuarios (Admin) ----
if ($action === 'getUsers' || $action === 'saveUser' || $action === 'deleteUser') {
    checkAdmin();
    $db = getDB();
    
    // 1. Garantizar Tabla
    $db->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        role ENUM('admin', 'usuario') DEFAULT 'usuario',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Garantizar Columnas (Compatibilidad con MySQL < 8.0.19)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM usuarios");
        $cols = $stmtCol->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('email', $cols)) { $db->exec("ALTER TABLE usuarios ADD email VARCHAR(100) NULL AFTER display_name"); }
        if (!in_array('telefono', $cols)) { $db->exec("ALTER TABLE usuarios ADD telefono VARCHAR(20) NULL AFTER email"); }
    } catch (Exception $e) {}

    if ($action === 'getUsers') {
        $stmt = $db->query("SELECT id, username, display_name, role, email, telefono, created_at FROM usuarios ORDER BY id ASC");
        echo json_encode(['success' => true, 'users' => $stmt->fetchAll()]);
        exit;
    }

    if ($action === 'saveUser') {
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? null;
        $username = trim($input['username'] ?? '');
        $password = trim($input['password'] ?? '');
        $role = $input['role'] ?? 'usuario';
        $displayName = trim($input['display_name'] ?? '');
        $email = trim($input['email'] ?? '');
        $telefono = trim($input['telefono'] ?? '');

        if (!$username || !$displayName) {
            http_response_code(400);
            echo json_encode(['error' => 'Faltan campos obligatorios']);
            exit;
        }

        if ($id) {
            if ($password) {
                $hashed = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $db->prepare("UPDATE usuarios SET username = ?, password = ?, display_name = ?, role = ?, email = ?, telefono = ? WHERE id = ?");
                $stmt->execute([$username, $hashed, $displayName, $role, $email, $telefono, $id]);
            } else {
                $stmt = $db->prepare("UPDATE usuarios SET username = ?, display_name = ?, role = ?, email = ?, telefono = ? WHERE id = ?");
                $stmt->execute([$username, $displayName, $role, $email, $telefono, $id]);
            }
        } else {
            if (!$password) {
                http_response_code(400);
                echo json_encode(['error' => 'La contraseña es obligatoria para nuevos usuarios']);
                exit;
            }
            $hashed = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $db->prepare("INSERT INTO usuarios (username, password, display_name, role, email, telefono) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$username, $hashed, $displayName, $role, $email, $telefono]);
        }
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'deleteUser') {
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID de usuario no proporcionado']);
            exit;
        }
        if ($id == ($_SESSION['user']['id'] ?? 0)) {
            http_response_code(400);
            echo json_encode(['error' => 'No puedes eliminar tu propio usuario']);
            exit;
        }
        $stmt = $db->prepare("DELETE FROM usuarios WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }
}

if ($action === 'testSigpac') {
    $lat = $_GET['lat'] ?? '38.5299';
    $lng = $_GET['lng'] ?? '-3.5004';
    $url = "https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/$lng/$lat.json";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_ENCODING, "");
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    echo json_encode([
        'success' => $httpCode === 200,
        'httpCode' => $httpCode,
        'error' => $error,
        'url' => $url,
        'response_preview' => mb_substr($response, 0, 500)
    ]);
    exit;
}

if ($action === 'diag') {
    echo json_encode([
        'php_version' => PHP_VERSION,
        'curl_enabled' => function_exists('curl_init'),
        'openssl_enabled' => extension_loaded('openssl'),
        'zlib_enabled' => extension_loaded('zlib'),
        'server_software' => $_SERVER['SERVER_SOFTWARE'],
        'protocol' => $_SERVER['SERVER_PROTOCOL']
    ]);
    exit;
}

if ($action === 'getSigpacInfo') {
    checkAuth();
    $lat = $_GET['lat'] ?? '';
    $lng = $_GET['lng'] ?? '';
    if (!$lat || !$lng) {
        echo json_encode(['error' => 'Faltan coordenadas']);
        exit;
    }

    $lat = (float)$lat;
    $lng = (float)$lng;

    $commonOptions = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_ENCODING => "",
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    $urls = [
        "https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/$lng/$lat.json",
        "https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/$lat/$lng.json",
        "https://sigpac.mapa.gob.es/fega/serviciosrest/recintos/query/4326/$lng/$lat/"
    ];

    $errors = [];
    
    foreach ($urls as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, $commonOptions);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && $res) {
            $data = json_decode($res, true);
            if (isset($data['features'][0]['properties'])) {
                $p = $data['features'][0]['properties'];
                echo json_encode([
                    'success' => true,
                    'referencia' => sprintf("%d/%d/%d/%d/%d/%d/%d", $p['provincia'], $p['municipio'], $p['agregado'], $p['zona'], $p['poligono'], $p['parcela'], $p['recinto']),
                    'superficie' => $p['superficie'],
                    'recinto' => $p
                ]);
                exit;
            } else if (isset($data[0])) {
                $p = $data[0];
                echo json_encode([
                    'success' => true,
                    'referencia' => sprintf("%d/%d/%d/%d/%d/%d/%d", $p['provincia'], $p['municipio'], $p['agregado'], $p['zona'], $p['poligono'], $p['parcela'], $p['recinto']),
                    'superficie' => $p['superficie'],
                    'recinto' => $p
                ]);
                exit;
            }
        }
        $errors[] = "$url (Code: $httpCode" . ($curlError ? ", Err: $curlError" : "") . ")";
    }

    echo json_encode(['error' => "Fallo total SIGPAC. Intentos: " . implode(" | ", $errors)]);
    exit;
    exit;
}

// Todas las demás acciones requieren autenticación
checkAuth();

$collection = isset($_GET['collection']) ? validCollection($_GET['collection']) : '';

switch ($action) {

    // =====================
    // GET ALL
    // =====================
    case 'getAll':
        $db = getDB();
        $stmt = $db->query("SELECT * FROM `$collection` ORDER BY createdAt DESC");
        echo json_encode($stmt->fetchAll());
        break;

    // =====================
    // GET BY ID
    // =====================
    case 'getById':
        $id = intval($_GET['id'] ?? 0);
        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM `$collection` WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        echo json_encode($row ?: null);
        break;

    // =====================
    // ADD
    // =====================
    case 'add':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['error' => 'Datos no válidos']);
            exit;
        }
        $db = getDB();

        if ($collection === 'parcelas') {
            $stmt = $db->prepare("INSERT INTO parcelas (nombre, variedad, superficie, referencia_sigpac, notas, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
                $input['variedad'] ?? null,
                $input['superficie'] ?? null,
                $input['referencia_sigpac'] ?? null,
                $input['notas'] ?? '',
                $input['lat'] ?? null,
                $input['lng'] ?? null
            ]);
        } elseif ($collection === 'trabajos') {
            $stmt = $db->prepare("INSERT INTO trabajos (nombre, icono, tipo_legal, predefinido) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
                $input['icono'] ?? '🔧',
                $input['tipo_legal'] ?? 'general',
                $input['predefinido'] ?? 0
            ]);
        } elseif ($collection === 'inventario') {
            $stmt = $db->prepare("INSERT INTO inventario (nombre, tipo, stock, unidad, ubicacion, precio_unidad) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
                $input['tipo'] ?? 'otro',
                $input['stock'] ?? 0.00,
                $input['unidad'] ?? 'unidades',
                $input['ubicacion'] ?? null,
                $input['precio_unidad'] ?? 0.00
            ]);
        } elseif ($collection === 'maquinaria') {
            $stmt = $db->prepare("INSERT INTO maquinaria (nombre, tipo, coste_hora, precio_compra, fecha_compra, estado) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
                $input['tipo'] ?? null,
                $input['coste_hora'] ?? 0.00,
                $input['precio_compra'] ?? 0.00,
                $input['fecha_compra'] ?? date('Y-m-d'),
                'activo'
            ]);
            $maqId = $db->lastInsertId();

            // Registrar movimiento financiero (Compra)
            if (($input['precio_compra'] ?? 0) > 0) {
                $stmtF = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion, referencia_id, referencia_tabla) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtF->execute([
                    $input['fecha_compra'] ?? date('Y-m-d'),
                    'gasto',
                    'maquinaria',
                    $input['precio_compra'],
                    "Compra Maquinaria: " . ($input['nombre'] ?? ''),
                    $maqId,
                    'maquinaria'
                ]);
            }
        } elseif ($collection === 'registros') {
            $invId = isset($input['inventarioId']) ? intval($input['inventarioId']) : null;
            $maqId = isset($input['maquinariaId']) ? intval($input['maquinariaId']) : null;
            $cantUsada = isset($input['cantidad_usada']) ? floatval($input['cantidad_usada']) : null;
            $duracion = isset($input['duracion_horas']) ? floatval($input['duracion_horas']) : null;
            $costeManual = isset($input['coste']) ? floatval($input['coste']) : 0.00;

            if ($invId && $cantUsada) {
                $db->prepare("UPDATE inventario SET stock = stock - ? WHERE id = ?")->execute([$cantUsada, $invId]);
            }

            if ($maqId && $duracion && $costeManual == 0) {
                $stmtMaq = $db->prepare("SELECT coste_hora FROM maquinaria WHERE id = ?");
                $stmtMaq->execute([$maqId]);
                $maq = $stmtMaq->fetch();
                if ($maq) $costeManual = $maq['coste_hora'] * $duracion;
            }

            if ($costeManual != 0) {
                $stmtT = $db->prepare("SELECT nombre FROM trabajos WHERE id = ?");
                $stmtT->execute([intval($input['trabajoId'])]);
                $trab = $stmtT->fetch();
                
                $tipoFin = $costeManual > 0 ? 'gasto' : 'ingreso';
                $stmtF = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion, referencia_id, referencia_tabla) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtF->execute([
                    $input['fecha'] ?? date('Y-m-d'),
                    $tipoFin,
                    'trabajo',
                    abs($costeManual),
                    ($trab ? $trab['nombre'] : 'Trabajo') . " - " . ($input['notas'] ?? ''),
                    0, 
                    'registros'
                ]);
                $finId = $db->lastInsertId();
            }

            $stmt = $db->prepare("INSERT INTO registros (parcelaId, trabajoId, maquinariaId, fecha, notas, coste, num_personas, nombres_personas, duracion_horas, inventarioId, cantidad_usada, producto_fito, num_registro_fito, dosis, plaga, carnet_aplicador, nutrientes, cantidad_abono, agua_riego, kg_recolectados, lote_trazabilidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                intval($input['parcelaId']),
                intval($input['trabajoId']),
                $maqId,
                $input['fecha'] ?? date('Y-m-d'),
                $input['notas'] ?? '',
                $costeManual,
                isset($input['num_personas']) ? intval($input['num_personas']) : 1,
                isset($input['nombres_personas']) ? $input['nombres_personas'] : null,
                $duracion,
                $invId,
                $cantUsada,
                $input['producto_fito'] ?? null,
                $input['num_registro_fito'] ?? null,
                $input['dosis'] ?? null,
                $input['plaga'] ?? null,
                $input['carnet_aplicador'] ?? null,
                $input['nutrientes'] ?? null,
                $input['cantidad_abono'] ?? null,
                isset($input['agua_riego']) && is_numeric($input['agua_riego']) ? floatval($input['agua_riego']) : null,
                isset($input['kg_recolectados']) && is_numeric($input['kg_recolectados']) ? floatval($input['kg_recolectados']) : null,
                $input['lote_trazabilidad'] ?? null
            ]);
            
            $newRegId = $db->lastInsertId();
            if (isset($finId)) {
                $db->prepare("UPDATE finanzas SET referencia_id = ? WHERE id = ?")->execute([$newRegId, $finId]);
            }
            $stmt2 = $db->prepare("SELECT * FROM registros WHERE id = ?");
            $stmt2->execute([$newRegId]);
        } elseif ($collection === 'planing_progreso') {
            $stmt = $db->prepare("INSERT INTO planing_progreso (anio, mes_idx, tarea_idx, completado) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                intval($input['anio']),
                intval($input['mes_idx']),
                intval($input['tarea_idx']),
                $input['completado'] ? 1 : 0
            ]);
        } elseif ($collection === 'documentacion') {
            $stmt = $db->prepare("INSERT INTO documentacion (parcelaId, titulo, descripcion, url) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                intval($input['parcelaId']),
                $input['titulo'] ?? '',
                $input['descripcion'] ?? null,
                $input['url'] ?? null
            ]);
        } elseif ($collection === 'maquinaria_reparaciones') {
            $stmt = $db->prepare("INSERT INTO maquinaria_reparaciones (maquinariaId, fecha, descripcion, coste, tipo) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                intval($input['maquinariaId']),
                $input['fecha'] ?? date('Y-m-d'),
                $input['descripcion'] ?? '',
                $input['coste'] ?? 0.00,
                $input['tipo'] ?? 'reparacion'
            ]);
            $repId = $db->lastInsertId();

            // Registrar en finanzas
            if (($input['coste'] ?? 0) > 0) {
                $stmtM = $db->prepare("SELECT nombre FROM maquinaria WHERE id = ?");
                $stmtM->execute([intval($input['maquinariaId'])]);
                $maqNombre = $stmtM->fetchColumn() ?: 'Maquinaria';
                
                $stmtF = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion, referencia_id, referencia_tabla) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtF->execute([
                    $input['fecha'] ?? date('Y-m-d'),
                    'gasto',
                    'maquinaria',
                    $input['coste'],
                    "Mant./Reparación ($maqNombre): " . ($input['descripcion'] ?? ''),
                    $repId,
                    'maquinaria_reparaciones'
                ]);
            }
        } elseif ($collection === 'finanzas') {
            $stmt = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['fecha'] ?? date('Y-m-d'),
                $input['tipo'] ?? 'gasto',
                $input['categoria'] ?? 'manual',
                $input['monto'] ?? 0.00,
                $input['descripcion'] ?? ''
            ]);
        } elseif ($collection === 'cosechas_ventas') {
            $stmt = $db->prepare("INSERT INTO cosechas_ventas (registroId, fecha, kg_vendidos, precio_kg, total_bruto, notas) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                intval($input['registroId']),
                $input['fecha'] ?? date('Y-m-d'),
                $input['kg_vendidos'] ?? 0.00,
                $input['precio_kg'] ?? 0.00,
                $input['total_bruto'] ?? 0.00,
                $input['notas'] ?? ''
            ]);
            $ventaId = $db->lastInsertId();

            if (($input['total_bruto'] ?? 0) > 0) {
                $stmtF = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion, referencia_id, referencia_tabla) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmtF->execute([
                    $input['fecha'] ?? date('Y-m-d'),
                    'ingreso',
                    'cosecha',
                    $input['total_bruto'],
                    "Venta Cosecha: " . ($input['kg_vendidos'] ?? 0) . " kg",
                    $ventaId,
                    'cosechas_ventas'
                ]);
            }
        }

        if (isset($stmt2)) { echo json_encode($stmt2->fetch()); } else { echo json_encode(["success" => true]); }
        break;

    // =====================
    // UPDATE
    // =====================
    case 'update':
        $id = intval($_GET['id'] ?? 0);
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true);
        if (!$id || !$input) {
            http_response_code(400);
            echo json_encode(['error' => "ID o datos no válidos"]);
            exit;
        }
        $db = getDB();

        try {
            if ($collection === 'parcelas') {
                $stmt = $db->prepare("UPDATE parcelas SET nombre = ?, variedad = ?, superficie = ?, referencia_sigpac = ?, notas = ?, lat = ?, lng = ?, mapa_datos = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['variedad'] ?? null,
                    $input['superficie'] ?? null,
                    $input['referencia_sigpac'] ?? null,
                    $input['notas'] ?? '',
                    $input['lat'] ?? null,
                    $input['lng'] ?? null, $input['mapa_datos'] ?? null,
                    $id
                ]);
            } elseif ($collection === 'trabajos') {
                $stmt = $db->prepare("UPDATE trabajos SET nombre = ?, icono = ?, tipo_legal = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['icono'] ?? '🔧',
                    $input['tipo_legal'] ?? 'general',
                    $id
                ]);
            } elseif ($collection === 'inventario') {
                $stmt = $db->prepare("UPDATE inventario SET nombre = ?, tipo = ?, stock = ?, unidad = ?, ubicacion = ?, precio_unidad = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['tipo'] ?? 'otro',
                    $input['stock'] ?? 0.00,
                    $input['unidad'] ?? 'unidades',
                    $input['ubicacion'] ?? null,
                    $input['precio_unidad'] ?? 0.00,
                    $id
                ]);
            } elseif ($collection === 'maquinaria') {
                $stmt = $db->prepare("UPDATE maquinaria SET nombre = ?, tipo = ?, coste_hora = ?, precio_compra = ?, fecha_compra = ?, precio_venta = ?, fecha_venta = ?, estado = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['tipo'] ?? null,
                    $input['coste_hora'] ?? 0.00,
                    $input['precio_compra'] ?? 0.00,
                    $input['fecha_compra'] ?? null,
                    $input['precio_venta'] ?? 0.00,
                    $input['fecha_venta'] ?? null,
                    $input['estado'] ?? 'activo',
                    $id
                ]);

                if (isset($input['precio_venta']) && floatval($input['precio_venta']) > 0 && ($input['estado'] ?? '') === 'vendido') {
                    $stmtCheck = $db->prepare("SELECT id FROM finanzas WHERE referencia_id = ? AND referencia_tabla = 'maquinaria_venta'");
                    $stmtCheck->execute([$id]);
                    if (!$stmtCheck->fetch()) {
                        $stmtF = $db->prepare("INSERT INTO finanzas (fecha, tipo, categoria, monto, descripcion, referencia_id, referencia_tabla) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmtF->execute([
                            $input['fecha_venta'] ?? date('Y-m-d'),
                            'ingreso',
                            'maquinaria',
                            $input['precio_venta'],
                            "Venta Maquinaria: " . ($input['nombre'] ?? ''),
                            $id,
                            'maquinaria_venta'
                        ]);
                    }
                }
            }

            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error BD: ' . $e->getMessage()]);
        }
        break;

    // =====================
    // DELETE (Renombrado a borrar por WAF)
    // =====================
    case 'borrar':
        $id = intval($_GET['id'] ?? 0);
        $db = getDB();

        try {
            // Si es una foto, eliminar también el archivo
            if ($collection === 'fotos') {
                $stmt = $db->prepare("SELECT filename FROM fotos WHERE id = ?");
                $stmt->execute([$id]);
                $foto = $stmt->fetch();
                if ($foto && isset($foto['filename']) && $foto['filename'] && file_exists(UPLOAD_DIR . $foto['filename'])) {
                    unlink(UPLOAD_DIR . $foto['filename']);
                }
            }
            // Si es un documento, eliminar también el archivo
            if ($collection === 'documentacion') {
                $stmt = $db->prepare("SELECT filename FROM documentacion WHERE id = ?");
                $stmt->execute([$id]);
                $doc = $stmt->fetch();
                if ($doc && isset($doc['filename']) && $doc['filename'] && file_exists(UPLOAD_DIR . 'docs/' . $doc['filename'])) {
                    unlink(UPLOAD_DIR . 'docs/' . $doc['filename']);
                }
            }

            // LIMPIEZA FINANCIERA AUTOMÁTICA (Integridad de Datos)
            if ($collection === 'maquinaria_reparaciones') {
                $db->prepare("DELETE FROM finanzas WHERE referencia_id = ? AND referencia_tabla = 'maquinaria_reparaciones'")->execute([$id]);
            }
            if ($collection === 'maquinaria') {
                // Al borrar una máquina, borramos sus reparaciones y sus compras financieras
                $stmtR = $db->prepare("SELECT id FROM maquinaria_reparaciones WHERE maquinariaId = ?");
                $stmtR->execute([$id]);
                $reps = $stmtR->fetchAll();
                foreach($reps as $r) {
                    $db->prepare("DELETE FROM finanzas WHERE referencia_id = ? AND referencia_tabla = 'maquinaria_reparaciones'")->execute([$r['id']]);
                }
                $db->prepare("DELETE FROM maquinaria_reparaciones WHERE maquinariaId = ?")->execute([$id]);
                $db->prepare("DELETE FROM finanzas WHERE referencia_id = ? AND referencia_tabla = 'maquinaria'")->execute([$id]);
            }

            $stmt = $db->prepare("DELETE FROM `$collection` WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true, 'deleted' => $stmt->rowCount()]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error BD: ' . $e->getMessage()]);
        }
        break;

    // =====================
    // UPLOAD PHOTO
    // =====================
    case 'uploadPhoto':
        if (!isset($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'No se recibió la imagen correctamente']);
            exit;
        }

        $parcelaId = intval($_POST['parcelaId'] ?? 0);
        $reqRegId = $_POST['registroId'] ?? '';
        $registroId = ($reqRegId !== '' && $reqRegId !== 'undefined' && $reqRegId !== 'null') ? intval($reqRegId) : null;
        if ($registroId === 0) $registroId = null;
        $anio = intval($_POST['anio'] ?? date('Y'));
        $descripcion = $_POST['descripcion'] ?? '';

        if ($parcelaId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Parcela no válida']);
            exit;
        }

        // Validar tipo de archivo
        $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        $fileType = mime_content_type($_FILES['foto']['tmp_name']);
        if (!in_array($fileType, $allowedTypes)) {
            http_response_code(400);
            echo json_encode(['error' => 'Tipo de archivo no permitido. Usa JPG, PNG, WebP o GIF.']);
            exit;
        }

        // Limitar tamaño (10MB)
        if ($_FILES['foto']['size'] > 10 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['error' => 'La imagen es demasiado grande (máx 10MB)']);
            exit;
        }

        // Crear directorio si no existe
        if (!is_dir(UPLOAD_DIR)) {
            mkdir(UPLOAD_DIR, 0755, true);
        }

        // Generar nombre único
        $ext = pathinfo($_FILES['foto']['name'], PATHINFO_EXTENSION) ?: 'jpg';
        $filename = 'p' . $parcelaId . '_' . $anio . '_' . uniqid() . '.' . strtolower($ext);

        // Mover archivo
        if (!move_uploaded_file($_FILES['foto']['tmp_name'], UPLOAD_DIR . $filename)) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al guardar la imagen en el servidor']);
            exit;
        }

        // Guardar en BD
        $db = getDB();
        try {
            $stmt = $db->prepare("INSERT INTO fotos (parcelaId, registroId, anio, filename, descripcion) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$parcelaId, $registroId, $anio, $filename, $descripcion]);

            $newId = $db->lastInsertId();
            $stmt2 = $db->prepare("SELECT * FROM fotos WHERE id = ?");
            $stmt2->execute([$newId]);
            echo json_encode($stmt2->fetch());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al guardar foto en la BD (quizás el registro fue borrado).', 'detalles' => $e->getMessage()]);
        }
        break;

    // =====================
    // UPLOAD DOCUMENT
    // =====================
    case 'uploadDoc':
        if (!isset($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'No se recibió el archivo correctamente']);
            exit;
        }

        $parcelaId = intval($_POST['parcelaId'] ?? 0);
        $titulo = trim($_POST['titulo'] ?? 'Documento sin título');
        $descripcion = trim($_POST['descripcion'] ?? '');

        if ($parcelaId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Parcela no válida']);
            exit;
        }

        // Validar tipo de archivo permitido
        $allowedDocTypes = [
            'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];
        $fileType = mime_content_type($_FILES['archivo']['tmp_name']);
        if (!in_array($fileType, $allowedDocTypes)) {
            http_response_code(400);
            echo json_encode(['error' => 'Tipo de archivo no permitido (PDF, imágenes, Word, Excel, TXT)']);
            exit;
        }

        // Limitar tamaño (20MB)
        if ($_FILES['archivo']['size'] > 20 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['error' => 'El archivo es demasiado grande (máx 20MB)']);
            exit;
        }

        // Crear directorio docs si no existe
        $docsDir = UPLOAD_DIR . 'docs/';
        if (!is_dir($docsDir)) {
            mkdir($docsDir, 0755, true);
        }

        // Generar nombre único
        $ext = pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION) ?: 'pdf';
        $filename = 'doc_p' . $parcelaId . '_' . uniqid() . '.' . strtolower($ext);

        // Mover archivo
        if (!move_uploaded_file($_FILES['archivo']['tmp_name'], $docsDir . $filename)) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al guardar el documento en el servidor']);
            exit;
        }

        // Guardar en BD
        try {
            $db = getDB();
            $stmt = $db->prepare("INSERT INTO documentacion (parcelaId, titulo, descripcion, filename) VALUES (?, ?, ?, ?)");
            $stmt->execute([$parcelaId, $titulo, $descripcion, $filename]);

            $newId = $db->lastInsertId();
            $stmt2 = $db->prepare("SELECT * FROM documentacion WHERE id = ?");
            $stmt2->execute([$newId]);
            echo json_encode($stmt2->fetch());
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Error de base de datos: ' . $e->getMessage()]);
        }
        break;

    // =====================
    // GET PHOTOS BY PARCELA
    // =====================
    case 'getPhotos':
        $parcelaId = intval($_GET['parcelaId'] ?? 0);
        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM fotos WHERE parcelaId = ? ORDER BY anio DESC, createdAt DESC");
        $stmt->execute([$parcelaId]);
        echo json_encode($stmt->fetchAll());
        break;

    // =====================
    // GET PHOTO YEARS for a parcela
    // =====================
    case 'getPhotoYears':
        $parcelaId = intval($_GET['parcelaId'] ?? 0);
        $db = getDB();
        $stmt = $db->prepare("SELECT DISTINCT anio FROM fotos WHERE parcelaId = ? ORDER BY anio DESC");
        $stmt->execute([$parcelaId]);
        $years = array_column($stmt->fetchAll(), 'anio');
        echo json_encode($years);
        break;

    // =====================
    // EXPORT
    // =====================
    case 'export':
        $db = getDB();
        
        // Evitamos errores si la tabla planing_progreso aún no se ha creado
        $planingData = [];
        try {
            $planingData = $db->query("SELECT * FROM planing_progreso ORDER BY id")->fetchAll();
        } catch (Exception $e) {
            // Ignorar si la tabla no existe aún
        }

        $data = [
            'parcelas'         => $db->query("SELECT * FROM parcelas ORDER BY id")->fetchAll(),
            'trabajos'         => $db->query("SELECT * FROM trabajos ORDER BY id")->fetchAll(),
            'registros'        => $db->query("SELECT * FROM registros ORDER BY id")->fetchAll(),
            'fotos'            => $db->query("SELECT * FROM fotos ORDER BY id")->fetchAll(),
            'planing_progreso' => $planingData,
            'documentacion'    => $db->query("SELECT * FROM documentacion ORDER BY id")->fetchAll()
        ];
        echo json_encode($data, JSON_PRETTY_PRINT);
        break;

    // =====================
    // DEFAULT
    // =====================
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acción no válida']);
        break;
}
