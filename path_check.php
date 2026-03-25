<?php
$uploadDir = __DIR__ . "/uploads/";
echo "Upload Dir: " . $uploadDir . "\n";
echo "Writable: " . (is_writable($uploadDir) ? "YES" : "NO") . "\n";

function listDir($dir, $indent = "") {
    if (!is_dir($dir)) return;
    $files = scandir($dir);
    foreach ($files as $file) {
        if ($file === "." || $file === "..") continue;
        $path = $dir . $file;
        echo $indent . $file . (is_dir($path) ? "/" : "") . "\n";
        if (is_dir($path)) {
            listDir($path . "/", $indent . "  ");
        }
    }
}

echo "\nContents of uploads/:\n";
listDir($uploadDir);

echo "\nPHP Version: " . phpversion() . "\n";
echo "User: " . posix_getpwuid(posix_geteuid())['name'] . "\n";
