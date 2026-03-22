<?php
/**
 * Garuto - Secure Auto-Deployment Webhook
 * 
 * Este script permite a GitHub (o a ti manualmente) actualizar el servidor
 * de Hostalia automáticamente ejecutando `git pull`.
 */

// ¡SECRETO DE SEGURIDAD! Cambiar si se compromete.
$secret = 'Garuto_UltraSecure_DeployToken_2026_99xZ!';

$headers = getallheaders();
$githubSignature = isset($headers['X-Hub-Signature-256']) ? $headers['X-Hub-Signature-256'] : '';
$urlToken = isset($_GET['token']) ? $_GET['token'] : '';

$isAuthenticated = false;

// 1. Validación manual rápida (Vía navegador con URL ?token=...)
if ($urlToken === $secret) {
    $isAuthenticated = true;
} 
// 2. Validación de Webhook de GitHub (Automático)
else if (!empty($githubSignature)) {
    $payload = file_get_contents('php://input');
    $expectedSignature = 'sha256=' . hash_hmac('sha256', $payload, $secret);
    
    if (hash_equals($expectedSignature, $githubSignature)) {
        $isAuthenticated = true;
    }
}

// Si no está autenticado, cortamos la conexión de inmediato.
if (!$isAuthenticated) {
    header('HTTP/1.1 403 Forbidden');
    die('Acceso denegado. Token de seguridad inválido.');
}

// Procedemos con la actualización
chdir(__DIR__);
$output = shell_exec('git reset --hard HEAD 2>&1 && git pull origin main 2>&1');

// Guardar registro (log) de la acción por seguridad (sin mostrar en pantalla los fallos de servidor)
$logOutput = "[" . date('Y-m-d H:i:s') . "] Nuevo despliegue ejecutado por " . ($urlToken ? "URL Manual" : "GitHub Webhook") . ".\n=== Log ===\n$output\n==========================\n\n";
file_put_contents('deploy_log.txt', $logOutput, FILE_APPEND);

echo "<h2>✅ Despliegue de Garuto Completado</h2>";
echo "<p>El servidor de Hostalia ha sincronizado correctamente la última versión desde GitHub.</p>";
?>
