// ===== STATE =====
let token = localStorage.getItem('treeroute_token');
let currentUser = null;
let selectedMode = null;
let currentPage = 'dashboard';
let leaderboardType = 'co2';
let leaderboardPeriod = 'all';

// Map state
let map = null;
let originMarker = null;
let destMarker = null;
let routeLine = null;
let originCoords = null;
let destCoords = null;
let routeData = { distance_km: null, duration_min: null };
let searchTimeout = null;

const MODE_ICONS = { walk: '🚶', bike: '🚴', eScooter: '🛴', bus: '🚌', train: '🚆', car: '🚗' };
const MODE_NAMES = { walk: 'Walking', bike: 'Cycling', eScooter: 'E-Scooter', bus: 'Bus', train: 'Train', car: 'Driving' };
const CO2_FACTORS = { car: 0.171, bus: 0.097, train: 0.035, bike: 0, walk: 0, eScooter: 0.005 };
const CALORIE_FACTORS = { car: 0, bus: 0, train: 0, bike: 28, walk: 57, eScooter: 4 };
const SPEED_FACTORS = { car: 35, bus: 18, train: 60, bike: 16, walk: 5, eScooter: 18 };
const OSRM_PROFILES = { car: 'car', bus: 'car', train: null, bike: 'bike', walk: 'foot', eScooter: 'bike' };

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
let guestStats = { co2Saved: 0, co2Emitted: 0, distance: 0, calories: 0, journeyCount: 0, caloriesByMode: {} };

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupSearchInputs();
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
    // Update mobile bottom nav
    document.querySelectorAll('.bnav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.page === page);
    });
    // Re-render map when switching back to dashboard
    if (page === 'dashboard' && map) setTimeout(() => map.invalidateSize(), 100);

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

    // Calories
    const cal = totals.calories_burned || 0;
    document.getElementById('stat-calories').textContent = Math.round(cal) + ' kcal';
    updateCaloriesSub(totals);

    // Ecosystem
    updateEcosystem(totals.co2_saved_kg);
    updateMilestone(totals.co2_saved_kg);

    // Update nav badge
    const badge = document.querySelector('.level-badge');
    if (badge) badge.textContent = `Lvl ${user.level}`;
}

function updateCaloriesSub(totals) {
    const sub = document.getElementById('stat-calories-sub');
    if (totals.top_calorie_mode) {
        sub.textContent = `mostly by ${MODE_NAMES[totals.top_calorie_mode] || totals.top_calorie_mode}`;
    } else if (totals.calories_burned > 0) {
        sub.textContent = 'from walking, cycling & scooting';
    } else {
        sub.textContent = 'select a green transport mode';
    }
}

function resetDashboard() {
    document.getElementById('stat-saved').textContent = '0.0 kg';
    document.getElementById('stat-emitted').textContent = '0.0 kg';
    document.getElementById('stat-distance').textContent = '0.0 km';
    document.getElementById('stat-distance-sub').textContent = 'across 0 journeys';
    document.getElementById('stat-journeys').textContent = '0';
    document.getElementById('stat-calories').textContent = '0 kcal';
    document.getElementById('stat-calories-sub').textContent = 'select a green transport mode';
    guestStats = { co2Saved: 0, co2Emitted: 0, distance: 0, calories: 0, journeyCount: 0, caloriesByMode: {} };
    updateEcosystem(0);
    updateMilestone(0);
}

// ===== MODE SELECTION =====
function selectMode(mode) {
    selectedMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // Re-fetch route with appropriate OSRM profile
    if (originCoords && destCoords) fetchRoute();
}

// ===== JOURNEY SUBMISSION =====
async function submitJourney() {
    const origin = document.getElementById('originInput').value.trim();
    const destination = document.getElementById('destInput').value.trim();
    const manualDistance = parseFloat(document.getElementById('distanceInput').value);
    const hasRoute = routeData.distance_km && routeData.distance_km > 0;
    const hasManual = manualDistance && manualDistance > 0;
    const distance = hasManual ? manualDistance : (hasRoute ? routeData.distance_km : 0);

    if (!origin || !destination) return showToast('⚠️', 'Please enter origin and destination');
    if (!selectedMode) return showToast('⚠️', 'Please select a transport mode');
    if (!distance || distance <= 0) return showToast('⚠️', 'Pick points on the map or enter distance manually');

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
        if (!guestStats.caloriesByMode) guestStats.caloriesByMode = {};
        guestStats.caloriesByMode[selectedMode] = (guestStats.caloriesByMode[selectedMode] || 0) + calories;

        document.getElementById('stat-saved').textContent = guestStats.co2Saved.toFixed(1) + ' kg';
        document.getElementById('stat-emitted').textContent = guestStats.co2Emitted.toFixed(1) + ' kg';
        document.getElementById('stat-distance').textContent = guestStats.distance.toFixed(1) + ' km';
        document.getElementById('stat-distance-sub').textContent = `across ${guestStats.journeyCount} journeys`;
        document.getElementById('stat-journeys').textContent = guestStats.journeyCount;

        // Update calories stat card
        document.getElementById('stat-calories').textContent = Math.round(guestStats.calories) + ' kcal';
        const topMode = Object.entries(guestStats.caloriesByMode).sort((a, b) => b[1] - a[1])[0];
        if (topMode && topMode[1] > 0) {
            document.getElementById('stat-calories-sub').textContent = `mostly by ${MODE_NAMES[topMode[0]] || topMode[0]}`;
        }

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

        const body = {
            origin, destination, mode: selectedMode,
            distance_km: hasManual ? manualDistance : null,
            origin_lat: originCoords?.lat, origin_lng: originCoords?.lng,
            dest_lat: destCoords?.lat, dest_lng: destCoords?.lng,
            route_distance_km: hasRoute ? routeData.distance_km : null,
            route_duration_min: routeData.duration_min || null
        };

        const data = await api('/journeys', {
            method: 'POST',
            body: JSON.stringify(body)
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
    clearRoute();
    document.getElementById('distHint').textContent = '';
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
    const branchLeft = document.getElementById('branchLeft');
    const branchRight = document.getElementById('branchRight');
    const flowers = document.getElementById('ecoFlowers');
    const particleLayer = document.getElementById('particleLayer');

    const birds = document.querySelectorAll('.bird');
    const animals = document.querySelectorAll('.animal');
    const clouds = document.querySelectorAll('.cloud');

    // Sky gradient
    const skyGradients = [
        'linear-gradient(180deg, #e2e8f0 0%, #f1f5f9 100%)',
        'linear-gradient(180deg, #cbd5e1 0%, #e2e8f0 100%)',
        'linear-gradient(180deg, #7dd3fc 0%, #bae6fd 100%)',
        'linear-gradient(180deg, #38bdf8 0%, #7dd3fc 100%)',
        'linear-gradient(180deg, #0ea5e9 0%, #38bdf8 50%, #7dd3fc 100%)',
        'linear-gradient(180deg, #0284c7 0%, #0ea5e9 40%, #38bdf8 70%, #7dd3fc 100%)'
    ];
    sky.style.background = skyGradients[level];

    // Ground gradient
    const groundGradients = [
        'linear-gradient(180deg, #d6cfc4, #c4b9a8)',
        'linear-gradient(180deg, #c2b8a3, #b8a88e)',
        'linear-gradient(180deg, #86efac, #4ade80)',
        'linear-gradient(180deg, #4ade80, #22c55e)',
        'linear-gradient(180deg, #22c55e, #16a34a)',
        'linear-gradient(180deg, #16a34a, #15803d)'
    ];
    ground.style.background = groundGradients[level];

    // Sun
    sun.style.opacity = level >= 2 ? '1' : '0';

    // Clouds
    clouds.forEach(c => { c.style.opacity = level >= 2 ? '0.7' : '0'; });

    // Birds (progressive reveal)
    birds.forEach((b, i) => {
        if (i === 0) b.style.opacity = level >= 3 ? '1' : '0';
        else if (i === 1) b.style.opacity = level >= 4 ? '1' : '0';
        else b.style.opacity = level >= 5 ? '1' : '0';
    });

    // River
    if (level >= 3) {
        river.style.opacity = '1';
        river.style.transform = 'scaleY(1)';
    } else {
        river.style.opacity = '0';
        river.style.transform = 'scaleY(0)';
    }

    // Animals (progressive)
    const animalEls = Array.from(animals);
    animalEls.forEach((a, i) => {
        const showAt = [4, 4, 3, 3, 5, 5];
        a.style.opacity = level >= (showAt[i] || 4) ? '1' : '0';
    });

    // Tree trunk
    const trunkHeights = [0, 35, 65, 100, 130, 160];
    trunk.style.height = trunkHeights[level] + 'px';

    // Branches
    if (level >= 3) {
        branchLeft.style.opacity = '1';
        branchLeft.style.width = (10 + level * 6) + 'px';
        branchRight.style.opacity = '1';
        branchRight.style.width = (8 + level * 5) + 'px';
    } else {
        branchLeft.style.opacity = '0';
        branchLeft.style.width = '0';
        branchRight.style.opacity = '0';
        branchRight.style.width = '0';
    }

    // Leaves - dense horizontal canopy with multiple greens
    leavesWrap.innerHTML = '';
    const leafGreens = [
        '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac',
        '#34d399', '#6ee7b7', '#10b981', '#059669', '#047857'
    ];
    const canopyData = [
        [],
        [ // level 1: tiny sprout
            { y: 0, leaves: [{ x: 0, w: 34, h: 30 }] },
            { y: -8, leaves: [{ x: -8, w: 26, h: 22 }, { x: 10, w: 24, h: 20 }] }
        ],
        [ // level 2: small sapling
            { y: 0, leaves: [{ x: 0, w: 46, h: 40 }] },
            { y: -14, leaves: [{ x: -20, w: 36, h: 30 }, { x: 18, w: 38, h: 32 }] },
            { y: -28, leaves: [{ x: -8, w: 30, h: 26 }, { x: 12, w: 28, h: 24 }] }
        ],
        [ // level 3: growing tree
            { y: 0, leaves: [{ x: 0, w: 56, h: 48 }] },
            { y: -14, leaves: [{ x: -30, w: 44, h: 38 }, { x: 28, w: 46, h: 40 }] },
            { y: -28, leaves: [{ x: -44, w: 38, h: 32 }, { x: 0, w: 40, h: 34 }, { x: 42, w: 36, h: 30 }] },
            { y: -42, leaves: [{ x: -22, w: 32, h: 28 }, { x: 20, w: 30, h: 26 }] },
            { y: -52, leaves: [{ x: 0, w: 26, h: 22 }] }
        ],
        [ // level 4: lush forest
            { y: 4, leaves: [{ x: -16, w: 52, h: 44 }, { x: 18, w: 50, h: 42 }] },
            { y: -10, leaves: [{ x: -40, w: 48, h: 40 }, { x: 0, w: 54, h: 46 }, { x: 40, w: 46, h: 38 }] },
            { y: -26, leaves: [{ x: -56, w: 42, h: 36 }, { x: -18, w: 44, h: 38 }, { x: 20, w: 46, h: 40 }, { x: 54, w: 40, h: 34 }] },
            { y: -42, leaves: [{ x: -38, w: 38, h: 32 }, { x: 0, w: 42, h: 36 }, { x: 36, w: 36, h: 30 }] },
            { y: -56, leaves: [{ x: -20, w: 34, h: 28 }, { x: 18, w: 32, h: 26 }] },
            { y: -68, leaves: [{ x: 0, w: 28, h: 24 }] }
        ],
        [ // level 5: massive rainforest canopy
            { y: 8, leaves: [{ x: -28, w: 56, h: 48 }, { x: 26, w: 54, h: 46 }] },
            { y: -6, leaves: [{ x: -54, w: 50, h: 42 }, { x: 0, w: 58, h: 50 }, { x: 52, w: 48, h: 40 }] },
            { y: -22, leaves: [{ x: -70, w: 46, h: 38 }, { x: -28, w: 50, h: 44 }, { x: 26, w: 52, h: 44 }, { x: 68, w: 44, h: 36 }] },
            { y: -38, leaves: [{ x: -58, w: 42, h: 36 }, { x: -16, w: 48, h: 40 }, { x: 18, w: 46, h: 38 }, { x: 56, w: 40, h: 34 }] },
            { y: -52, leaves: [{ x: -42, w: 38, h: 32 }, { x: 0, w: 44, h: 38 }, { x: 40, w: 36, h: 30 }] },
            { y: -64, leaves: [{ x: -24, w: 34, h: 28 }, { x: 22, w: 32, h: 26 }] },
            { y: -76, leaves: [{ x: -8, w: 28, h: 24 }, { x: 10, w: 26, h: 22 }] },
            { y: -86, leaves: [{ x: 0, w: 22, h: 18 }] }
        ]
    ];
    if (level >= 1) {
        const rows = canopyData[level];
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        rows.forEach(row => {
            row.leaves.forEach(l => {
                minX = Math.min(minX, l.x - l.w / 2);
                maxX = Math.max(maxX, l.x + l.w / 2);
                minY = Math.min(minY, row.y - l.h / 2);
                maxY = Math.max(maxY, row.y + l.h / 2);
            });
        });
        const canopyW = maxX - minX + 10;
        const canopyH = maxY - minY + 10;
        leavesWrap.style.width = canopyW + 'px';
        leavesWrap.style.height = canopyH + 'px';
        let leafIdx = 0;
        rows.forEach(row => {
            row.leaves.forEach(l => {
                const leaf = document.createElement('div');
                leaf.className = 'leaf-circle sway';
                leaf.style.width = l.w + 'px';
                leaf.style.height = l.h + 'px';
                leaf.style.left = (l.x - minX + 5 - l.w / 2) + 'px';
                leaf.style.top = (row.y - minY + 5 - l.h / 2) + 'px';
                const c1 = leafGreens[leafIdx % leafGreens.length];
                const c2 = leafGreens[(leafIdx + 3) % leafGreens.length];
                leaf.style.background = `radial-gradient(ellipse at 38% 38%, ${c1}, ${c2})`;
                leaf.style.animationDelay = (leafIdx * 0.25) + 's';
                leavesWrap.appendChild(leaf);
                leafIdx++;
            });
        });
        const bottomLeafOffset = maxY + 5;
        leavesWrap.style.bottom = (trunkHeights[level] - bottomLeafOffset) + 'px';
    }

    // Flowers
    flowers.innerHTML = '';
    if (level >= 3) {
        const flowerEmojis = ['🌸', '🌺', '🌻', '🌼', '🌷', '💐'];
        const count = level === 3 ? 3 : level === 4 ? 5 : 8;
        for (let i = 0; i < count; i++) {
            const f = document.createElement('span');
            f.className = 'flower';
            f.textContent = flowerEmojis[i % flowerEmojis.length];
            f.style.left = (8 + Math.random() * 84) + '%';
            f.style.bottom = (15 + Math.random() * 20) + 'px';
            f.style.animationDelay = (Math.random() * 2) + 's';
            f.style.fontSize = (12 + Math.random() * 6) + 'px';
            flowers.appendChild(f);
        }
    }

    // Falling leaf particles at high levels
    particleLayer.innerHTML = '';
    if (level >= 4) {
        const leafEmojis = ['🍃', '🍂', '🌿'];
        const pCount = level === 4 ? 3 : 6;
        for (let i = 0; i < pCount; i++) {
            const p = document.createElement('span');
            p.className = 'leaf-particle';
            p.textContent = leafEmojis[i % leafEmojis.length];
            p.style.left = (15 + Math.random() * 70) + '%';
            p.style.top = (10 + Math.random() * 30) + '%';
            p.style.animationDelay = (Math.random() * 6) + 's';
            p.style.animationDuration = (3 + Math.random() * 3) + 's';
            particleLayer.appendChild(p);
        }
    }

    // Messages
    const messages = [
        'A barren desert. Save CO₂ to bring it to life!',
        '🌱 A tiny seedling appears! Keep going!',
        '🌿 Your sapling is growing strong!',
        '🌳 A green woodland is forming with flowers!',
        '🦌 A thriving forest with wildlife!',
        '🌈 A magnificent rainforest ecosystem!'
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
// ===== LEAFLET MAP =====
function initMap() {
    map = L.map('map', { center: [51.505, -0.09], zoom: 13, zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (!originCoords) setOriginFromCoords(lat, lng);
        else if (!destCoords) setDestFromCoords(lat, lng);
        else { clearRoute(); setOriginFromCoords(lat, lng); }
    });

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 14),
            () => { }, { enableHighAccuracy: false, timeout: 5000 }
        );
    }
}

function createMarkerIcon(type) {
    return L.divIcon({
        className: '',
        html: `<div class="marker-pin ${type}"><span>${type === 'origin' ? 'A' : 'B'}</span></div>`,
        iconSize: [24, 24], iconAnchor: [12, 24]
    });
}

async function setOriginFromCoords(lat, lng) {
    originCoords = { lat, lng };
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.marker([lat, lng], { icon: createMarkerIcon('origin'), draggable: true }).addTo(map);
    originMarker.on('dragend', async (e) => {
        const p = e.target.getLatLng();
        originCoords = { lat: p.lat, lng: p.lng };
        document.getElementById('originInput').value = await reverseGeocode(p.lat, p.lng);
        if (destCoords) fetchRoute();
    });
    document.getElementById('originInput').value = await reverseGeocode(lat, lng);
    if (destCoords) fetchRoute();
    fitMapBounds();
}

async function setDestFromCoords(lat, lng) {
    destCoords = { lat, lng };
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([lat, lng], { icon: createMarkerIcon('dest'), draggable: true }).addTo(map);
    destMarker.on('dragend', async (e) => {
        const p = e.target.getLatLng();
        destCoords = { lat: p.lat, lng: p.lng };
        document.getElementById('destInput').value = await reverseGeocode(p.lat, p.lng);
        if (originCoords) fetchRoute();
    });
    document.getElementById('destInput').value = await reverseGeocode(lat, lng);
    if (originCoords) fetchRoute();
    fitMapBounds();
}

function fitMapBounds() {
    const pts = [];
    if (originCoords) pts.push([originCoords.lat, originCoords.lng]);
    if (destCoords) pts.push([destCoords.lat, destCoords.lng]);
    if (pts.length === 2) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
}

function clearRoute() {
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    originCoords = null; destCoords = null;
    routeData = { distance_km: null, duration_min: null };
    document.getElementById('routeInfoOverlay').style.display = 'none';
}

function locateMe() {
    if (!navigator.geolocation) return showToast('⚠️', 'Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 15);
            setOriginFromCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => showToast('⚠️', 'Could not get your location'),
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ===== NOMINATIM GEOCODING =====
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await res.json();
        if (data.address) {
            const a = data.address;
            return a.road
                ? `${a.house_number ? a.house_number + ' ' : ''}${a.road}${a.suburb ? ', ' + a.suburb : ''}`
                : data.display_name.split(',').slice(0, 2).join(',').trim();
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

function setupSearchInputs() {
    document.getElementById('originInput').addEventListener('input', (e) =>
        debounceGeoSearch(e.target.value, 'originResults', 'origin'));
    document.getElementById('destInput').addEventListener('input', (e) =>
        debounceGeoSearch(e.target.value, 'destResults', 'dest'));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-input-wrap')) {
            document.getElementById('originResults').classList.remove('show');
            document.getElementById('destResults').classList.remove('show');
        }
    });
}

function debounceGeoSearch(query, resultElId, type) {
    clearTimeout(searchTimeout);
    if (query.length < 3) { document.getElementById(resultElId).classList.remove('show'); return; }
    searchTimeout = setTimeout(() => forwardGeocode(query, resultElId, type), 400);
}

async function forwardGeocode(query, resultElId, type) {
    const el = document.getElementById(resultElId);
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const results = await res.json();
        if (!results.length) { el.classList.remove('show'); return; }
        el.innerHTML = results.map(r => {
            const label = r.display_name.split(',').slice(0, 3).join(',').trim();
            return `<div class="search-dropdown-item" data-lat="${r.lat}" data-lng="${r.lon}" data-type="${type}">${escapeHtml(label)}</div>`;
        }).join('');
        el.querySelectorAll('.search-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                el.classList.remove('show');
                if (item.dataset.type === 'origin') {
                    document.getElementById('originInput').value = item.textContent;
                    setOriginFromCoords(lat, lng);
                } else {
                    document.getElementById('destInput').value = item.textContent;
                    setDestFromCoords(lat, lng);
                }
            });
        });
        el.classList.add('show');
    } catch { el.classList.remove('show'); }
}

// ===== OSRM ROUTING =====
async function fetchRoute() {
    if (!originCoords || !destCoords) return;
    const profile = selectedMode ? (OSRM_PROFILES[selectedMode] || 'car') : 'car';
    try {
        const url = `https://router.project-osrm.org/route/v1/${profile}/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes.length > 0) {
            const route = data.routes[0];
            routeData.distance_km = +(route.distance / 1000).toFixed(2);
            routeData.duration_min = +(route.duration / 60).toFixed(1);
            // Draw route
            if (routeLine) map.removeLayer(routeLine);
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
            routeLine = L.polyline(coords, {
                color: '#22c55e', weight: 4, opacity: 0.8,
                dashArray: selectedMode === 'train' ? '8, 8' : null
            }).addTo(map);
            map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
            updateRouteDisplay();
        }
    } catch {
        // Haversine fallback
        const R = 6371;
        const dLat = (destCoords.lat - originCoords.lat) * Math.PI / 180;
        const dLon = (destCoords.lng - originCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(originCoords.lat * Math.PI / 180) * Math.cos(destCoords.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        routeData.distance_km = +(straight * 1.3).toFixed(2);
        routeData.duration_min = null;
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(
            [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]],
            { color: '#22c55e', weight: 3, opacity: 0.5, dashArray: '6, 8' }
        ).addTo(map);
        updateRouteDisplay();
    }
}

function updateRouteDisplay() {
    const el = document.getElementById('routeInfoOverlay');
    el.style.display = '';
    const d = routeData.distance_km;
    document.getElementById('routeDistText').textContent = d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)} km`;
    if (routeData.duration_min) {
        const m = routeData.duration_min;
        document.getElementById('routeTimeText').textContent = m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
    } else {
        document.getElementById('routeTimeText').textContent = '~' + Math.round((d / (SPEED_FACTORS[selectedMode || 'car'])) * 60) + ' min';
    }
    // Auto-fill distance field
    document.getElementById('distanceInput').value = d.toFixed(1);
    document.getElementById('distHint').textContent = '(from route)';
}