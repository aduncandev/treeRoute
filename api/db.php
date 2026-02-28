<?php
// api/db.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");

// WebSupport Database credentials
$host = 'db.r6.websupport.sk';
$port = '3317';
$db   = 'Hackthon'; 
$user = 'Hackthon';
// Replace this with your actual password
$pass = 'FuckHack123=';

try {
    // WebSupport specific connection string
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db", $user, $pass);
    
    // Set error mode to exceptions so we can catch them easily
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
} catch (\PDOException $e) {
    http_response_code(500);
    // Returning the exact error message temporarily so you can see why it's failing on the frontend
    echo json_encode(["error" => "Database connection failed: " . $e->getMessage()]);
    exit;
}
?>