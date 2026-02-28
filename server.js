const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Hardcoded emissions data (kg of CO2 per km)
const transportData = {
    Walking: { co2: 0 },
    Cycling: { co2: 0 },
    Bus: { co2: 0.105 },
    Train: { co2: 0.041 },
    Car: { co2: 0.192 }
};

// In-memory database for the hackathon MVP
let journeys = [];

function calculateStats() {
    let totalSaved = 0;
    let totalEmitted = 0;
    let totalDistance = 0;
    let carJourneys = 0;

    journeys.forEach(j => {
        totalDistance += j.distance;
        totalEmitted += j.emitted;
        totalSaved += j.saved;
        if (j.mode === 'Car') carJourneys++;
    });

    const carUsagePercent = journeys.length === 0 ? 0 : Math.round((carJourneys / journeys.length) * 100);

    return {
        totalSaved: totalSaved.toFixed(1),
        totalEmitted: totalEmitted.toFixed(1),
        totalDistance: totalDistance.toFixed(1),
        carUsagePercent,
        totalJourneys: journeys.length
    };
}

// --- API Endpoints ---

// Get all data for the dashboard
app.get('/api/dashboard', (req, res) => {
    res.json({ stats: calculateStats(), journeys });
});

// Log a new journey
app.post('/api/journeys', (req, res) => {
    const { pointA, pointB, mode } = req.body;

    // MVP Hack: Mocking a random distance between 2 and 15 km 
    const distance = parseFloat((Math.random() * 13 + 2).toFixed(1));

    const emitted = distance * transportData[mode].co2;
    const carEmitted = distance * transportData['Car'].co2;
    // CO2 saved is the difference between taking a car and the chosen mode
    const saved = mode === 'Car' ? 0 : carEmitted - emitted;

    journeys.push({ pointA, pointB, mode, distance, emitted, saved });
    res.json({ success: true, stats: calculateStats() });
});

// Secret endpoint to reset data during your presentation
app.post('/api/reset', (req, res) => {
    journeys = [];
    res.json({ success: true, message: "Data reset successfully" });
});

// Fallback to index.html for Single Page App routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🌳 treeRoute running on http://localhost:${PORT}`));