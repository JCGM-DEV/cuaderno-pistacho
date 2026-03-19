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

// ---- Usuarios (cargables por entorno) ----
$AUTH_USERS = [
    ['username' => 'admin',   'password' => 'admin1234',  'displayName' => 'Administrador'],
    ['username' => 'usuario', 'password' => 'campo2024',   'displayName' => 'Usuario Campo']
];

$authUsersEnv = getenv('AUTH_USERS_JSON');
if ($authUsersEnv) {
    $decodedUsers = json_decode($authUsersEnv, true);
    if (is_array($decodedUsers) && count($decodedUsers) > 0) {
        $AUTH_USERS = $decodedUsers;
    }
}

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
    $allowed = ['parcelas', 'trabajos', 'registros', 'fotos', 'planing_progreso', 'inventario', 'maquinaria', 'documentacion', 'maquinaria_reparaciones'];
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

// ---- Router ----
$action = $_GET['action'] ?? '';

// Rutas públicas
if ($action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');

    foreach ($AUTH_USERS as $user) {
        if (strtolower($user['username']) === strtolower($username) && $user['password'] === $password) {
            session_regenerate_id(true);
            $_SESSION['user'] = [
                'username' => $user['username'],
                'displayName' => $user['displayName']
            ];
            echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
            exit;
        }
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

    $url = "https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/$lng/$lat.json";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_ENCODING, ""); // Handle gzip
    curl_setopt($ch, CURLOPT_USERAGENT, 'Garuto/1.0');

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo json_encode(['error' => "Error SIGPAC ($httpCode)"]);
        exit;
    }

    $data = json_decode($response, true);
    if (!$data || !isset($data[0])) {
        echo json_encode(['error' => 'No se encontró recinto SIGPAC en este punto']);
        exit;
    }

    $recinto = $data[0];
    // Formatear referencia: Prov/Mun/Agr/Zon/Pol/Par/Rec
    $ref = sprintf("%d/%d/%d/%d/%d/%d/%d", 
        $recinto['provincia'], $recinto['municipio'], $recinto['agregado'], 
        $recinto['zona'], $recinto['poligono'], $recinto['parcela'], $recinto['recinto']
    );

    echo json_encode([
        'success' => true,
        'referencia' => $ref,
        'superficie' => $recinto['superficie'],
        'recinto' => $recinto
    ]);
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
            $stmt = $db->prepare("INSERT INTO parcelas (nombre, superficie, referencia_sigpac, notas, lat, lng) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
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
            $stmt = $db->prepare("INSERT INTO maquinaria (nombre, tipo, coste_hora) VALUES (?, ?, ?)");
            $stmt->execute([
                $input['nombre'] ?? '',
                $input['tipo'] ?? null,
                $input['coste_hora'] ?? 0.00
            ]);
        } elseif ($collection === 'registros') {
            // Lógica especial para registros: descontar stock y sumar costes
            $invId = isset($input['inventarioId']) ? intval($input['inventarioId']) : null;
            $maqId = isset($input['maquinariaId']) ? intval($input['maquinariaId']) : null;
            $cantUsada = isset($input['cantidad_usada']) ? floatval($input['cantidad_usada']) : null;
            $duracion = isset($input['duracion_horas']) ? floatval($input['duracion_horas']) : null;
            $costeManual = isset($input['coste']) ? floatval($input['coste']) : 0.00;

            // Si hay inventario, descontar stock
            if ($invId && $cantUsada) {
                $stmtInv = $db->prepare("UPDATE inventario SET stock = stock - ? WHERE id = ?");
                $stmtInv->execute([$cantUsada, $invId]);
            }

            // Si hay maquinaria y duración, añadir coste de maquinaria al total si el coste manual es 0 o sumarlo?
            // En Agroptima suele ser aditivo. Aquí si el usuario pone un coste, respetamos, si no, calculamos.
            if ($maqId && $duracion && $costeManual == 0) {
                $stmtMaq = $db->prepare("SELECT coste_hora FROM maquinaria WHERE id = ?");
                $stmtMaq->execute([$maqId]);
                $maq = $stmtMaq->fetch();
                if ($maq) {
                    $costeManual = $maq['coste_hora'] * $duracion;
                }
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
            
            // Retornar el registro recién creado para que JS tenga el ID (para subir fotos)
            $newId = $db->lastInsertId();
            $stmt2 = $db->prepare("SELECT * FROM registros WHERE id = ?");
            $stmt2->execute([$newId]);
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
            $stmt = $db->prepare("INSERT INTO maquinaria_reparaciones (maquinariaId, fecha, descripcion, coste) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                intval($input['maquinariaId']),
                $input['fecha'] ?? date('Y-m-d'),
                $input['descripcion'] ?? '',
                $input['coste'] ?? 0.00
            ]);
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
            $errDetail = !$id ? "Falta ID" : "Problema con el JSON (vacío o mal formado). Longitud: " . strlen($rawInput);
            echo json_encode(['error' => "ID o datos no válidos: $errDetail"]);
            exit;
        }
        $db = getDB();

        try {
            if ($collection === 'parcelas') {
                $stmt = $db->prepare("UPDATE parcelas SET nombre = ?, superficie = ?, referencia_sigpac = ?, notas = ?, lat = ?, lng = ?, mapa_datos = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
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
                $stmt = $db->prepare("UPDATE maquinaria SET nombre = ?, tipo = ?, coste_hora = ? WHERE id = ?");
                $stmt->execute([
                    $input['nombre'] ?? '',
                    $input['tipo'] ?? null,
                    $input['coste_hora'] ?? 0.00,
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
