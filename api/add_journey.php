<?php
// api/add_journey.php
require 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$data = json_decode(file_get_contents("php://input"));

// Ensure all required data is present
if (
    isset($data->user_id) && 
    isset($data->origin) && 
    isset($data->destination) && 
    isset($data->transport_mode) && 
    isset($data->distance_km) && 
    isset($data->co2_emitted) && 
    isset($data->co2_saved)
) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO journeys (user_id, origin, destination, transport_mode, distance_km, co2_emitted, co2_saved) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $data->user_id,
            $data->origin,
            $data->destination,
            $data->transport_mode,
            $data->distance_km,
            $data->co2_emitted,
            $data->co2_saved
        ]);

        http_response_code(201);
        echo json_encode(["message" => "Journey saved successfully"]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: could not save journey"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["error" => "Missing required journey data"]);
}
?>