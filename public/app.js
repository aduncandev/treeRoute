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
const SPEED_FACTORS = { car: 30, bus: 12, train: 45, bike: 15, walk: 5, eScooter: 20 };
const OSRM_PROFILES = { car: 'car', bus: 'car', train: null, bike: 'bike', walk: 'foot', eScooter: 'bike' };

const MILESTONES = [5, 15, 50, 100, 200, 500, 1000];

const ECO_FACTS = [
    "🍃 Cycling instead of driving saves ~171g CO₂ per km.",
    "🌳 You'd need to plant 1 tree to offset just 21kg of yearly car emissions.",
    "🚶 A 3km walk saves 0.5kg CO₂ vs driving — and burns ~170 calories.",
    "🚌 Buses emit 43% less CO₂ per passenger km than cars.",
    "🚆 Trains produce 80% less CO₂ than cars per km.",
    "🛴 E-scooters emit just 5g CO₂/km — 97% less than a car.",
    "🚗 The average car commuter emits ~1,200kg CO₂ per year.",
    "🌍 If everyone cycled 2km/day instead of driving, we'd cut global emissions by 686M tonnes.",
    "💪 Walking 5km burns ~285 calories — equal to a chocolate bar.",
    "📱 One smartphone charge = 8g CO₂. One km by car = 171g. That's 21 phone charges.",
    "🏙️ Short car trips under 3km produce 50% more emissions per km due to cold engines.",
    "🚴 Regular cyclists take 15% fewer sick days than drivers.",
    "🌿 Replacing one 8km car commute with cycling saves ~500kg CO₂ per year.",
    "⏱️ In city traffic, cycling is often faster than driving for trips under 5km.",
    "🐧 Saving just 3kg CO₂ preserves one day of penguin habitat from sea ice loss.",
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
        updateImpacts(0);
    }
    // Update mode time estimates when user types distance manually
    document.getElementById('distanceInput').addEventListener('input', updateModeTimeEstimates);
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
        hideComparison();
        navigateTo('dashboard');
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
    if (['profile', 'journeys'].includes(currentPage)) navigateTo('dashboard');
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
        const initial = currentUser.username.charAt(0).toUpperCase();
        
        // Use profile_pic if it exists, otherwise use the initial
        const avatarContent = currentUser.profile_pic 
            ? `<img src="${currentUser.profile_pic}" class="nav-avatar-img">`
            : `<span class="nav-avatar-initial">${initial}</span>`;
        
        area.innerHTML = `
            <div class="nav-user">
                <a href="javascript:void(0)" onclick="navigateTo('profile')" class="nav-profile-link">
                    <div class="nav-avatar-container">
                        ${avatarContent}
                    </div>
                    <div class="nav-user-info">
                        <span class="username">${currentUser.username}</span>
                        <span class="level-badge">Lvl ${currentUser.level || 1}</span>
                    </div>
                </a>
                <button class="btn-ghost logout-btn" onclick="logout()">Logout</button>
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

    if (page === 'journeys') {
        if (token) { loadJourneys(); }
        else { document.getElementById('journeysList').innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p>Sign in to track and view your journey history.</p><button class="btn-signin" onclick="showAuthModal('register')" style="margin-top:12px">Create Account</button></div>`; }
    }
    if (page === 'leaderboard') loadLeaderboard(leaderboardType);
    if (page === 'profile') {
        if (token) { loadProfileData(); }
        else { navigateTo('dashboard'); showAuthModal('login'); }
    }
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

    const savedEl = document.getElementById('stat-saved');
    savedEl.textContent = fmtNum(totals.co2_saved_kg) + ' kg';
    savedEl.className = 'stat-card-value ' + (totals.co2_saved_kg < 0 ? 'red' : 'green');
    document.querySelector('#stat-saved + .stat-card-sub').textContent = totals.co2_saved_kg < 0 ? 'try greener transport to recover' : 'vs taking the car';
    document.getElementById('stat-emitted').textContent = fmtNum(totals.co2_emitted_kg) + ' kg';
    document.getElementById('stat-distance').textContent = fmtNum(totals.distance_km) + ' km';
    document.getElementById('stat-distance-sub').textContent = `across ${fmtNum(totals.journeys, 0)} journeys`;
    document.getElementById('stat-journeys').textContent = fmtNum(totals.journeys, 0);

    // Calories
    const cal = totals.calories_burned || 0;
    document.getElementById('stat-calories').textContent = fmtNum(cal, 0) + ' kcal';
    updateCaloriesSub(totals);

    // Ecosystem
    updateEcosystem(totals.co2_saved_kg);
    updateMilestone(totals.co2_saved_kg);
    updateImpacts(totals.co2_saved_kg);

    // Quick info — streak + daily challenges
    const quickInfo = document.getElementById('dashQuickInfo');
    if (user && quickInfo) {
        quickInfo.style.display = '';
        const streak = user.current_streak || 0;
        document.getElementById('dashStreakCount').textContent = streak;
        document.getElementById('dashStreakLabel').textContent = streak === 1 ? 'day streak' : 'day streak';

        if (data.daily_challenges && data.daily_challenges.length > 0) {
            const done = data.daily_challenges.filter(c => c.completed).length;
            const total = data.daily_challenges.length;
            document.getElementById('dashCpCount').textContent = `${done}/${total}`;
            document.getElementById('dashChallengesMini').innerHTML = data.daily_challenges.map(ch =>
                `<div class="dash-challenge-item ${ch.completed ? 'done' : ''}">
                    <span class="dash-ch-check">${ch.completed ? '✅' : '⬜'}</span>
                    <span class="dash-challenge-desc">${escapeHtml(ch.desc)}</span>
                    <span class="dash-challenge-xp">+${ch.xp} XP</span>
                </div>`
            ).join('');
        }
    }

    // Recommendations / insights
    const recCard = document.getElementById('dashRecommendationCard');
    const recs = data.recommendations || (data.recommendation ? [{ icon: '💡', text: data.recommendation }] : []);
    if (recs.length > 0) {
        recCard.style.display = '';
        document.getElementById('dashRecommendationList').innerHTML = recs.map(r =>
            `<div class="recommendation-item"><span class="rec-item-icon">${r.icon || '💡'}</span><p>${escapeHtml(r.text)}</p></div>`
        ).join('');
    } else {
        recCard.style.display = 'none';
    }

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

function hideComparison() {
    const section = document.getElementById('comparisonSection');
    if (section) {
        section.classList.remove('open');
        section.style.display = 'none';
        const body = document.getElementById('comparisonBody');
        if (body) body.style.maxHeight = '0';
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
    updateImpacts(0);
    hideComparison();
    const quickInfo = document.getElementById('dashQuickInfo');
    if (quickInfo) quickInfo.style.display = 'none';
    const recCard = document.getElementById('dashRecommendationCard');
    if (recCard) recCard.style.display = 'none';
}

// ===== MODE SELECTION =====
function selectMode(mode) {
    selectedMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // Don't re-fetch route on mode change — reuse existing distance, just update time display
    if (routeData.distance_km) {
        updateRouteDisplay();
    }
    updateModeTimeEstimates();
}

function updateModeTimeEstimates() {
    const dist = routeData.distance_km || parseFloat(document.getElementById('distanceInput').value) || 0;
    Object.keys(SPEED_FACTORS).forEach(mode => {
        const el = document.getElementById('modeTime-' + mode);
        if (!el) return;
        if (dist <= 0) { el.textContent = ''; return; }
        const mins = Math.round((dist / SPEED_FACTORS[mode]) * 60);
        el.textContent = mins < 60 ? `~${mins}m` : `~${Math.floor(mins / 60)}h${mins % 60 > 0 ? mins % 60 + 'm' : ''}`;
    });
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
        const ecosystemPenalty = ['car', 'bus', 'train'].includes(selectedMode) ? co2_emitted * 0.10 : 0;
        const co2_saved = (distance * CO2_FACTORS.car) - co2_emitted - ecosystemPenalty;
        const calories = distance * CALORIE_FACTORS[selectedMode];
        const carCo2 = distance * CO2_FACTORS.car;

        guestStats.co2Saved += co2_saved;
        guestStats.co2Emitted += co2_emitted;
        guestStats.distance += distance;
        guestStats.calories += calories;
        guestStats.journeyCount++;
        if (!guestStats.caloriesByMode) guestStats.caloriesByMode = {};
        guestStats.caloriesByMode[selectedMode] = (guestStats.caloriesByMode[selectedMode] || 0) + calories;

        const guestSavedEl = document.getElementById('stat-saved');
        guestSavedEl.textContent = fmtNum(guestStats.co2Saved) + ' kg';
        guestSavedEl.className = 'stat-card-value ' + (guestStats.co2Saved < 0 ? 'red' : 'green');
        document.querySelector('#stat-saved + .stat-card-sub').textContent = guestStats.co2Saved < 0 ? 'try greener transport to recover' : 'vs taking the car';
        document.getElementById('stat-emitted').textContent = fmtNum(guestStats.co2Emitted) + ' kg';
        document.getElementById('stat-distance').textContent = fmtNum(guestStats.distance) + ' km';
        document.getElementById('stat-distance-sub').textContent = `across ${fmtNum(guestStats.journeyCount, 0)} journeys`;
        document.getElementById('stat-journeys').textContent = fmtNum(guestStats.journeyCount, 0);

        // Update calories stat card
        document.getElementById('stat-calories').textContent = fmtNum(guestStats.calories, 0) + ' kcal';
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
        }, distance, selectedMode);

        updateEcosystem(guestStats.co2Saved);
        updateMilestone(guestStats.co2Saved);
        updateImpacts(guestStats.co2Saved);

        showToast('🌱', 'Journey calculated! Create an account to save your progress.');
        // Show sign-up prompt below comparison savings
        const signupPrompt = document.getElementById('compSavings');
        if (signupPrompt) {
            signupPrompt.insertAdjacentHTML('afterend', `<div style="text-align:center;margin-top:12px"><div class="saving-badge" style="cursor:pointer;background:#dbeafe;border-color:#93c5fd;color:#1d4ed8;display:inline-block" onclick="showAuthModal('register')">📝 Create a free account to save your journeys</div></div>`);
        }
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
        }, data.journey.distance_km, data.journey.mode);

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

function showComparison(data, distance, activeMode) {
    const section = document.getElementById('comparisonSection');
    const body = document.getElementById('comparisonBody');
    section.style.display = '';
    body.style.maxHeight = body.scrollHeight + 600 + 'px';
    section.classList.add('open');

    // Gray out the comparison box when car is selected
    const isCarMode = activeMode === 'car';
    section.style.background = isCarMode ? '#f3f4f6' : '';
    section.style.borderColor = isCarMode ? '#d1d5db' : '';
    const titleEl = section.querySelector('.comparison-section-title');
    if (titleEl) titleEl.style.color = isCarMode ? '#6b7280' : '';
    const toggleBtn = section.querySelector('.comparison-toggle-btn');
    if (toggleBtn) toggleBtn.style.color = isCarMode ? '#6b7280' : '';

    const yourCo2El = document.getElementById('compYourCo2');
    yourCo2El.textContent = data.co2_emitted.toFixed(2) + ' kg';
    yourCo2El.style.color = isCarMode ? 'var(--gray-400)' : '';
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
    if (data.co2_saved < 0) {
        savings.innerHTML = `<div class="saving-badge" style="color:#ef4444">🌿 Your ecosystem lost ${Math.abs(data.co2_saved).toFixed(2)}kg — try a greener mode to recover!</div>`;
    } else if (data.co2_saved === 0) {
        savings.innerHTML = `<div class="saving-badge">🚗 No CO₂ saved — consider a greener mode next time!</div>`;
    }

    // Render mode comparison chart + cards
    if (distance && activeMode) {
        const modes = {};
        Object.keys(CO2_FACTORS).forEach(mode => {
            modes[mode] = {
                co2: distance * CO2_FACTORS[mode],
                calories: distance * CALORIE_FACTORS[mode],
                time: Math.round((distance / SPEED_FACTORS[mode]) * 60)
            };
        });
        renderModeComparison(modes, activeMode);
    }

    // Auto-scroll into view
    setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function toggleComparison() {
    const section = document.getElementById('comparisonSection');
    const body = document.getElementById('comparisonBody');
    if (section.classList.contains('open')) {
        section.classList.remove('open');
        body.style.maxHeight = '0';
    } else {
        section.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
    }
}

let modeCompChart = null;

function renderModeComparison(modes, activeMode) {
    const canvas = document.getElementById('modeCompChart');
    const cardsEl = document.getElementById('modeCompCards');
    if (!canvas || !cardsEl) return;

    // Destroy previous chart
    if (modeCompChart) {
        modeCompChart.destroy();
        modeCompChart = null;
    }

    const modeKeys = Object.keys(modes);
    const labels = modeKeys.map(m => MODE_NAMES[m] || m);
    const co2Data = modeKeys.map(m => +modes[m].co2.toFixed(3));
    const bgColors = modeKeys.map(m => m === 'car' ? '#ef4444' : m === activeMode ? '#22c55e' : '#94a3b8');

    // Chart.js grouped bar chart
    if (typeof Chart !== 'undefined') {
        const ctx = canvas.getContext('2d');
        modeCompChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'CO₂ (kg)',
                    data: co2Data,
                    backgroundColor: bgColors,
                    borderRadius: 6,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.parsed.y.toFixed(3) + ' kg CO₂'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'CO₂ (kg)', font: { size: 11 } },
                        grid: { color: '#f3f4f6' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Mode comparison cards
    cardsEl.innerHTML = modeKeys.map(m => {
        const d = modes[m];
        const isActive = m === activeMode;
        const isCar = m === 'car';
        const borderClass = isCar ? 'border-red' : isActive ? 'border-green' : '';
        return `
            <div class="mode-comp-card ${borderClass}" ${isActive ? 'data-active="true"' : ''}>
                <div class="mode-comp-icon">${MODE_ICONS[m]}</div>
                <div class="mode-comp-name">${MODE_NAMES[m]}</div>
                <div class="mode-comp-stat"><strong>${fmtNum(d.co2, 3)}</strong> kg CO₂</div>
                <div class="mode-comp-stat">${fmtNum(d.time, 0)} min</div>
                <div class="mode-comp-stat">${fmtNum(d.calories, 0)} cal</div>
            </div>
        `;
    }).join('');
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
    const clamped = Math.max(0, co2Saved);
    const next = MILESTONES.find(m => m > clamped) || MILESTONES[MILESTONES.length - 1];
    const prev = MILESTONES[MILESTONES.indexOf(next) - 1] || 0;
    const progress = next > prev ? ((clamped - prev) / (next - prev)) * 100 : 100;

    document.getElementById('milestoneLabel').textContent = next + ' kg';
    document.getElementById('progressFill').style.width = Math.min(100, Math.max(0, progress)) + '%';
    const toGo = (next - co2Saved).toFixed(1);
    document.getElementById('milestoneToGo').textContent = co2Saved < 0
        ? `${Math.abs(co2Saved).toFixed(1)} kg in deficit — save CO₂ to recover`
        : `${toGo} kg to go`;
    const co2El = document.getElementById('co2Display');
    co2El.textContent = co2Saved.toFixed(1);
    co2El.style.color = co2Saved < 0 ? '#ef4444' : '';
}

// ===== NUMBER FORMATTING =====
function formatImpactNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'k';
    if (n < 1 && n > 0) return n.toFixed(1);
    return Math.round(n).toString();
}

function fmtNum(n, decimals = 1) {
    if (n == null || isNaN(n)) return '0';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + 'k';
    if (decimals === 0) return Math.round(n).toString();
    return n.toFixed(decimals);
}

function updateImpacts(co2Saved) {
    const clamped = Math.max(0, co2Saved);
    // 1 penguin "habit" (daily foraging trip undisrupted) per 3 kg CO2 saved
    const penguins = clamped / 3;
    // 1 tree absorbs ~21 kg CO2/year
    const trees = clamped / 21;
    // 1 smartphone charge ≈ 8.22 g CO2 = 0.00822 kg
    const phones = clamped / 0.00822;
    // 1 blimp (Goodyear-size) holds ~11,000 kg of gas
    const blimps = clamped / 11000;

    document.getElementById('impact-penguins').textContent = formatImpactNum(penguins);
    document.getElementById('impact-trees').textContent   = formatImpactNum(trees);
    document.getElementById('impact-phones').textContent  = formatImpactNum(phones);
    document.getElementById('impact-blimps').textContent  = blimps < 0.001 ? '<0.001' : blimps.toFixed(4);
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
                leaf.style.background = `radial-gradient(ellipse at 35% 30%, ${c1}, ${c2})`;
                // Organic varied border-radius for natural look
                const r1 = 40 + (leafIdx * 7 % 20);
                const r2 = 50 + (leafIdx * 11 % 15);
                const r3 = 45 + (leafIdx * 13 % 18);
                const r4 = 38 + (leafIdx * 9 % 22);
                leaf.style.borderRadius = `${r1}% ${r2}% ${r3}% ${r4}%`;
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
    msg.textContent = co2Saved < 0
        ? `⚠️ Your ecosystem is in deficit! Use greener transport to recover.`
        : messages[level];
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
    const container = document.getElementById('journeysList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const data = await api(`/journeys?page=${page}&limit=15`);
        if (data.journeys.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p>No journeys yet. Log your first journey from the dashboard!</p></div>`;
            return;
        }

        container.innerHTML = data.journeys.map((j, idx) => {
            const created = new Date(j.created_at);
            const co2Emitted = j.co2_emitted != null ? j.co2_emitted : (j.distance_km * (CO2_FACTORS[j.mode] || 0));
            const travelTime = j.travel_time_min != null ? j.travel_time_min : Math.round((j.distance_km / (SPEED_FACTORS[j.mode] || 15)) * 60);

            // Build mini mode comparison
            const modeCompHtml = Object.keys(CO2_FACTORS).map(m => {
                const co2 = j.distance_km * CO2_FACTORS[m];
                const cal = j.distance_km * CALORIE_FACTORS[m];
                const time = Math.round((j.distance_km / SPEED_FACTORS[m]) * 60);
                const isActive = m === j.mode;
                const isCar = m === 'car';
                const cls = isCar ? 'border-red' : isActive ? 'border-green' : '';
                return `<div class="mode-comp-card ${cls}" ${isActive ? 'data-active="true"' : ''}>
                    <div class="mode-comp-icon">${MODE_ICONS[m]}</div>
                    <div class="mode-comp-name">${MODE_NAMES[m]}</div>
                    <div class="mode-comp-stat"><strong>${fmtNum(co2, 3)}</strong> kg CO₂</div>
                    <div class="mode-comp-stat">${fmtNum(time, 0)} min</div>
                    <div class="mode-comp-stat">${fmtNum(cal, 0)} cal</div>
                </div>`;
            }).join('');

            return `
            <div class="journey-item" onclick="toggleJourneyDetail(${idx})" style="cursor:pointer">
                <div class="journey-mode-icon">${MODE_ICONS[j.mode] || '🚶'}</div>
                <div class="journey-details">
                    <h4>${escapeHtml(j.origin)} → ${escapeHtml(j.destination)}</h4>
                    <div class="journey-meta">
                        <span>${MODE_NAMES[j.mode] || j.mode}</span>
                        <span>${fmtNum(j.distance_km)} km</span>
                        <span style="color:${j.co2_saved >= 0 ? 'var(--green-500)' : '#ef4444'}">${j.co2_saved > 0 ? '+' : ''}${fmtNum(j.co2_saved, 2)}kg CO₂</span>
                        ${j.calories_burned > 0 ? `<span>${fmtNum(j.calories_burned, 0)} cal</span>` : ''}
                        <span>${created.toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="journey-xp">+${j.xp_earned} XP</div>
                <svg class="journey-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>
            <div class="journey-detail-panel" id="journeyDetail-${idx}">
                <div class="journey-detail-grid">
                    <div class="journey-detail-stat">
                        <span class="jd-label">CO₂ Emitted</span>
                        <span class="jd-value">${fmtNum(co2Emitted, 3)} kg</span>
                    </div>
                    <div class="journey-detail-stat">
                        <span class="jd-label">CO₂ Saved vs Car</span>
                        <span class="jd-value ${j.co2_saved >= 0 ? 'green' : 'red'}">${j.co2_saved > 0 ? '+' : ''}${fmtNum(j.co2_saved, 3)} kg</span>
                    </div>
                    <div class="journey-detail-stat">
                        <span class="jd-label">Travel Time</span>
                        <span class="jd-value">${fmtNum(travelTime, 0)} min</span>
                    </div>
                    <div class="journey-detail-stat">
                        <span class="jd-label">Calories</span>
                        <span class="jd-value">${fmtNum(j.calories_burned || 0, 0)} kcal</span>
                    </div>
                    <div class="journey-detail-stat">
                        <span class="jd-label">Date</span>
                        <span class="jd-value">${created.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div class="journey-detail-stat">
                        <span class="jd-label">Time</span>
                        <span class="jd-value">${created.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
                <div class="journey-detail-modes-title">Mode Comparison for ${j.distance_km.toFixed(1)} km</div>
                <div class="journey-detail-chart-wrap">
                    <canvas id="journeyChart-${idx}" height="160"></canvas>
                </div>
                <div class="mode-comp-cards">${modeCompHtml}</div>
            </div>`;
        }).join('');

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

const journeyDetailCharts = {};

function toggleJourneyDetail(idx) {
    const panel = document.getElementById(`journeyDetail-${idx}`);
    if (!panel) return;
    const isOpen = panel.classList.contains('open');

    // Close all panels (accordion) and destroy their charts
    document.querySelectorAll('.journey-detail-panel.open').forEach(p => {
        p.classList.remove('open');
        p.style.maxHeight = '0';
        const item = p.previousElementSibling;
        if (item) item.querySelector('.journey-chevron')?.classList.remove('open');
    });

    if (!isOpen) {
        panel.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 200 + 'px';
        const item = panel.previousElementSibling;
        if (item) item.querySelector('.journey-chevron')?.classList.add('open');

        // Render chart for this journey
        renderJourneyDetailChart(idx);
    }
}

function renderJourneyDetailChart(idx) {
    const canvas = document.getElementById(`journeyChart-${idx}`);
    if (!canvas || typeof Chart === 'undefined') return;

    // Destroy previous chart for this index
    if (journeyDetailCharts[idx]) {
        journeyDetailCharts[idx].destroy();
        delete journeyDetailCharts[idx];
    }

    // Read distance from the panel title text
    const panel = document.getElementById(`journeyDetail-${idx}`);
    const titleEl = panel.querySelector('.journey-detail-modes-title');
    const distMatch = titleEl?.textContent.match(/([\d.]+)\s*km/);
    if (!distMatch) return;
    const distance = parseFloat(distMatch[1]);

    // Read the active mode from the data attribute on the card
    const activeCard = panel.querySelector('.mode-comp-card[data-active] .mode-comp-name');
    const activeModeName = activeCard?.textContent || '';
    const activeModeKey = Object.keys(MODE_NAMES).find(k => MODE_NAMES[k] === activeModeName) || 'walk';

    const modeKeys = Object.keys(CO2_FACTORS);
    const labels = modeKeys.map(m => MODE_NAMES[m]);
    const co2Data = modeKeys.map(m => +(distance * CO2_FACTORS[m]).toFixed(3));
    const bgColors = modeKeys.map(m => m === 'car' ? '#ef4444' : m === activeModeKey ? '#22c55e' : '#94a3b8');

    journeyDetailCharts[idx] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'CO₂ (kg)',
                data: co2Data,
                backgroundColor: bgColors,
                borderRadius: 6,
                maxBarThickness: 36
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: ctx => ctx.parsed.y.toFixed(3) + ' kg CO₂' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'CO₂ (kg)', font: { size: 10 } },
                    grid: { color: '#f3f4f6' }
                },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });

    // Update maxHeight after chart renders
    setTimeout(() => {
        if (panel.classList.contains('open')) {
            panel.style.maxHeight = panel.scrollHeight + 'px';
        }
    }, 100);
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
                            <td style="font-weight:600">${fmtNum(e.value)}</td>
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
    updateModeTimeEstimates();
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
let geocodeAbortController = null;
async function reverseGeocode(lat, lng) {
    if (geocodeAbortController) geocodeAbortController.abort();
    geocodeAbortController = new AbortController();
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' },
            signal: geocodeAbortController.signal
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
let routeAbortController = null;
async function fetchRoute() {
    if (!originCoords || !destCoords) return;
    // Abort any in-flight route request to avoid stacking
    if (routeAbortController) routeAbortController.abort();
    routeAbortController = new AbortController();
    const profile = selectedMode ? (OSRM_PROFILES[selectedMode] || 'car') : 'car';
    try {
        const url = `https://router.project-osrm.org/route/v1/${profile}/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: routeAbortController.signal });
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
    } catch (err) {
        // Skip fallback if this request was intentionally aborted
        if (err && err.name === 'AbortError') return;
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
    // Always calculate time from mode speed — OSRM duration is for its profile (car/bike/foot), not the selected mode
    const m = Math.round((d / SPEED_FACTORS[selectedMode || 'car']) * 60);
    document.getElementById('routeTimeText').textContent = m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}m`;
    // Auto-fill distance field
    document.getElementById('distanceInput').value = d.toFixed(1);
    document.getElementById('distHint').textContent = '(from route)';
    updateModeTimeEstimates();
}