// ===== STATE =====
let token = localStorage.getItem('treeroute_token');
let currentUser = null;
let selectedMode = null;
let currentPage = 'dashboard';
let leaderboardType = 'co2';
let leaderboardPeriod = 'all';
let guestStats = { journeys: [], co2Saved: 0, distance: 0, calories: 0, time: 0, journeyCount: 0 };

const MODE_ICONS = { walk: '🚶', bike: '🚴', eScooter: '🛴', bus: '🚌', train: '🚆', car: '🚗' };
const MODE_NAMES = { walk: 'Walking', bike: 'Cycling', eScooter: 'E-Scooter', bus: 'Bus', train: 'Train', car: 'Driving' };
const CO2_FACTORS = { car: 0.21, bus: 0.089, train: 0.041, bike: 0, walk: 0, eScooter: 0.005 };
const CALORIE_FACTORS = { car: 0, bus: 0, train: 0, bike: 30, walk: 65, eScooter: 5 };
const SPEED_FACTORS = { car: 50, bus: 25, train: 80, bike: 18, walk: 5, eScooter: 20 };

const ECO_FACTS = [
    "🐝 A single bee pollinates up to 5,000 flowers a day!",
    "🌳 One tree absorbs ~21kg of CO₂ per year.",
    "🐋 Blue whales capture 33 tonnes of CO₂ in their lifetime.",
    "🦉 Owls can rotate their heads up to 270°.",
    "🐛 Earthworms can eat their own body weight in soil daily.",
    "🌿 1 acre of trees produces enough oxygen for 18 people.",
    "🦋 Monarch butterflies migrate up to 4,800 km!",
    "🍃 Cycling instead of driving saves ~150g CO₂ per km.",
    "🌊 Mangroves store 3-5x more carbon than terrestrial forests.",
    "🐸 A single frog can eat over 100 insects per night!",
    "🌻 Sunflowers can absorb radioactive materials from soil.",
    "🐜 Ants can carry 50x their body weight.",
];

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        fetchUser();
    } else {
        showGuestMode();
    }
    initLeafParticles();
    initTreeAnimals();
});

// ===== API HELPERS =====
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ===== AUTH =====
let authMode = 'login';

function showAuthModal(mode = 'login') {
    authMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const emailGroup = document.getElementById('emailGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchText = document.getElementById('authSwitchText');
    const switchLink = document.getElementById('authSwitchLink');
    const error = document.getElementById('authError');
    error.style.display = 'none';

    if (mode === 'login') {
        title.textContent = 'Sign In';
        subtitle.textContent = 'Track your impact and compete with others';
        emailGroup.style.display = 'none';
        submitBtn.textContent = 'Sign In';
        switchText.textContent = "Don't have an account? ";
        switchLink.textContent = 'Register';
    } else {
        title.textContent = 'Create Account';
        subtitle.textContent = 'Start your sustainable journey today';
        emailGroup.style.display = 'block';
        submitBtn.textContent = 'Create Account';
        switchText.textContent = 'Already have an account? ';
        switchLink.textContent = 'Sign In';
    }

    modal.classList.add('show');
}

function hideAuthModal() {
    document.getElementById('authModal').classList.remove('show');
}

function toggleAuthMode() {
    showAuthModal(authMode === 'login' ? 'register' : 'login');
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const email = document.getElementById('authEmail').value.trim();
    const errorEl = document.getElementById('authError');

    try {
        let data;
        if (authMode === 'login') {
            data = await api('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
        } else {
            data = await api('/register', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });
        }

        token = data.token;
        localStorage.setItem('treeroute_token', token);
        currentUser = data.user;
        hideAuthModal();
        updateNavUser();
        loadDashboard();
        showToast('🌳', `Welcome${authMode === 'register' ? '' : ' back'}, ${currentUser.username}!`);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('treeroute_token');
    updateNavUser();
    showGuestMode();
    showToast('👋', 'Signed out successfully');
}

async function fetchUser() {
    try {
        const data = await api('/me');
        currentUser = data.user;
        updateNavUser();
        loadDashboard();
    } catch (err) {
        token = null;
        localStorage.removeItem('treeroute_token');
        showGuestMode();
    }
}

function updateNavUser() {
    const area = document.getElementById('nav-auth-area');
    if (currentUser) {
        area.innerHTML = `
      <div class="nav-user">
        <span class="level-badge">Lvl ${currentUser.level || 1}</span>
        <span class="username">${currentUser.username}</span>
        <button class="btn btn-sm btn-ghost" onclick="logout()">Logout</button>
      </div>
    `;
        document.getElementById('guestBanner').style.display = 'none';
    } else {
        area.innerHTML = `<button class="btn btn-sm btn-primary" onclick="showAuthModal('login')">Sign In</button>`;
    }
}

function showGuestMode() {
    document.getElementById('guestBanner').style.display = 'flex';
    document.getElementById('xpBarSection').style.display = 'none';
    document.getElementById('streakDisplay').style.display = 'none';
    renderDefaultAchievements();
}

// ===== NAVIGATION =====
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.navbar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });

    if (page === 'journeys' && token) loadJourneys();
    if (page === 'leaderboard') loadLeaderboard(leaderboardType);
}

// ===== DASHBOARD =====
async function loadDashboard() {
    if (!token) return;
    try {
        const data = await api('/stats');
        renderStats(data);
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

function renderStats(data) {
    const { user, totals, sustainability_score, ecosystem, achievements, daily_challenges, recommendation } = data;

    document.getElementById('xpBarSection').style.display = 'block';
    document.getElementById('userLevel').textContent = user.level;
    document.getElementById('levelName').textContent = user.level_name;
    document.getElementById('currentXp').textContent = user.xp;
    document.getElementById('nextLevelXp').textContent = user.xp_next_level;
    const xpProgress = user.xp_next_level > user.xp_current_level
        ? ((user.xp - user.xp_current_level) / (user.xp_next_level - user.xp_current_level)) * 100
        : 100;
    document.getElementById('xpFill').style.width = Math.min(100, xpProgress) + '%';

    document.getElementById('streakDisplay').style.display = 'flex';
    document.getElementById('streakCount').textContent = user.current_streak;
    document.getElementById('longestStreak').textContent = user.longest_streak;

    document.getElementById('statCo2Saved').textContent = totals.co2_saved_kg.toFixed(1);
    document.getElementById('statDistance').textContent = totals.distance_km.toFixed(1);
    document.getElementById('statCalories').textContent = totals.calories_burned;
    document.getElementById('statJourneys').textContent = totals.journeys;
    document.getElementById('statTime').textContent = totals.travel_time_min;
    document.getElementById('statTrees').textContent = totals.trees_equivalent;

    document.getElementById('sustainabilityScore').textContent = sustainability_score;
    const circumference = 326.7;
    const offset = circumference - (sustainability_score / 100) * circumference;
    document.getElementById('sustainabilityRing').style.strokeDashoffset = offset;

    document.getElementById('ecosystemBadge').textContent = ecosystem.emoji;
    document.getElementById('ecosystemLabel').textContent = `${ecosystem.emoji} ${ecosystem.name}`;
    updateTreeAppearance(ecosystem.level);

    renderAchievements(achievements);
    renderChallenges(daily_challenges);

    if (recommendation) {
        document.getElementById('recommendationBanner').style.display = 'flex';
        document.getElementById('recommendationText').textContent = recommendation;
    } else {
        document.getElementById('recommendationBanner').style.display = 'none';
    }

    const badge = document.querySelector('.level-badge');
    if (badge) badge.textContent = `Lvl ${user.level}`;
}

function renderAchievements(achievements) {
    const grid = document.getElementById('achievementsGrid');
    const unlocked = achievements.filter(a => a.unlocked).length;
    document.getElementById('achievementCount').textContent = `${unlocked}/${achievements.length}`;

    grid.innerHTML = achievements.map(a => `
    <div class="achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}">
      <span class="badge-icon">${a.icon}</span>
      <span class="badge-name">${a.name}</span>
      <span class="badge-desc">${a.desc}</span>
    </div>
  `).join('');
}

function renderDefaultAchievements() {
    const defaults = [
        { icon: '🏃', name: 'First Steps', desc: 'Log your first journey', unlocked: false },
        { icon: '🔥', name: 'Hot Streak', desc: '3-day streak', unlocked: false },
        { icon: '🌿', name: 'Week Warrior', desc: '7-day streak', unlocked: false },
        { icon: '🏆', name: 'Month Master', desc: '30-day streak', unlocked: false },
        { icon: '🚴', name: 'Pedal Power', desc: '10 bike journeys', unlocked: false },
        { icon: '👟', name: 'Walking Legend', desc: '50km walked', unlocked: false },
        { icon: '🌍', name: 'Carbon Crusher', desc: 'Save 20kg CO₂', unlocked: false },
        { icon: '💯', name: 'Century Club', desc: 'Save 100kg CO₂', unlocked: false },
        { icon: '🔥', name: 'Calorie Burner', desc: 'Burn 1000 calories', unlocked: false },
        { icon: '📏', name: 'Distance King', desc: '200km total', unlocked: false },
        { icon: '🎯', name: 'Five-a-Day', desc: '5 journeys in a day', unlocked: false },
        { icon: '⚡', name: 'Speed Demon', desc: '10 journeys logged', unlocked: false },
    ];
    renderAchievements(defaults);
}

function renderChallenges(challenges) {
    const container = document.getElementById('challengesList');
    if (!challenges || challenges.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px"><p>No challenges today</p></div>';
        return;
    }
    container.innerHTML = challenges.map(ch => `
    <div class="challenge-item ${ch.completed ? 'completed' : ''}">
      <div class="challenge-info">
        <div class="challenge-check">${ch.completed ? '✓' : ''}</div>
        <span class="challenge-desc">${ch.desc}</span>
      </div>
      <span class="challenge-xp">+${ch.xp} XP</span>
    </div>
  `).join('');
}

// ===== JOURNEY SUBMISSION =====
function selectMode(mode) {
    selectedMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

async function submitJourney() {
    const origin = document.getElementById('inputOrigin').value.trim();
    const destination = document.getElementById('inputDestination').value.trim();
    const distance = parseFloat(document.getElementById('inputDistance').value);

    if (!origin || !destination) return showToast('⚠️', 'Please enter origin and destination');
    if (!selectedMode) return showToast('⚠️', 'Please select a transport mode');
    if (!distance || distance <= 0) return showToast('⚠️', 'Please enter a valid distance');

    if (!token) {
        const co2_emitted = distance * CO2_FACTORS[selectedMode];
        const co2_saved = (distance * CO2_FACTORS.car) - co2_emitted;
        const calories = distance * CALORIE_FACTORS[selectedMode];
        const time = (distance / SPEED_FACTORS[selectedMode]) * 60;
        const carCo2 = distance * CO2_FACTORS.car;

        showComparison({ co2_emitted, co2_saved, car_co2: carCo2, calories_burned: calories, trees_equivalent: co2_saved / 21 });

        guestStats.co2Saved += co2_saved;
        guestStats.distance += distance;
        guestStats.calories += calories;
        guestStats.time += time;
        guestStats.journeyCount++;

        document.getElementById('statCo2Saved').textContent = guestStats.co2Saved.toFixed(1);
        document.getElementById('statDistance').textContent = guestStats.distance.toFixed(1);
        document.getElementById('statCalories').textContent = Math.round(guestStats.calories);
        document.getElementById('statJourneys').textContent = guestStats.journeyCount;
        document.getElementById('statTime').textContent = Math.round(guestStats.time);
        document.getElementById('statTrees').textContent = (guestStats.co2Saved / 21).toFixed(1);

        showToast('🌱', 'Journey calculated! Sign in to save it.');
        clearForm();
        return;
    }

    try {
        const btn = document.getElementById('submitJourneyBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Saving...';

        const data = await api('/journeys', {
            method: 'POST',
            body: JSON.stringify({ origin, destination, mode: selectedMode, distance_km: distance })
        });

        showComparison({
            co2_emitted: data.journey.co2_emitted,
            co2_saved: data.comparison.co2_saved,
            car_co2: data.comparison.car_co2,
            calories_burned: data.journey.calories_burned,
            trees_equivalent: data.comparison.trees_equivalent
        });

        showToast('🌱', `+${data.gamification.xp_earned} XP earned!`);

        if (data.gamification.leveled_up) {
            setTimeout(() => {
                showToast('🎉', `Level Up! You're now a ${data.gamification.level_name}!`);
                triggerConfetti();
                shakeTree();
            }, 800);
        }

        if (data.gamification.new_achievements.length > 0) {
            data.gamification.new_achievements.forEach((ach, i) => {
                setTimeout(() => { showToast(ach.icon, `Achievement: ${ach.name}!`); }, 1200 + i * 600);
            });
        }

        clearForm();
        loadDashboard();

        btn.disabled = false;
        btn.textContent = '🌱 Log Journey';
    } catch (err) {
        showToast('❌', err.message);
        const btn = document.getElementById('submitJourneyBtn');
        btn.disabled = false;
        btn.textContent = '🌱 Log Journey';
    }
}

function showComparison(data) {
    const card = document.getElementById('comparisonCard');
    card.classList.add('show');
    document.getElementById('compYourCo2').textContent = data.co2_emitted.toFixed(2);
    document.getElementById('compCarCo2').textContent = data.car_co2.toFixed(2);

    const savings = document.getElementById('compSavings');
    const saved = data.co2_saved;
    savings.innerHTML = `
    <div class="saving-badge">🌳 ${data.trees_equivalent.toFixed(2)} trees equivalent</div>
    <div class="saving-badge">🌍 ${saved.toFixed(2)}kg CO₂ saved</div>
    ${data.calories_burned > 0 ? `<div class="saving-badge">🔥 ${Math.round(data.calories_burned)} calories burned</div>` : ''}
  `;
}

function clearForm() {
    document.getElementById('inputOrigin').value = '';
    document.getElementById('inputDestination').value = '';
    document.getElementById('inputDistance').value = '';
    selectedMode = null;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
}

// ===== JOURNEYS PAGE =====
async function loadJourneys(page = 1) {
    if (!token) return;
    const container = document.getElementById('journeysList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const data = await api(`/journeys?page=${page}&limit=15`);
        if (data.journeys.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p>No journeys yet. Log your first journey from the dashboard!</p></div>`;
            return;
        }

        container.innerHTML = data.journeys.map(j => `
      <div class="journey-item">
        <div class="journey-mode-icon">${MODE_ICONS[j.mode] || '🚶'}</div>
        <div class="journey-details">
          <h4>${j.origin} → ${j.destination}</h4>
          <div class="journey-meta">
            <span>${MODE_NAMES[j.mode]}</span>
            <span>${j.distance_km.toFixed(1)} km</span>
            <span>${j.co2_saved > 0 ? '+' : ''}${j.co2_saved.toFixed(2)}kg CO₂</span>
            ${j.calories_burned > 0 ? `<span>${Math.round(j.calories_burned)} cal</span>` : ''}
            <span>${new Date(j.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="journey-xp">+${j.xp_earned} XP</div>
      </div>
    `).join('');

        const pagEl = document.getElementById('journeysPagination');
        if (data.pages > 1) {
            let btns = '';
            for (let i = 1; i <= data.pages; i++) {
                btns += `<button class="btn btn-sm ${i === data.page ? 'btn-primary' : 'btn-ghost'}" onclick="loadJourneys(${i})">${i}</button> `;
            }
            pagEl.innerHTML = btns;
        } else {
            pagEl.innerHTML = '';
        }
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p>Failed to load journeys</p></div>`;
    }
}

// ===== LEADERBOARD =====
async function loadLeaderboard(type) {
    leaderboardType = type;
    document.querySelectorAll('.leaderboard-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === type);
    });

    const container = document.getElementById('leaderboardContent');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const data = await api(`/leaderboard?type=${type}&period=${leaderboardPeriod}`);
        if (data.entries.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div><p>No entries yet. Be the first!</p></div>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = `
      <table class="leaderboard-table">
        <thead><tr><th>Rank</th><th>User</th><th>Level</th><th>${data.unit}</th></tr></thead>
        <tbody>
          ${data.entries.map(e => `
            <tr class="${e.isCurrentUser ? 'current-user' : ''}">
              <td>${e.rank <= 3 ? `<span class="rank-medal">${medals[e.rank - 1]}</span>` : e.rank}</td>
              <td style="font-weight:${e.isCurrentUser ? '700' : '400'}">${e.username}${e.isCurrentUser ? ' (You)' : ''}</td>
              <td><span style="color: var(--text-muted)">Lvl ${e.level}</span></td>
              <td style="font-weight:600">${e.value.toFixed(1)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load leaderboard</p></div>';
    }
}

function togglePeriod(period) {
    leaderboardPeriod = period;
    document.querySelectorAll('.period-toggle .btn').forEach(b => {
        const isPeriod = b.dataset.period === period;
        b.className = `btn btn-sm ${isPeriod ? 'btn-secondary active' : 'btn-ghost'}`;
    });
    loadLeaderboard(leaderboardType);
}

// ===== INTERACTIVE TREE =====
function updateTreeAppearance(ecoLevel) {
    const deco = document.getElementById('treeDecorations');
    let html = '';

    if (ecoLevel >= 2) {
        html += '<circle cx="90" cy="175" r="5" fill="#f472b6"/>';
        html += '<circle cx="205" cy="170" r="5" fill="#fb923c"/>';
        html += '<circle cx="140" cy="100" r="4" fill="#fbbf24"/>';
    }
    if (ecoLevel >= 3) {
        html += `<g transform="translate(100, 310)"><rect x="3" y="0" width="4" height="10" fill="#f5f5f4"/><ellipse cx="5" cy="0" rx="8" ry="5" fill="#ef4444"/><circle cx="3" cy="-1" r="1.5" fill="#fff"/><circle cx="7" cy="1" r="1" fill="#fff"/></g>`;
        html += '<circle cx="170" cy="90" r="4" fill="#c084fc"/>';
    }
    if (ecoLevel >= 4) {
        html += `<g opacity="0.3"><ellipse cx="50" cy="50" rx="30" ry="12" fill="#e2e8f0"/><ellipse cx="250" cy="40" rx="25" ry="10" fill="#e2e8f0"/></g>`;
        html += '<text x="230" y="80" font-size="16">🐦</text>';
    }
    if (ecoLevel >= 5) {
        html += `<path d="M30 70 Q150 -20 270 70" stroke="#ef4444" stroke-width="3" fill="none" opacity="0.4"/>`;
        html += `<path d="M35 70 Q150 -15 265 70" stroke="#fbbf24" stroke-width="3" fill="none" opacity="0.4"/>`;
        html += `<path d="M40 70 Q150 -10 260 70" stroke="#4ade80" stroke-width="3" fill="none" opacity="0.4"/>`;
        html += '<text x="60" y="300" font-size="14">🦋</text>';
    }

    deco.innerHTML = html;
}

function clickTree() {
    shakeTree();
    const existing = document.querySelector('.eco-bubble');
    if (existing) existing.remove();

    const fact = ECO_FACTS[Math.floor(Math.random() * ECO_FACTS.length)];
    const bubble = document.createElement('div');
    bubble.className = 'eco-bubble';
    bubble.textContent = fact;
    bubble.style.left = (Math.random() * 40 + 30) + '%';
    bubble.style.top = (Math.random() * 30 + 10) + '%';
    document.getElementById('treeContainer').appendChild(bubble);
    setTimeout(() => bubble.remove(), 3500);
}

function shakeTree() {
    const svg = document.getElementById('treeSvg');
    svg.classList.add('shake');
    setTimeout(() => svg.classList.remove('shake'), 600);
}

function initTreeAnimals() {
    const container = document.getElementById('treeContainer');
    const animals = [
        { emoji: '🐿️', x: '15%', y: '65%' },
        { emoji: '🦔', x: '78%', y: '85%' },
        { emoji: '🐞', x: '60%', y: '35%' },
    ];

    animals.forEach(a => {
        const el = document.createElement('div');
        el.className = 'tree-animal';
        el.textContent = a.emoji;
        el.style.left = a.x;
        el.style.top = a.y;
        el.onclick = (e) => {
            e.stopPropagation();
            const existing = document.querySelector('.eco-bubble');
            if (existing) existing.remove();
            const fact = ECO_FACTS[Math.floor(Math.random() * ECO_FACTS.length)];
            const bubble = document.createElement('div');
            bubble.className = 'eco-bubble';
            bubble.textContent = fact;
            bubble.style.left = a.x;
            bubble.style.top = (parseInt(a.y) - 12) + '%';
            container.appendChild(bubble);
            setTimeout(() => bubble.remove(), 3500);
        };
        container.appendChild(el);
    });
}

function initLeafParticles() {
    const container = document.getElementById('treeContainer');
    const leaves = ['🍃', '🍂', '🌿'];

    setInterval(() => {
        const leaf = document.createElement('div');
        leaf.className = 'leaf-particle';
        leaf.textContent = leaves[Math.floor(Math.random() * leaves.length)];
        leaf.style.left = (Math.random() * 80 + 10) + '%';
        leaf.style.animationDuration = (3 + Math.random() * 4) + 's';
        container.appendChild(leaf);
        setTimeout(() => leaf.remove(), 7000);
    }, 2500);
}

// ===== EFFECTS =====
function triggerConfetti() {
    const colors = ['#4ade80', '#a3e635', '#fbbf24', '#fb923c', '#f472b6', '#60a5fa'];
    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.top = -10 + 'px';
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 3000);
    }
}

function showToast(icon, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}