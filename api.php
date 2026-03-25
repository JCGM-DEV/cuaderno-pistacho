<?php
ob_start();
$debug = getenv('APP_DEBUG') === '1';
error_reporting(E_ALL);
ini_set('display_errors', $debug ? '1' : '0');
ini_set('log_errors', '1');
/* ======================================================
   Garuto — API REST (PHP + MySQL)
   ====================================================== */

// ---- Configuración de Base de Datos ----
// Cargar variables de entorno desde archivo .env si existe
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $value) = array_map('trim', explode('=', $line, 2));
            putenv("$key=$value");
        }
    }
}

define('DB_HOST', getenv('DB_HOST') ?: 'PMYSQL187.dns-servicio.com');
define('DB_NAME', getenv('DB_NAME') ?: '10833629_cuadernodecampo');
define('DB_USER', getenv('DB_USER') ?: 'garuto');
define('DB_PASS', getenv('DB_PASS') ?: '2G80j%6kq');
define('DB_CHARSET', 'utf8mb4');

// Usuarios cargados desde la base de datos (se usa password_verify)

// ---- Configuración de Sesiones ----
session_start([
    'cookie_httponly' => true,
    'cookie_secure'   => true,
    'cookie_samesite' => 'Lax'
]);

// ---- CSRF Protection ----
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function checkCSRF() {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || $token !== ($_SESSION['csrf_token'] ?? '')) {
        http_response_code(403);
        echo json_encode(['error' => 'Error de seguridad CSRF. Recargue la página e intente de nuevo.']);
        exit;
    }
}

// ---- Directorio de uploads ----
define('UPLOAD_DIR', __DIR__ . '/uploads/');

// ---- CORS y Headers ----
header('Content-Type: application/json; charset=utf-8');
$allowedOrigins = ['https://tituta.es', 'https://www.tituta.es'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

// Preflight
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_clean();
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

function ensureSchema($db) {
    // 1. Garantizar Tablas
    $db->exec("CREATE TABLE IF NOT EXISTS parcelas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        variedad VARCHAR(100),
        superficie DECIMAL(10,4),
        referencia_sigpac VARCHAR(100),
        notas TEXT,
        lat DECIMAL(10,8),
        lng DECIMAL(11,8),
        mapa_datos LONGTEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        role ENUM('admin', 'usuario') DEFAULT 'usuario',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    $db->exec("CREATE TABLE IF NOT EXISTS inventario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tipo VARCHAR(50),
        stock DECIMAL(10,2) DEFAULT 0,
        unidad VARCHAR(50) DEFAULT 'unidades',
        ubicacion VARCHAR(255),
        precio_unidad DECIMAL(10,2) DEFAULT 0.00
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS documentacion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parcelaId INT,
        titulo VARCHAR(255),
        descripcion TEXT,
        url VARCHAR(255),
        filename VARCHAR(255),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $db->exec("CREATE TABLE IF NOT EXISTS maquinaria_reparaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        maquinariaId INT,
        fecha DATE,
        descripcion TEXT,
        coste DECIMAL(10,2),
        tipo VARCHAR(50),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // 2. Garantizar Columnas (Compatibilidad con MySQL < 8.0.19)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM usuarios");
        $cols = $stmtCol->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('email', $cols)) { $db->exec("ALTER TABLE usuarios ADD email VARCHAR(100) NULL AFTER display_name"); }
        if (!in_array('telefono', $cols)) { $db->exec("ALTER TABLE usuarios ADD telefono VARCHAR(20) NULL AFTER email"); }
        if (!in_array('nif', $cols)) { $db->exec("ALTER TABLE usuarios ADD nif VARCHAR(20) NULL AFTER telefono"); }
        if (!in_array('direccion', $cols)) { $db->exec("ALTER TABLE usuarios ADD direccion TEXT NULL AFTER nif"); }
        if (!in_array('num_rea', $cols)) { $db->exec("ALTER TABLE usuarios ADD num_rea VARCHAR(50) NULL AFTER direccion"); }
        if (!in_array('num_roma', $cols)) { $db->exec("ALTER TABLE usuarios ADD num_roma VARCHAR(50) NULL AFTER num_rea"); }
    } catch (Exception $e) {}

    // 3. Garantizar Columnas en Maquinaria Reparaciones (factura)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM maquinaria_reparaciones");
        $cols = $stmtCol->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('factura', $cols)) { 
            $db->exec("ALTER TABLE maquinaria_reparaciones ADD factura VARCHAR(255) NULL AFTER tipo"); 
        }
    } catch (Exception $e) {}

    // 4. Garantizar Columnas en Inventario (factura)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM inventario");
        $cols = $stmtCol->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('factura', $cols)) { 
            $db->exec("ALTER TABLE inventario ADD factura VARCHAR(255) NULL AFTER precio_unidad"); 
        }
    } catch (Exception $e) {}

    // 5. Garantizar Columnas en Maquinaria (factura)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM maquinaria");
        $cols = $stmtCol->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('factura', $cols)) { 
            $db->exec("ALTER TABLE maquinaria ADD factura VARCHAR(255) NULL AFTER fecha_compra"); 
        }
    } catch (Exception $e) {}

    // 6. Garantizar Columnas en Parcelas (superficie precision)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM parcelas");
        $cols = $stmtCol->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cols as $col) {
            if ($col['Field'] === 'superficie') {
                // If it's not already decimal(10,4), fix it
                if (strtolower($col['Type']) !== 'decimal(10,4)') {
                    $db->exec("ALTER TABLE parcelas MODIFY COLUMN superficie DECIMAL(10,4)");
                }
            }
        }
    } catch (Exception $e) {}

    // 4. Garantizar Columnas en Registros (nombre_aplicador)

    // 4. Garantizar Columnas en Inventario (tipo enum fix y columnas extra)
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM inventario");
        $cols = $stmtCol->fetchAll(PDO::FETCH_ASSOC);
        $foundPrecio = false;
        $foundUbicacion = false;
        $foundUnidad = false;
        foreach ($cols as $col) {
            if ($col['Field'] === 'precio_unidad') $foundPrecio = true;
            if ($col['Field'] === 'ubicacion') $foundUbicacion = true;
            if ($col['Field'] === 'unidad') $foundUnidad = true;
            if ($col['Field'] === 'tipo') {
                if (strpos($col['Type'], 'enum') !== false && strpos($col['Type'], 'herbicida') === false) {
                    $newType = str_replace(")", ",'herbicida')", $col['Type']);
                    $db->exec("ALTER TABLE inventario MODIFY COLUMN tipo $newType");
                }
            }
        }
        if (!$foundUnidad) { $db->exec("ALTER TABLE inventario ADD unidad VARCHAR(50) DEFAULT 'unidades'"); }
        if (!$foundUbicacion) { $db->exec("ALTER TABLE inventario ADD ubicacion VARCHAR(255) NULL"); }
        if (!$foundPrecio) { $db->exec("ALTER TABLE inventario ADD precio_unidad DECIMAL(10,2) DEFAULT 0.00"); }
    } catch (Exception $e) {
        error_log("DB INIT ERROR (Inventario): " . $e->getMessage());
    }

    // 5. Garantizar columna 'factura' en maquinaria_reparaciones
    try {
        $stmtCol = $db->query("SHOW COLUMNS FROM maquinaria_reparaciones LIKE 'factura'");
        if (!$stmtCol->fetch()) {
            $db->exec("ALTER TABLE maquinaria_reparaciones ADD COLUMN factura VARCHAR(255) DEFAULT NULL");
        }
    } catch (Exception $e) {
        error_log("DB INIT ERROR (maquinaria_reparaciones factura): " . $e->getMessage());
    }
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
            'role' => $user['role'],
            'nif' => $user['nif'],
            'direccion' => $user['direccion'],
            'num_rea' => $user['num_rea'],
            'num_roma' => $user['num_roma']
        ];
        echo json_encode(['success' => true, 'user' => $_SESSION['user'], 'csrfToken' => $_SESSION['csrf_token']]);
        exit;
    }
    http_response_code(401);
    echo json_encode(['error' => 'Usuario o contraseña incorrectos']);
    exit;
}

if ($action === 'checkSession') {
    if (isset($_SESSION['user'])) {
        echo json_encode(['authenticated' => true, 'user' => $_SESSION['user'], 'csrfToken' => $_SESSION['csrf_token']]);
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
    checkCSRF();
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
}

// Maintenance moved to global or function
$db = getDB();
ensureSchema($db);

if ($action === 'getUsers' || $action === 'saveUser' || $action === 'deleteUser') {
    if ($action !== 'getUsers') checkCSRF();
    checkAdmin();

    if ($action === 'getUsers') {
        $stmt = $db->query("SELECT id, username, display_name, role, email, telefono, nif, direccion, num_rea, num_roma, created_at FROM usuarios ORDER BY id ASC");
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
        $nif = trim($input['nif'] ?? '');
        $direccion = trim($input['direccion'] ?? '');
        $num_rea = trim($input['num_rea'] ?? '');
        $num_roma = trim($input['num_roma'] ?? '');

        if (!$username || !$displayName) {
            http_response_code(400);
            echo json_encode(['error' => 'Faltan campos obligatorios']);
            exit;
        }

        if ($id) {
            if ($password) {
                $stmt = $db->prepare("UPDATE usuarios SET username = ?, password = ?, display_name = ?, role = ?, email = ?, telefono = ?, nif = ?, direccion = ?, num_rea = ?, num_roma = ? WHERE id = ?");
                $stmt->execute([$username, $hashed, $displayName, $role, $email, $telefono, $nif, $direccion, $num_rea, $num_roma, $id]);
            } else {
                $stmt = $db->prepare("UPDATE usuarios SET username = ?, display_name = ?, role = ?, email = ?, telefono = ?, nif = ?, direccion = ?, num_rea = ?, num_roma = ? WHERE id = ?");
                $stmt->execute([$username, $displayName, $role, $email, $telefono, $nif, $direccion, $num_rea, $num_roma, $id]);
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
}

// Todas las demás acciones requieren autenticación
checkAuth();

$collection = isset($_GET['collection']) ? validCollection($_GET['collection']) : '';

// Validar CSRF para acciones mutativas
$mutativeActions = ['add', 'update', 'borrar', 'uploadPhoto', 'uploadDoc', 'uploadFactura', 'import'];
if (in_array($action, $mutativeActions)) {
    checkCSRF();
}

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
            try {
                $stmt = $db->prepare("INSERT INTO inventario (nombre, tipo, stock, unidad, ubicacion, precio_unidad, factura) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $input['nombre'],
                    $input['tipo'] ?? 'Producto',
                    $input['stock'] ?? 0,
                    $input['unidad'] ?? 'Un',
                    $input['ubicacion'] ?? '',
                    $input['precio_unidad'] ?? 0,
                    $input['factura'] ?? null
                ]);
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Error en la base de datos: ' . $e->getMessage()]);
                exit;
            }
        } elseif ($collection === 'maquinaria') {
            $stmt = $db->prepare("INSERT INTO maquinaria (nombre, tipo, coste_hora, precio_compra, fecha_compra, estado, factura) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'],
                $input['tipo'] ?? '',
                $input['coste_hora'] ?? 0,
                $input['precio_compra'] ?? 0,
                $input['fecha_compra'] ?? null,
                $input['estado'] ?? 'Activo',
                $input['factura'] ?? null
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
            $cantUsada = isset($input['cantidad_usada']) ? abs(floatval($input['cantidad_usada'])) : null;
            $duracion = isset($input['duracion_horas']) ? abs(floatval($input['duracion_horas'])) : null;
            $costeManual = isset($input['coste']) ? abs(floatval($input['coste'])) : 0.00;
            $fechaReal = !empty($input['fecha']) ? $input['fecha'] : date('Y-m-d');

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
                    $fechaReal,
                    $tipoFin,
                    'trabajo',
                    abs($costeManual),
                    ($trab ? $trab['nombre'] : 'Trabajo') . " - " . ($input['notas'] ?? ''),
                    0, 
                    'registros'
                ]);
                $finId = $db->lastInsertId();
            }

            try {
                $stmt = $db->prepare("INSERT INTO registros (parcelaId, trabajoId, maquinariaId, fecha, notas, coste, num_personas, nombres_personas, duracion_horas, inventarioId, cantidad_usada, producto_fito, num_registro_fito, dosis, plaga, carnet_aplicador, nombre_aplicador, nutrientes, cantidad_abono, agua_riego, kg_recolectados, lote_trazabilidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    intval($input['parcelaId']),
                    intval($input['trabajoId']),
                    $maqId,
                    $fechaReal,
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
                    $input['nombre_aplicador'] ?? null,
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
            } catch (PDOException $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Error en la base de datos (registros): ' . $e->getMessage()]);
                exit;
            }
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
            $stmt = $db->prepare("INSERT INTO maquinaria_reparaciones (maquinariaId, fecha, descripcion, coste, tipo, factura) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                intval($input['maquinariaId']),
                $input['fecha'] ?? date('Y-m-d'),
                $input['descripcion'] ?? '',
                $input['coste'] ?? 0.00,
                $input['tipo'] ?? 'reparacion',
                $input['factura'] ?? null
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
                $fields = [];
                $params = [];
                $allowedFields = ['nombre', 'variedad', 'superficie', 'referencia_sigpac', 'notas', 'lat', 'lng', 'mapa_datos'];
                
                foreach ($allowedFields as $f) {
                    if (array_key_exists($f, $input)) {
                        $fields[] = "`$f` = ?";
                        $params[] = $input[$f];
                    }
                }
                
                if (empty($fields)) {
                    echo json_encode(['success' => true, 'message' => 'Nada que actualizar']);
                    exit;
                }
                
                $params[] = $id;
                $sql = "UPDATE parcelas SET " . implode(', ', $fields) . " WHERE id = ?";
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
            } elseif ($collection === 'trabajos') {
                $stmt = $db->prepare("UPDATE trabajos SET nombre = ?, icono = ?, tipo_legal = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['icono'] ?? '🔧',
                    $input['tipo_legal'] ?? 'general',
                    $id
                ]);
            } elseif ($collection === 'inventario') {
                $stmt = $db->prepare("UPDATE inventario SET nombre = ?, tipo = ?, stock = ?, unidad = ?, ubicacion = ?, precio_unidad = ?, factura = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['tipo'] ?? 'otro',
                    $input['stock'] ?? 0.00,
                    $input['unidad'] ?? 'unidades',
                    $input['ubicacion'] ?? null,
                    $input['precio_unidad'] ?? 0.00,
                    $input['factura'] ?? null,
                    $id
                ]);
            } elseif ($collection === 'maquinaria') {
                $stmt = $db->prepare("UPDATE maquinaria SET nombre = ?, tipo = ?, coste_hora = ?, precio_compra = ?, fecha_compra = ?, precio_venta = ?, fecha_venta = ?, estado = ?, factura = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['tipo'] ?? null,
                    $input['coste_hora'] ?? 0.00,
                    $input['precio_compra'] ?? 0.00,
                    $input['fecha_compra'] ?? null,
                    $input['precio_venta'] ?? 0.00,
                    $input['fecha_venta'] ?? null,
                    $input['estado'] ?? 'activo',
                    $input['factura'] ?? null,
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
            } elseif ($collection === 'registros') {
                $maqId = isset($input['maquinariaId']) ? intval($input['maquinariaId']) : null;
                $invId = isset($input['inventarioId']) ? intval($input['inventarioId']) : null;
                
                $stmt = $db->prepare("UPDATE registros SET 
                    parcelaId = ?, trabajoId = ?, maquinariaId = ?, fecha = ?, notas = ?, 
                    coste = ?, num_personas = ?, nombres_personas = ?, duracion_horas = ?, 
                    inventarioId = ?, cantidad_usada = ?, producto_fito = ?, 
                    num_registro_fito = ?, dosis = ?, plaga = ?, carnet_aplicador = ?, 
                    nombre_aplicador = ?, nutrientes = ?, cantidad_abono = ?, 
                    agua_riego = ?, kg_recolectados = ?, lote_trazabilidad = ? 
                    WHERE id = ?");
                
                $stmt->execute([
                    intval($input['parcelaId']),
                    intval($input['trabajoId']),
                    $maqId,
                    $input['fecha'] ?? date('Y-m-d'),
                    $input['notas'] ?? '',
                    isset($input['coste']) ? floatval($input['coste']) : 0.00,
                    isset($input['num_personas']) ? intval($input['num_personas']) : 1,
                    $input['nombres_personas'] ?? null,
                    isset($input['duracion_horas']) ? floatval($input['duracion_horas']) : null,
                    $invId,
                    isset($input['cantidad_usada']) ? floatval($input['cantidad_usada']) : null,
                    $input['producto_fito'] ?? null,
                    $input['num_registro_fito'] ?? null,
                    $input['dosis'] ?? null,
                    $input['plaga'] ?? null,
                    $input['carnet_aplicador'] ?? null,
                    $input['nombre_aplicador'] ?? null,
                    $input['nutrientes'] ?? null,
                    $input['cantidad_abono'] ?? null,
                    isset($input['agua_riego']) ? floatval($input['agua_riego']) : null,
                    isset($input['kg_recolectados']) ? floatval($input['kg_recolectados']) : null,
                    $input['lote_trazabilidad'] ?? null,
                    $id
                ]);
            } elseif ($collection === 'maquinaria_reparaciones') {
                $stmt = $db->prepare("UPDATE maquinaria_reparaciones SET maquinariaId = ?, fecha = ?, descripcion = ?, coste = ?, tipo = ?, factura = ? WHERE id = ?");
                $stmt->execute([
                    intval($input['maquinariaId']),
                    $input['fecha'] ?? date('Y-m-d'),
                    $input['descripcion'] ?? '',
                    $input['coste'] ?? 0.00,
                    $input['tipo'] ?? 'reparacion',
                    $input['factura'] ?? null,
                    $id
                ]);
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

            // LIMPIEZA DE FACTURAS (Inventario y Maquinaria)
            if ($collection === 'inventario') {
                $stmtF = $db->prepare("SELECT factura FROM inventario WHERE id = ?");
                $stmtF->execute([$id]);
                $f = $stmtF->fetch();
                if ($f && $f['factura'] && file_exists(UPLOAD_DIR . 'facturas/' . $f['factura'])) {
                    unlink(UPLOAD_DIR . 'facturas/' . $f['factura']);
                }
            }
            if ($collection === 'maquinaria') {
                $stmtF = $db->prepare("SELECT factura FROM maquinaria WHERE id = ?");
                $stmtF->execute([$id]);
                $f = $stmtF->fetch();
                if ($f && $f['factura'] && file_exists(UPLOAD_DIR . 'facturas/' . $f['factura'])) {
                    unlink(UPLOAD_DIR . 'facturas/' . $f['factura']);
                }
                // Al borrar una máquina, borramos sus reparaciones y sus compras financieras
                $stmtF = $db->prepare("SELECT factura FROM maquinaria_reparaciones WHERE id = ?");
                $stmtF->execute([$id]);
                $f = $stmtF->fetch();
                if ($f && $f['factura'] && file_exists(UPLOAD_DIR . 'facturas/' . $f['factura'])) {
                    unlink(UPLOAD_DIR . 'facturas/' . $f['factura']);
                }
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
        $allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        $fileType = mime_content_type($_FILES['foto']['tmp_name']);
        if (!array_key_exists($fileType, $allowedTypes)) {
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

        // Generar nombre único usando extensión segura
        $safeExt = $allowedTypes[$fileType];
        $filename = 'p' . $parcelaId . '_' . $anio . '_' . uniqid() . '.' . $safeExt;

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
    // UPLOAD FACTURA (MAQUINARIA)
    // =====================
    case 'uploadFactura':
        if (!isset($_FILES['factura']) || $_FILES['factura']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'No se recibió la factura correctamente']);
            exit;
        }

        // Crear directorio facturas si no existe
        $factDir = UPLOAD_DIR . 'facturas/';
        if (!is_dir($factDir)) {
            mkdir($factDir, 0755, true);
        }

        // Generar nombre único
        $ext = pathinfo($_FILES['factura']['name'], PATHINFO_EXTENSION) ?: 'jpg';
        $filename = 'factura_maq_' . uniqid() . '.' . strtolower($ext);

        // Mover archivo
        if (!move_uploaded_file($_FILES['factura']['tmp_name'], $factDir . $filename)) {
            http_response_code(500);
            echo json_encode(['error' => 'Error al guardar la factura en el servidor']);
            exit;
        }

        echo json_encode(['success' => true, 'filename' => $filename]);
        break;

    // =====================
    // GET PHOTOS BY PARCELA
    // =====================
    case 'getPhotos':
        $parcelaId = intval($_GET['parcelaId'] ?? 0);
        $db = getDB();
        $stmt = $db->prepare("
            SELECT f.*, r.fecha as registroFecha, t.nombre as trabajoNombre, t.icono as trabajoIcono
            FROM fotos f
            LEFT JOIN registros r ON f.registroId = r.id
            LEFT JOIN trabajos t ON r.trabajoId = t.id
            WHERE f.parcelaId = ?
            ORDER BY f.anio DESC, f.createdAt DESC
        ");
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
        $tables = ['parcelas', 'trabajos', 'registros', 'fotos', 'planing_progreso', 'inventario', 'maquinaria', 'documentacion', 'maquinaria_reparaciones', 'finanzas', 'cosechas_ventas'];
        $data = [];
        foreach ($tables as $table) {
            try {
                $stmt = $db->query("SELECT * FROM `$table` ORDER BY id");
                $data[$table] = $stmt->fetchAll();
            } catch (Exception $e) {
                $data[$table] = []; // Silencioso si la tabla no existe
            }
        }
        echo json_encode($data, JSON_PRETTY_PRINT);
        break;

    // =====================
    // IMPORT (Restore)
    // =====================
    case 'import':
        checkAdmin(); // Solo administradores pueden restaurar
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !is_array($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Datos de importación no válidos']);
            exit;
        }

        $db = getDB();
        $db->beginTransaction();
        try {
            $allowed = ['parcelas', 'trabajos', 'registros', 'fotos', 'planing_progreso', 'inventario', 'maquinaria', 'documentacion', 'maquinaria_reparaciones', 'finanzas', 'cosechas_ventas'];
            
            foreach ($input as $table => $rows) {
                if (!in_array($table, $allowed)) continue;
                
                // Vaciar tabla
                $db->exec("DELETE FROM `$table` "); 
                $db->exec("TRUNCATE TABLE `$table` "); 

                if (empty($rows)) continue;

                // Dinámicamente construir el INSERT
                $columns = array_keys($rows[0]);
                $colNames = implode('`, `', $columns);
                $placeholders = implode(', ', array_fill(0, count($columns), '?'));
                $sql = "INSERT INTO `$table` (`$colNames`) VALUES ($placeholders)";
                $stmt = $db->prepare($sql);

                foreach ($rows as $row) {
                    $values = [];
                    foreach ($columns as $col) {
                        $values[] = $row[$col];
                    }
                    $stmt->execute($values);
                }
            }
            $db->commit();
            echo json_encode(['success' => true, 'message' => 'Sistema restaurado correctamente']);
        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Error durante la restauración: ' . $e->getMessage()]);
        }
        break;

    // =====================
    // EXPORT SIEX (OFICIAL CUE)
    // =====================
    case 'exportSIEX':
        $db = getDB();
        $user = $_SESSION['user'];
        $data = [
            'metadata' => [
                'software' => 'Garuto Cuaderno Digital',
                'version' => '2026.1',
                'timestamp' => date('c')
            ],
            'titular' => [
                'nombre' => $user['displayName'],
                'nif' => $user['nif'] ?? 'Pendiente',
                'num_rea' => $user['num_rea'] ?? 'Pendiente',
                'num_roma' => $user['num_roma'] ?? 'Pendiente',
                'direccion' => $user['direccion'] ?? 'Pendiente'
            ],
            'parcelas' => [],
            'registros_siex' => []
        ];

        // Obtener Parcelas
        $stmtP = $db->query("SELECT nombre, variedad, superficie, referencia_sigpac, lat, lng FROM parcelas");
        $data['parcelas'] = $stmtP->fetchAll();

        // Obtener Registros SIEX (Fitos, Abonos, Cosechas)
        $stmtR = $db->query("
            SELECT r.*, t.nombre as trabajo, t.tipo_legal 
            FROM registros r 
            JOIN trabajos t ON r.trabajoId = t.id 
            WHERE t.tipo_legal IN ('fitosanitario', 'herbicida', 'abono', 'cosecha')
            ORDER BY r.fecha DESC
        ");
        $data['registros_siex'] = $stmtR->fetchAll();

        header('Content-Disposition: attachment; filename="CUE_SIEX_OFICIAL_' . date('Y_m_d') . '.json"');
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
        break;

    // =====================
    // FETCH LONJA (MARKET PRICES via AI)
    // =====================
    case 'fetchLonja':
        checkCSRF();
        $cacheFile = __DIR__ . '/uploads/lonja_cache.json';
        $cacheTime = 24 * 3600; // 24 horas

        if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTime) && !isset($_GET['force'])) {
            echo file_get_contents($cacheFile);
            exit;
        }

        $apiKey = getenv('GEMINI_API_KEY'); 
        if (!$apiKey) {
            echo json_encode(['error' => 'API Key de IA no configurada']);
            exit;
        }

        // Prompt para obtener precios reales en formato JSON
        $prompt = "Busca los precios actuales del pistacho en las lonjas de España (Albacete, Murcia, etc.) para hoy " . date('d/m/Y') . ". Devuelve un JSON estrictamente con este formato: {\"prices\": [{\"n\": \"Kerman (Cerrado 18/20)\", \"p\": \"5.40\", \"t\": \"up\"}, ...], \"advice\": \"Frase corta de la IA sobre el mercado.\"}";

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Evitar fallos por certificados locales
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            "Authorization: Bearer $apiKey"
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'model' => 'llama-3.3-70b-versatile',
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'response_format' => ['type' => 'json_object']
        ]));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // LOG DE DEPURACIÓN TEMPORAL
        $logEntry = date('Y-m-d H:i:s') . " - HTTP: $httpCode - Error: $curlError - Response: $response\n";
        file_put_contents(__DIR__ . '/uploads/debug_lonja.log', $logEntry, FILE_APPEND);

        if ($httpCode === 200) {
            $data = json_decode($response, true);
            $content = $data['choices'][0]['message']['content'] ?? '{}';
            // Guardar en cache
            file_put_contents($cacheFile, $content);
            ob_clean();
            echo $content;
        } else {
            ob_clean();
            echo json_encode(['error' => 'Error al obtener datos de la IA: ' . $httpCode . ' ' . $curlError]);
        }
        exit;
        break;

    // =====================
    // DEFAULT
    // =====================
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Acción no válida']);
        break;
}
