// ===== STATE =====
let token = localStorage.getItem('treeroute_token');
let currentUser = null;
let selectedMode = null;
let currentPage = 'dashboard';
let leaderboardType = 'co2';
let leaderboardPeriod = 'all';

const MODE_ICONS = { walk: '🚶', bike: '🚴', eScooter: '🛴', bus: '🚌', train: '🚆', car: '🚗' };
const MODE_NAMES = { walk: 'Walking', bike: 'Cycling', eScooter: 'E-Scooter', bus: 'Bus', train: 'Train', car: 'Driving' };
const CO2_FACTORS = { car: 0.21, bus: 0.089, train: 0.041, bike: 0, walk: 0, eScooter: 0.005 };
const CALORIE_FACTORS = { car: 0, bus: 0, train: 0, bike: 30, walk: 65, eScooter: 5 };
const SPEED_FACTORS = { car: 50, bus: 25, train: 80, bike: 18, walk: 5, eScooter: 20 };

const MILESTONES = [5, 15, 50, 100, 200, 500, 1000];

const ECO_FACTS = [
    "🐝 A single bee pollinates up to 5,000 flowers a day!",
    "🌳 One tree absorbs ~21kg of CO₂ per year.",
    "🐋 Blue whales capture 33 tonnes of CO₂ in their lifetime.",
    "🌿 1 acre of trees produces enough oxygen for 18 people.",
    "🦋 Monarch butterflies migrate up to 4,800 km!",
    "🍃 Cycling instead of driving saves ~150g CO₂ per km.",
    "🌊 Mangroves store 3-5x more carbon than terrestrial forests.",
    "🌻 Sunflowers can absorb radioactive materials from soil.",
    "🐜 Ants can carry 50x their body weight.",
];

// Guest stats for when not logged in
let guestStats = { co2Saved: 0, co2Emitted: 0, distance: 0, calories: 0, journeyCount: 0 };

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        fetchUser();
    } else {
        updateNavUser();
        updateEcosystem(0);
    }
});

// ===== API HELPER =====
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

    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authEmail').value = '';
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
    resetDashboard();
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
        updateNavUser();
        updateEcosystem(0);
    }
}

function updateNavUser() {
    const area = document.getElementById('nav-auth-area');
    if (currentUser) {
        area.innerHTML = `
            <div class="nav-user">
                <span class="level-badge">Lvl ${currentUser.level || 1}</span>
                <span class="username">${currentUser.username}</span>
                <button class="btn-ghost" onclick="logout()">Logout</button>
            </div>
        `;
    } else {
        area.innerHTML = `<button class="btn-signin" onclick="showAuthModal('login')">Sign In</button>`;
    }
}

// ===== NAVIGATION =====
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.navbar-links .nav-link').forEach(a => {
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
    const { user, totals } = data;

    document.getElementById('stat-saved').textContent = totals.co2_saved_kg.toFixed(1) + ' kg';
    document.getElementById('stat-emitted').textContent = totals.co2_emitted_kg.toFixed(1) + ' kg';
    document.getElementById('stat-distance').textContent = totals.distance_km.toFixed(1) + ' km';
    document.getElementById('stat-distance-sub').textContent = `across ${totals.journeys} journeys`;
    document.getElementById('stat-journeys').textContent = totals.journeys;

    // Ecosystem
    updateEcosystem(totals.co2_saved_kg);
    updateMilestone(totals.co2_saved_kg);

    // Update nav badge
    const badge = document.querySelector('.level-badge');
    if (badge) badge.textContent = `Lvl ${user.level}`;
}

function resetDashboard() {
    document.getElementById('stat-saved').textContent = '0.0 kg';
    document.getElementById('stat-emitted').textContent = '0.0 kg';
    document.getElementById('stat-distance').textContent = '0.0 km';
    document.getElementById('stat-distance-sub').textContent = 'across 0 journeys';
    document.getElementById('stat-journeys').textContent = '0';
    guestStats = { co2Saved: 0, co2Emitted: 0, distance: 0, calories: 0, journeyCount: 0 };
    updateEcosystem(0);
    updateMilestone(0);
}

// ===== MODE SELECTION =====
function selectMode(mode) {
    selectedMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

// ===== JOURNEY SUBMISSION =====
async function submitJourney() {
    const origin = document.getElementById('originInput').value.trim();
    const destination = document.getElementById('destInput').value.trim();
    const distance = parseFloat(document.getElementById('distanceInput').value);

    if (!origin || !destination) return showToast('⚠️', 'Please enter origin and destination');
    if (!selectedMode) return showToast('⚠️', 'Please select a transport mode');
    if (!distance || distance <= 0) return showToast('⚠️', 'Please enter a valid distance');

    // Guest mode — calculate locally
    if (!token) {
        const co2_emitted = distance * CO2_FACTORS[selectedMode];
        const co2_saved = (distance * CO2_FACTORS.car) - co2_emitted;
        const calories = distance * CALORIE_FACTORS[selectedMode];
        const carCo2 = distance * CO2_FACTORS.car;

        guestStats.co2Saved += co2_saved;
        guestStats.co2Emitted += co2_emitted;
        guestStats.distance += distance;
        guestStats.calories += calories;
        guestStats.journeyCount++;

        document.getElementById('stat-saved').textContent = guestStats.co2Saved.toFixed(1) + ' kg';
        document.getElementById('stat-emitted').textContent = guestStats.co2Emitted.toFixed(1) + ' kg';
        document.getElementById('stat-distance').textContent = guestStats.distance.toFixed(1) + ' km';
        document.getElementById('stat-distance-sub').textContent = `across ${guestStats.journeyCount} journeys`;
        document.getElementById('stat-journeys').textContent = guestStats.journeyCount;

        showComparison({
            co2_emitted,
            co2_saved,
            car_co2: carCo2,
            calories_burned: calories,
            trees_equivalent: co2_saved / 21
        });

        updateEcosystem(guestStats.co2Saved);
        updateMilestone(guestStats.co2Saved);

        showToast('🌱', 'Journey calculated! Sign in to save it permanently.');
        clearForm();
        return;
    }

    // Logged in — send to API
    const btn = document.getElementById('addJourneyBtn');
    try {
        btn.disabled = true;
        btn.innerHTML = '⏳ Saving...';

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
            }, 800);
        }

        if (data.gamification.new_achievements && data.gamification.new_achievements.length > 0) {
            data.gamification.new_achievements.forEach((ach, i) => {
                setTimeout(() => showToast(ach.icon, `Achievement: ${ach.name}!`), 1200 + i * 600);
            });
        }

        clearForm();
        loadDashboard();
    } catch (err) {
        showToast('❌', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Journey`;
    }
}

function showComparison(data) {
    const card = document.getElementById('comparisonCard');
    card.classList.add('show');
    document.getElementById('compYourCo2').textContent = data.co2_emitted.toFixed(2) + ' kg';
    document.getElementById('compCarCo2').textContent = data.car_co2.toFixed(2) + ' kg';

    const savings = document.getElementById('compSavings');
    savings.innerHTML = '';
    if (data.trees_equivalent > 0) {
        savings.innerHTML += `<div class="saving-badge">🌳 ${data.trees_equivalent.toFixed(2)} trees equivalent</div>`;
    }
    if (data.co2_saved > 0) {
        savings.innerHTML += `<div class="saving-badge">🌍 ${data.co2_saved.toFixed(2)}kg CO₂ saved</div>`;
    }
    if (data.calories_burned > 0) {
        savings.innerHTML += `<div class="saving-badge">🔥 ${Math.round(data.calories_burned)} calories burned</div>`;
    }
    if (data.co2_saved <= 0) {
        savings.innerHTML = `<div class="saving-badge">🚗 Driving — consider a greener mode next time!</div>`;
    }
}

function clearForm() {
    document.getElementById('originInput').value = '';
    document.getElementById('destInput').value = '';
    document.getElementById('distanceInput').value = '';
    selectedMode = null;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
}

// ===== MILESTONE =====
function updateMilestone(co2Saved) {
    const next = MILESTONES.find(m => m > co2Saved) || MILESTONES[MILESTONES.length - 1];
    const prev = MILESTONES[MILESTONES.indexOf(next) - 1] || 0;
    const progress = next > prev ? ((co2Saved - prev) / (next - prev)) * 100 : 100;

    document.getElementById('milestoneLabel').textContent = next + ' kg';
    document.getElementById('progressFill').style.width = Math.min(100, Math.max(0, progress)) + '%';
    const toGo = Math.max(0, next - co2Saved).toFixed(1);
    document.getElementById('milestoneToGo').textContent = `${toGo} kg to go`;
    document.getElementById('co2Display').textContent = co2Saved.toFixed(1);
}

// ===== ECOSYSTEM VISUALIZATION =====
function updateEcosystem(co2Saved) {
    let level = 0;
    if (co2Saved >= 500) level = 5;
    else if (co2Saved >= 200) level = 4;
    else if (co2Saved >= 50) level = 3;
    else if (co2Saved >= 10) level = 2;
    else if (co2Saved >= 2) level = 1;

    const sky = document.getElementById('ecoSky');
    const ground = document.getElementById('ecoGround');
    const sun = document.getElementById('ecoSun');
    const river = document.getElementById('ecoRiver');
    const trunk = document.getElementById('trunk');
    const leavesWrap = document.getElementById('leavesWrap');
    const msg = document.getElementById('treeMessage');

    const birds = document.querySelectorAll('.bird');
    const animals = document.querySelectorAll('.animal');

    // Sky
    const skyColors = ['#e2e8f0', '#cbd5e1', '#93c5fd', '#7dd3fc', '#38bdf8', '#0ea5e9'];
    sky.style.background = skyColors[level];

    // Ground
    const groundColors = ['#d6cfc4', '#c2b8a3', '#86efac', '#4ade80', '#22c55e', '#16a34a'];
    ground.style.background = groundColors[level];

    // Sun
    sun.style.opacity = level >= 2 ? '1' : '0';

    // Birds
    birds.forEach(b => { b.style.opacity = level >= 4 ? '1' : '0'; });

    // River
    if (level >= 3) {
        river.style.opacity = '1';
        river.style.transform = 'scaleY(1)';
    } else {
        river.style.opacity = '0';
        river.style.transform = 'scaleY(0)';
    }

    // Animals
    animals.forEach(a => { a.style.opacity = level >= 4 ? '1' : '0'; });

    // Tree
    const trunkHeights = [0, 30, 60, 90, 120, 150];
    trunk.style.height = trunkHeights[level] + 'px';

    // Leaves
    leavesWrap.innerHTML = '';
    if (level >= 1) {
        const leafSizes = [
            [],
            [{ w: 30, h: 30 }],
            [{ w: 50, h: 45 }, { w: 35, h: 30 }],
            [{ w: 65, h: 55 }, { w: 50, h: 42 }, { w: 35, h: 30 }],
            [{ w: 80, h: 65 }, { w: 60, h: 50 }, { w: 45, h: 38 }],
            [{ w: 95, h: 75 }, { w: 75, h: 60 }, { w: 55, h: 45 }, { w: 35, h: 30 }],
        ];
        const sizes = leafSizes[level];
        sizes.forEach(s => {
            const leaf = document.createElement('div');
            leaf.className = 'leaf-circle';
            leaf.style.width = s.w + 'px';
            leaf.style.height = s.h + 'px';
            leaf.style.marginBottom = '-' + Math.round(s.h * 0.35) + 'px';
            leavesWrap.appendChild(leaf);
        });
        leavesWrap.style.bottom = trunkHeights[level] + 'px';
    }

    // Messages
    const messages = [
        'A barren desert. Save CO₂ to bring it to life!',
        'A tiny seedling appears! Keep going!',
        'Your sapling is growing strong!',
        'A green woodland is forming!',
        'A thriving forest with wildlife!',
        'A magnificent rainforest ecosystem!'
    ];
    msg.textContent = messages[level];
}

function clickTree() {
    const container = document.querySelector('.eco-scene-container');
    container.classList.add('shake');
    setTimeout(() => container.classList.remove('shake'), 500);

    const existing = container.querySelector('.eco-bubble');
    if (existing) existing.remove();

    const fact = ECO_FACTS[Math.floor(Math.random() * ECO_FACTS.length)];
    const bubble = document.createElement('div');
    bubble.className = 'eco-bubble';
    bubble.textContent = fact;
    bubble.style.left = (Math.random() * 40 + 20) + '%';
    bubble.style.top = (Math.random() * 25 + 10) + '%';
    container.appendChild(bubble);
    setTimeout(() => bubble.remove(), 3500);
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
                    <h4>${escapeHtml(j.origin)} → ${escapeHtml(j.destination)}</h4>
                    <div class="journey-meta">
                        <span>${MODE_NAMES[j.mode] || j.mode}</span>
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
                btns += `<button class="btn-sm ${i === data.page ? 'btn-primary' : ''}" onclick="loadJourneys(${i})">${i}</button>`;
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
    document.querySelectorAll('.tab-btn').forEach(t => {
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
                <thead><tr><th>Rank</th><th>User</th><th>Level</th><th>${escapeHtml(data.unit)}</th></tr></thead>
                <tbody>
                    ${data.entries.map(e => `
                        <tr class="${e.isCurrentUser ? 'current-user' : ''}">
                            <td>${e.rank <= 3 ? `<span class="rank-medal">${medals[e.rank - 1]}</span>` : e.rank}</td>
                            <td style="font-weight:${e.isCurrentUser ? '700' : '400'}">${escapeHtml(e.username)}${e.isCurrentUser ? ' (You)' : ''}</td>
                            <td style="color:var(--gray-400)">Lvl ${e.level}</td>
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
    document.querySelectorAll('.period-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === period);
    });
    loadLeaderboard(leaderboardType);
}

// ===== TOASTS =====
function showToast(icon, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ===== UTILS =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}