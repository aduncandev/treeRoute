<?php
// api/signin.php
require 'db.php';

// Handle preflight OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$data = json_decode(file_get_contents("php://input"));

if (isset($data->email) && isset($data->password)) {
    $email = trim($data->email);
    $password = $data->password;

    try {
        // Fetch user by email
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        // Verify password
        if ($user && password_verify($password, $user['password_hash'])) {
            http_response_code(200);
            echo json_encode([
                "message" => "Login successful", 
                "name" => $user['fullname'],
                "email" => $user['email']
            ]);
        } else {
            http_response_code(401);
            echo json_encode(["error" => "Invalid email or password"]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error occurred"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["error" => "Invalid input data. Please provide email and password."]);
}
?>