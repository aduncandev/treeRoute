// ── Procedural Generation (PRNG) ──
function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 2716044179);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 951274213);
    return (h1^h2^h3^h4)>>>0;
}
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Global user state
let currentUser = localStorage.getItem('treeRoute_user') || 'Guest';

// ── Data & Constants ──
const MODES = {
    car:     { label: 'Car',           speedKmh: 50, calPerKm: 0,  co2PerKm: 0.192 },
    walk:    { label: 'Walking',       speedKmh: 5,  calPerKm: 50, co2PerKm: 0 },
    bike:    { label: 'Bicycle',       speedKmh: 15, calPerKm: 25, co2PerKm: 0 },
    transit: { label: 'Public Transit',speedKmh: 30, calPerKm: 2,  co2PerKm: 0.04 },
    ecar:    { label: 'Electric Car',  speedKmh: 50, calPerKm: 0,  co2PerKm: 0.05 }
};
const CAR_CO2 = 0.192;
const MILESTONES = [15, 30, 60, 100, 200, 350, 500, 1000, 2500, 5000, 10000];

let journeys = [];
let coordsA = null, coordsB = null;

// ── State ──
function getTotals() {
    let saved = 0, emitted = 0, dist = 0, carCount = 0;
    journeys.forEach(j => {
        saved += j.co2Saved;
        emitted += j.co2Emitted;
        dist += j.distanceKm;
        if (j.mode === 'car') carCount++;
    });
    return { saved, emitted, dist, carCount };
}

// ── Geocoding (Nominatim) ──
let debounceTimer = null;
async function geocode(query) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    return r.json();
}

function setupAutocomplete(inputId, listId, isOrigin) {
    const input = document.getElementById(inputId);
    const list  = document.getElementById(listId);

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        if (input.value.length < 3) { list.classList.remove('open'); return; }
        debounceTimer = setTimeout(async () => {
            const results = await geocode(input.value);
            list.innerHTML = '';
            if (results.length) {
                list.classList.add('open');
                results.forEach(item => {
                    const div = document.createElement('div');
                    div.textContent = item.display_name;
                    div.addEventListener('click', () => {
                        const short = item.display_name.split(',').slice(0,2).join(',');
                        input.value = short;
                        list.classList.remove('open');
                        const coords = { lat: parseFloat(item.lat), lon: parseFloat(item.lon), label: short };
                        if (isOrigin) coordsA = coords;
                        else          coordsB = coords;
                    });
                    list.appendChild(div);
                });
            } else { list.classList.remove('open'); }
        }, 450);
    });
    document.addEventListener('click', e => { if (e.target !== input) list.classList.remove('open'); });
}

setupAutocomplete('originInput', 'originList', true);
setupAutocomplete('destInput',   'destList',   false);

// ── Haversine Distance ──
function haversine(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR;
    const dLon = (b.lon - a.lon) * toR;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*toR)*Math.cos(b.lat*toR)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)) * 1.2; // 1.2 road buffer
}

// ── Toast ──
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Add Journey ──
document.getElementById('addJourneyBtn').addEventListener('click', () => {
    const originVal = document.getElementById('originInput').value.trim();
    const destVal   = document.getElementById('destInput').value.trim();
    const mode      = document.getElementById('transportMode').value;

    if (!originVal || !destVal) { showToast('Please enter both a starting point and a destination.'); return; }
    if (!coordsA || !coordsB)   { showToast('Please select locations from the suggestions list.'); return; }

    const distKm     = haversine(coordsA, coordsB);
    const modeData   = MODES[mode];
    const co2Emitted = distKm * modeData.co2PerKm;
    const co2Saved   = Math.max(0, distKm * CAR_CO2 - co2Emitted);

    journeys.push({ from: coordsA.label, to: coordsB.label, mode, distanceKm: distKm, co2Emitted, co2Saved });

    document.getElementById('originInput').value = '';
    document.getElementById('destInput').value   = '';
    coordsA = null; coordsB = null;

    updateUI();
});

// ── Update All UI ──
function updateUI() {
    const { saved, emitted, dist, carCount } = getTotals();
    const n = journeys.length;
    const carPct = n > 0 ? Math.round((carCount / n) * 100) : 0;

    // Stat cards
    document.getElementById('stat-saved').textContent    = saved.toFixed(1) + ' kg';
    document.getElementById('stat-emitted').textContent  = emitted.toFixed(1) + ' kg';
    document.getElementById('stat-distance').textContent = dist.toFixed(1) + ' km';
    document.getElementById('stat-distance-sub').textContent = `across ${n} journey${n !== 1 ? 's' : ''}`;
    document.getElementById('stat-car').textContent      = carPct + '%';

    // CO2 display
    document.getElementById('co2Display').textContent = saved.toFixed(1);

    // Milestone
    const nextMs = MILESTONES.find(m => m > saved) || MILESTONES[MILESTONES.length - 1];
    const prevMs = MILESTONES[MILESTONES.indexOf(nextMs) - 1] || 0;
    const pct    = Math.min(100, ((saved - prevMs) / (nextMs - prevMs)) * 100);
    const toGo   = Math.max(0, nextMs - saved);
    document.getElementById('milestoneLabel').textContent  = nextMs + ' kg';
    document.getElementById('milestoneToGo').textContent   = toGo.toFixed(1) + ' kg to go';
    document.getElementById('progressFill').style.width    = pct + '%';

    // Ecosystem Evolution
    updateEcosystem(saved);

    // Journey log
    updateJourneyLog();
}

// ── Ecosystem Procedural Generation ──
function updateEcosystem(saved) {
    // Generate a fixed random seed from the user's name
    const seed = cyrb128(currentUser);
    const globalRng = mulberry32(seed);

    const BIOMES = [
        { name: 'Forest',   sky: '#bae6fd', ground: '#86efac', trunk: '#7c3f1a', leaves: ['#4ade80', '#22c55e', '#16a34a'] },
        { name: 'Autumn',   sky: '#ffedd5', ground: '#fcd34d', trunk: '#5c2e0e', leaves: ['#fb923c', '#f97316', '#ea580c'] },
        { name: 'Cherry',   sky: '#fce7f3', ground: '#fbcfe8', trunk: '#4a3022', leaves: ['#f9a8d4', '#f472b6', '#ec4899'] },
        { name: 'Tropical', sky: '#cffafe', ground: '#4ade80', trunk: '#78350f', leaves: ['#a3e635', '#84cc16', '#65a30d'] },
        { name: 'Pine',     sky: '#e0f2fe', ground: '#94a3b8', trunk: '#3f3f46', leaves: ['#0f766e', '#3f6212', '#14532d'] }
    ];

    // Select a unique biome for this user
    const biomeIndex = Math.floor(globalRng() * BIOMES.length);
    const biome = BIOMES[biomeIndex];

    const scrollArea = document.getElementById('ecoScrollArea');
    const sky = document.getElementById('ecoSky');
    const ground = document.getElementById('ecoGround');
    const msg = document.getElementById('treeMessage');
    const sun = document.getElementById('ecoSun');
    const river = document.getElementById('ecoRiver');

    // Clear existing procedural elements on re-render
    document.querySelectorAll('.proc-element').forEach(el => el.remove());

    if (saved === 0) {
        sky.style.background = '#e2e8f0';
        ground.style.background = '#d6cfc4';
        msg.textContent = `A barren desert. Save CO₂ to bring ${currentUser}'s ecosystem to life!`;
        sun.style.opacity = '0';
        river.style.opacity = '0';
        scrollArea.style.width = '100%';
        return;
    }

    // Set colors to user's biome
    sky.style.background = biome.sky;
    ground.style.background = biome.ground;
    sun.style.opacity = '1';
    sun.style.transform = `translateY(0)`;
    
    // Add river for advanced ecosystems
    if (saved > 40) {
        river.style.opacity = '1';
        river.style.transform = 'scaleY(1)';
    } else {
        river.style.opacity = '0';
        river.style.transform = 'scaleY(0)';
    }

    // Determine width dynamically so the forest can grow infinitely
    const containerWidth = document.getElementById('ecoScene').clientWidth || 800;
    let maxRight = containerWidth;

    // Generate 1 tree per 10kg saved, ensuring at least 1 tree if they saved > 0
    const numTrees = Math.floor(saved / 10) + (saved > 0 ? 1 : 0);

    for (let i = 0; i < numTrees; i++) {
        // Unique seed for this exact tree position
        const rng = mulberry32(seed + i * 9999);
        
        // Spread trees rightwards as more are added
        const spread = (i < 5) ? containerWidth * 0.8 : containerWidth * 0.8 + (i - 4) * 150;
        const x = (rng() * 100) + spread - 100; 
        
        if (x + 150 > maxRight) maxRight = x + 150;

        const scale = 0.6 + (rng() * 0.8);
        const zIndex = Math.floor(scale * 100);
        
        const tree = document.createElement('div');
        tree.className = 'proc-tree proc-element';
        tree.style.left = `${x}px`;
        tree.style.bottom = `${(rng() * 20)}px`;
        tree.style.transform = `scale(${scale})`;
        tree.style.zIndex = zIndex;

        const trunk = document.createElement('div');
        trunk.className = 'proc-trunk';
        trunk.style.height = `${40 + rng() * 40}px`;
        trunk.style.background = biome.trunk;
        tree.appendChild(trunk);

        const leaves = document.createElement('div');
        leaves.className = 'proc-leaves';
        
        const numLeaves = 3 + Math.floor(rng() * 3);
        for(let l=0; l<numLeaves; l++) {
            const leaf = document.createElement('div');
            leaf.className = 'proc-leaf';
            leaf.style.width = `${50 + rng()*40}px`;
            leaf.style.height = `${50 + rng()*40}px`;
            leaf.style.background = biome.leaves[Math.floor(rng() * biome.leaves.length)];
            leaf.style.bottom = `${rng() * 30}px`;
            leaf.style.left = `${-40 + rng() * 60}px`;
            leaves.appendChild(leaf);
        }
        tree.appendChild(leaves);
        ground.appendChild(tree);
    }

    // Generate random wildlife based on score
    const numAnimals = Math.floor(saved / 15);
    const animalTypes = ['🦅', '🦋', '🦌', '🐸', '🐇', '🐿️'];
    for (let i = 0; i < numAnimals; i++) {
        const rng = mulberry32(seed + i * 7777);
        const animal = document.createElement('div');
        animal.className = 'proc-animal proc-element';
        animal.textContent = animalTypes[Math.floor(rng() * animalTypes.length)];
        
        const x = rng() * (maxRight - 50);
        animal.style.left = `${x}px`;

        if (['🦅', '🦋'].includes(animal.textContent)) {
            sky.appendChild(animal);
            animal.style.top = `${20 + rng() * 100}px`;
        } else {
            ground.appendChild(animal);
            animal.style.bottom = `${rng() * 40}px`;
            animal.style.zIndex = 150;
        }
    }

    // Update infinite scroll container width
    scrollArea.style.width = `${maxRight}px`;
    
    let rankMsg = "";
    if (saved < 15) rankMsg = "A seedling takes root.";
    else if (saved < 40) rankMsg = "Life is flourishing.";
    else if (saved < 100) rankMsg = "A river flows, nourishing the land.";
    else rankMsg = "A thriving ecosystem stretches endlessly!";

    msg.textContent = `🌍 ${currentUser}'s ${biome.name} Ecosystem — ${rankMsg}`;
}

// ── User Auth Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    const userBtn = document.getElementById('btn-user-profile');
    if (userBtn) {
        userBtn.textContent = currentUser !== 'Guest' ? currentUser : 'Sign In';
        userBtn.addEventListener('click', () => {
            const name = prompt("Enter a Username to generate your unique ecosystem seed:", currentUser !== 'Guest' ? currentUser : '');
            if (name) {
                currentUser = name.trim();
                localStorage.setItem('treeRoute_user', currentUser);
                userBtn.textContent = currentUser;
                updateEcosystem(getTotals().saved); // Re-render the ecosystem immediately
            }
        });
    }
    
    // Initialize empty desert state
    updateEcosystem(getTotals().saved);
});


// ── Journey Log ──
function updateJourneyLog() {
    const log   = document.getElementById('journeyLog');
    const items = document.getElementById('journeyItems');
    if (journeys.length === 0) { log.classList.remove('visible'); return; }
    log.classList.add('visible');
    items.innerHTML = '';
    [...journeys].reverse().slice(0, 5).forEach(j => {
        const div = document.createElement('div');
        div.className = 'journey-item';
        div.innerHTML = `
            <div>
                <div class="journey-item-route">${j.from} → ${j.to}</div>
                <div class="journey-item-meta">${MODES[j.mode].label} · ${j.distanceKm.toFixed(1)} km</div>
            </div>
            <div class="journey-item-saved">+${j.co2Saved.toFixed(2)} kg</div>`;
        items.appendChild(div);
    });
}