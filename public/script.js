let myChart = null;

// Initialize the dashboard on page load
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    fetchDashboardData();
});

// Handle Form Submission
document.getElementById('journeyForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
        pointA: document.getElementById('pointA').value,
        pointB: document.getElementById('pointB').value,
        mode: document.getElementById('mode').value
    };

    try {
        const response = await fetch('/api/journeys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Clear inputs after successful submission
            document.getElementById('pointA').value = '';
            document.getElementById('pointB').value = '';
            fetchDashboardData();
        }
    } catch (error) {
        console.error("Error logging journey:", error);
    }
});

// Handle the Demo Reset Button
document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm("Are you sure you want to clear all demo data?")) {
        await fetch('/api/reset', { method: 'POST' });
        fetchDashboardData();
    }
});

// Fetch Data & Update UI
async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();

        // Update Top Cards
        document.getElementById('metricSaved').innerText = data.stats.totalSaved;
        document.getElementById('metricEmitted').innerText = data.stats.totalEmitted;
        document.getElementById('metricDistance').innerText = data.stats.totalDistance;
        document.getElementById('metricJourneys').innerText = data.stats.totalJourneys;
        document.getElementById('metricCarUsage').innerText = data.stats.carUsagePercent;

        // Update Tree Panel
        updateTree(parseFloat(data.stats.totalSaved));

        // Update Chart
        updateChart(data.journeys);
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
    }
}

// Tree Gamification Logic
function updateTree(savedKg) {
    const milestone = 30;
    const progressPercent = Math.min((savedKg / milestone) * 100, 100);
    const remaining = Math.max(milestone - savedKg, 0).toFixed(1);

    document.getElementById('treeSaved').innerText = savedKg.toFixed(1);
    document.getElementById('treeProgress').style.width = `${progressPercent}%`;
    document.getElementById('treeToGo').innerText = remaining;

    const visual = document.getElementById('treeVisual');
    const msg = document.getElementById('treeMessage');

    if (savedKg >= 30) {
        visual.innerText = '🌳';
        msg.innerText = "Incredible! You've grown a mature forest tree!";
    } else if (savedKg >= 15) {
        visual.innerText = '🪴';
        msg.innerText = "Your sapling is growing stronger every day!";
    } else if (savedKg > 0) {
        visual.innerText = '🌿';
        msg.innerText = "Your seed is sprouting! Keep going!";
    } else {
        visual.innerText = '🌱';
        msg.innerText = "Awaiting your first eco-friendly journey...";
    }
}

// Chart.js Setup
function initChart() {
    const ctx = document.getElementById('emissionsChart').getContext('2d');

    // Setting global font family to match Bootstrap
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Actual CO₂ Emitted (kg)',
                    data: [],
                    backgroundColor: '#3b82f6', // Blue
                    borderRadius: 4
                },
                {
                    label: 'If driven by Car (kg)',
                    data: [],
                    backgroundColor: '#ef4444', // Red
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5] }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

// Update Chart Data
function updateChart(journeys) {
    // Only show the last 7 journeys on the chart so it doesn't get crowded
    const recent = journeys.slice(-7);

    myChart.data.labels = recent.map(j => `${j.pointA} ➔ ${j.pointB} (${j.mode})`);

    // Format to 2 decimal places for cleaner tooltips
    myChart.data.datasets[0].data = recent.map(j => parseFloat(j.emitted.toFixed(2)));
    myChart.data.datasets[1].data = recent.map(j => parseFloat((j.emitted + j.saved).toFixed(2)));

    myChart.update();
}