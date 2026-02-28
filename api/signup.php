<?php
// api/signup.php
require 'db.php';

// Handle preflight OPTIONS request for CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get JSON data from the frontend
$data = json_decode(file_get_contents("php://input"));

if (isset($data->fullname) && isset($data->email) && isset($data->password)) {
    $fullname = trim($data->fullname);
    $email = trim($data->email);
    $password = $data->password;

    try {
        // Check if email already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->rowCount() > 0) {
            http_response_code(400);
            echo json_encode(["error" => "Email already in use"]);
            exit;
        }

        // Hash the password securely
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

        // Insert new user
        $stmt = $pdo->prepare("INSERT INTO users (fullname, email, password_hash) VALUES (?, ?, ?)");
        if ($stmt->execute([$fullname, $email, $hashedPassword])) {
            http_response_code(201);
            echo json_encode(["message" => "Account created successfully"]);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Failed to create account"]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error occurred"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["error" => "Invalid input data. Make sure all fields are filled."]);
}
?>