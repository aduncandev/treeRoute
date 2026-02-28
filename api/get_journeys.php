<?php
// api/get_journeys.php
require 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get user_id from query parameters (e.g., get_journeys.php?user_id=1)
if (isset($_GET['user_id'])) {
    $user_id = $_GET['user_id'];

    try {
        // Fetch all journeys for this user, ordered by newest first
        $stmt = $pdo->prepare("SELECT * FROM journeys WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$user_id]);
        $journeys = $stmt->fetchAll();

        // Calculate totals
        $total_saved = 0;
        $total_emitted = 0;
        $total_distance = 0;
        $car_journeys = 0;
        $total_journeys = count($journeys);

        foreach ($journeys as $j) {
            $total_saved += $j['co2_saved'];
            $total_emitted += $j['co2_emitted'];
            $total_distance += $j['distance_km'];
            if ($j['transport_mode'] === 'car') {
                $car_journeys++;
            }
        }

        $car_percentage = $total_journeys > 0 ? round(($car_journeys / $total_journeys) * 100) : 0;

        http_response_code(200);
        echo json_encode([
            "journeys" => $journeys,
            "stats" => [
                "total_saved" => round($total_saved, 2),
                "total_emitted" => round($total_emitted, 2),
                "total_distance" => round($total_distance, 1),
                "car_percentage" => $car_percentage
            ]
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: could not fetch journeys"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["error" => "Missing user_id parameter"]);
}
?>