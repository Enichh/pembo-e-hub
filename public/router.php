<?php
// public/router.php - Development router for PHP built-in server

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// 1. Serve static files from /src/ (e.g. CSS, JS)
if (str_starts_with($uri, '/src/')) {
    $filePath = __DIR__ . $uri;
    if (file_exists($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mimeTypes = [
            'css'  => 'text/css',
            'js'   => 'application/javascript',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'svg'  => 'image/svg+xml',
            'json' => 'application/json'
        ];
        if (isset($mimeTypes[$ext])) {
            header("Content-Type: {$mimeTypes[$ext]}");
        }
        readfile($filePath);
        exit;
    }
}

// 2. Route /api.php requests
if ($uri === '/api.php' || str_starts_with($uri, '/api')) {
    require __DIR__ . '/api.php';
    exit;
}

// 3. Serve root index.html
if ($uri === '/' || $uri === '/index.html') {
    require __DIR__ . '/index.html';
    exit;
}

// 4. Default: check if file exists directly in public
if (file_exists(__DIR__ . $uri) && !is_dir(__DIR__ . $uri)) {
    return false;
}

http_response_code(404);
echo "Not Found";
