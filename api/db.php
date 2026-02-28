<?php
// api/db.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");

// Database credentials
$host = 'db.r6.websupport.sk'; // Usually localhost on WebSupport
$db   = 'Hackthon'; // Update with your actual database name
$user = 'Hackthon';
$pass = 'FuckHack123='; // Replace on your actual server!
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    echo json_encode(["error" => "Database connection failed"]);
    exit;
}
?>