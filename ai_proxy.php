<?php
/**
 * Garuto - Proxy para la API de Google Gemini (v4.4)
 */

// Permitir CORS (igual que api.php)
$allowedOrigins = ['https://tituta.es', 'https://www.tituta.es'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// ---- Cargar variables de entorno desde .env ----
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $value) = array_map('trim', explode('=', $line, 2));
            $normalizedKey = str_replace(' ', '_', $key);
            putenv("$normalizedKey=$value");
        }
    }
}

// Preferencia por Groq (sin tarjeta), fallback a Gemini
$apiKey = getenv('GROQ_API_KEY');
if (!$apiKey) {
    $apiKey = getenv('GEMINI_API_KEY');
}

// Autodetectar el motor basado en el formato de la clave (¡Foolproof!)
$isGroq = (strpos($apiKey, 'gsk_') === 0);

// MODO TEST (Si se accede por GET directamente)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json; charset=utf-8');
    $status = [
        'proxy' => 'online',
        'engine' => $isGroq ? 'Groq (Llama 3)' : 'Gemini (Google)',
        'api_key_set' => !empty($apiKey),
        'note' => 'Para usar la IA, envíe un POST con el prompt.'
    ];
    echo json_encode($status, JSON_PRETTY_PRINT);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// Obtener la consulta del usuario
$input = json_decode(file_get_contents('php://input'), true);
$userPrompt = $input['prompt'] ?? '';

if (!$apiKey) {
    echo json_encode(['error' => 'No hay API Key configurada. Añade GROQ_API_KEY en tu .env para usar Groq (sin tarjeta).']);
    exit;
}

if (empty($userPrompt)) {
    echo json_encode(['error' => 'No se ha proporcionado ninguna consulta.']);
    exit;
}

// System Prompt
$systemInstruction = "Eres Pistachín, el asistente inteligente de Garuto. Tono amable y experto agricultor. Si te piden datos propios (stock, parcelas, finanzas), diles que usen los botones o comandos locales. Para dudas agrícolas generales, responde tú brevemente en español de España.";

// Configuración según el motor
if ($isGroq) {
    $url = "https://api.groq.com/openai/v1/chat/completions";
    $data = [
        "model" => "llama-3.3-70b-versatile",
        "messages" => [
            ["role" => "system", "content" => $systemInstruction],
            ["role" => "user", "content" => $userPrompt]
        ],
        "temperature" => 0.7
    ];
} else {
    // Legacy Gemini Support
    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey;
    $data = [
        "contents" => [["parts" => [["text" => $systemInstruction . "\n\nUsuario dice: " . $userPrompt]]]]
    ];
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    $isGroq ? "Authorization: Bearer $apiKey" : ""
]);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    echo json_encode(['error' => 'Error CURL: ' . curl_error($ch)]);
} else {
    $result = json_decode($response, true);
    if ($httpCode >= 400) {
        $errorMsg = $result['error']['message'] ?? $result['error'] ?? 'Error desconocido del motor de IA.';
        echo json_encode(['error' => "IA Engine Error ($httpCode): " . $errorMsg]);
    } else {
        if ($isGroq) {
            $aiText = $result['choices'][0]['message']['content'] ?? 'Sin respuesta de Groq.';
        } else {
            $aiText = $result['candidates'][0]['content']['parts'][0]['text'] ?? 'Sin respuesta de Gemini.';
        }
        echo json_encode(['response' => trim($aiText)]);
    }
}
curl_close($ch);
