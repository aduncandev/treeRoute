// Mock Leaderboard Data
const leaderboardData = [
    { id: 1, name: "Sarah Jenkins", avatar: "👩🏼", score: 452.5, level: "🌳" },
    { id: 2, name: "Tom Baker", avatar: "👨🏽", score: 389.2, level: "🌳" },
    { id: 3, name: "EcoWarrior99", avatar: "🦊", score: 341.8, level: "🌿" },
    { id: 4, name: "LondonCyclist", avatar: "🚲", score: 295.0, level: "🌿" },
    { id: 5, name: "Maria Garcia", avatar: "👩🏻", score: 210.4, level: "💧" },
    { id: 6, name: "You (Guest)", avatar: "👤", score: 0.0, level: "🌱", isCurrentUser: true },
    { id: 7, name: "David Chen", avatar: "👨🏻", score: 185.3, level: "💧" },
    { id: 8, name: "GreenCommuter", avatar: "🚂", score: 142.1, level: "🌱" },
    { id: 9, name: "Anna Smith", avatar: "👩🏽", score: 95.8, level: "🌱" },
    { id: 10, name: "WalkingEnthusiast", avatar: "🚶", score: 45.2, level: "🏜️" }
];

document.addEventListener('DOMContentLoaded', () => {
    
    // Sync current user's score from local storage if we were tracking it there
    // For now, we'll calculate it from the journeys array in app.js if we wanted, 
    // but since they are separate pages without a backend, we'll just mock it.
    
    const listContainer = document.getElementById('leaderboardList');
    
    // Sort by score descending
    const sortedData = [...leaderboardData].sort((a, b) => b.score - a.score);

    listContainer.innerHTML = '';

    sortedData.forEach((user, index) => {
        const rank = index + 1;
        let rankDisplay = rank;
        if (rank === 1) rankDisplay = '🥇';
        if (rank === 2) rankDisplay = '🥈';
        if (rank === 3) rankDisplay = '🥉';

        const row = document.createElement('div');
        row.className = `lb-row ${rank <= 3 ? 'rank-'+rank : ''} ${user.isCurrentUser ? 'current-user' : ''}`;
        
        row.innerHTML = `
            <div class="col-rank lb-rank">${rankDisplay}</div>
            <div class="col-user lb-user">
                <div class="lb-avatar">${user.avatar}</div>
                <div class="lb-name">${user.name}</div>
            </div>
            <div class="col-badges lb-badges" title="Ecosystem Level">
                ${user.level}
            </div>
            <div class="col-score lb-score">
                ${user.score.toFixed(1)} kg
            </div>
        `;
        
        listContainer.appendChild(row);
    });

    // Tab interactions
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            // In a real app, this would fetch new data based on the filter
        });
    });
});