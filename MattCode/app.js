// ── Data & Constants ──
const MODES = {
    car:     { label: 'Car',            apiMode: 'car' },
    walk:    { label: 'Walking',        apiMode: null },
    bike:    { label: 'Bicycle',        apiMode: null },
    bus:     { label: 'Bus',            apiMode: 'bus' },
    train:   { label: 'Train',          apiMode: 'train' },
    flight:  { label: 'Flight',         apiMode: 'flight' }
};
const CAR_CO2 = 0.192;
const MILESTONES = [15, 30, 60, 100, 200];

let journeys = [];
let coordsA = null, coordsB = null;

// ── Emissions API ──
// Calls go via the local proxy (proxy.py) to avoid browser CORS restrictions.
const EMISSIONS_PROXY = 'http://localhost:3001';

async function getTravelEmissions({ originCountry, originLocation, destinationCountry, destinationLocation, transportMode, cabinClass, passengers }) {
    const params = new URLSearchParams({
        origin_country:       originCountry,
        origin_location:      originLocation,
        destination_country:  destinationCountry,
        destination_location: destinationLocation,
        transport_mode:       transportMode,
        cabin_class:          cabinClass,
        passengers:           passengers
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const res = await fetch(`${EMISSIONS_PROXY}/v1/travel/emissions?${params}`, {
            signal: controller.signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Emissions API error ${res.status}: ${JSON.stringify(data)}`);
        return data;
    } finally {
        clearTimeout(timeout);
    }
}



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
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`);
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
                        const addr = item.address || {};
                        const countryCode = addr.country_code ? addr.country_code.toUpperCase() : 'GB';
                        // Extract the cleanest single city/town name the API can resolve
                        const apiLocation = addr.city || addr.town || addr.village ||
                                            addr.municipality || addr.county ||
                                            item.display_name.split(',')[0].trim();
                        const coords = {
                            lat: parseFloat(item.lat),
                            lon: parseFloat(item.lon),
                            label: short,
                            countryCode,
                            apiLocation
                        };
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

// ── Geocode first result helper ──
async function geocodeFirst(query) {
    const results = await geocode(query);
    if (!results || results.length === 0) return null;
    const item = results[0];
    const addr = item.address || {};
    const countryCode = addr.country_code ? addr.country_code.toUpperCase() : 'GB';
    const apiLocation = addr.city || addr.town || addr.village ||
                        addr.municipality || addr.county ||
                        item.display_name.split(',')[0].trim();
    return {
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        label: item.display_name.split(',').slice(0, 2).join(','),
        countryCode,
        apiLocation
    };
}

// ── Add Journey ──
document.getElementById('addJourneyBtn').addEventListener('click', async () => {
    const originVal = document.getElementById('originInput').value.trim();
    const destVal   = document.getElementById('destInput').value.trim();
    const mode      = document.getElementById('transportMode').value;

    if (!originVal || !destVal) { showToast('Please enter both a starting point and a destination.'); return; }

    const modeData = MODES[mode];
    const btn = document.getElementById('addJourneyBtn');
    btn.disabled = true;
    btn.textContent = 'Calculating…';

    try {
        // If the user typed without selecting from the dropdown, geocode now
        if (!coordsA) coordsA = await geocodeFirst(originVal);
        if (!coordsB) coordsB = await geocodeFirst(destVal);
    } catch (e) { /* ignore, will fail below */ }

    if (!coordsA || !coordsB) {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Journey';
        showToast('Could not find one or both locations. Please try again.');
        return;
    }

    try {
        let co2Emitted = 0;
        let distKm = haversine(coordsA, coordsB);
        let carCo2 = distKm * CAR_CO2; // haversine fallback

        const apiParams = {
            originCountry:       coordsA.countryCode,
            originLocation:      coordsA.apiLocation,
            destinationCountry:  coordsB.countryCode,
            destinationLocation: coordsB.apiLocation,
            cabinClass:          'economy',
            passengers:          1
        };

        if (modeData.apiMode && modeData.apiMode !== 'car') {
            // Fetch journey + car baseline in parallel
            const [journeyData, carData] = await Promise.allSettled([
                getTravelEmissions({ ...apiParams, transportMode: modeData.apiMode }),
                getTravelEmissions({ ...apiParams, transportMode: 'car' })
            ]);

            if (journeyData.status === 'fulfilled') {
                co2Emitted = journeyData.value.data.attributes.emissions.co2e;
                distKm     = journeyData.value.data.attributes.route.total_distance_km;
            } else {
                throw new Error(journeyData.reason);
            }

            if (carData.status === 'fulfilled') {
                carCo2 = carData.value.data.attributes.emissions.co2e;
            } else {
                console.warn('Car baseline failed, using haversine estimate');
                carCo2 = distKm * CAR_CO2;
            }

        } else if (modeData.apiMode === 'car') {
            const data = await getTravelEmissions({ ...apiParams, transportMode: 'car' });
            co2Emitted = data.data.attributes.emissions.co2e;
            distKm     = data.data.attributes.route.total_distance_km;
            carCo2     = co2Emitted; // same mode, no savings
        }
        // walk / bike: co2Emitted stays 0, carCo2 stays haversine estimate

        const co2Saved = Math.max(0, carCo2 - co2Emitted);

        journeys.push({
            from: coordsA.label, to: coordsB.label,
            mode, distanceKm: distKm,
            co2Emitted, co2Saved
        });

        document.getElementById('originInput').value = '';
        document.getElementById('destInput').value   = '';
        coordsA = null; coordsB = null;

        updateUI();
        showToast('Journey added!');

    } catch (err) {
        console.error('Add journey error:', err);
        showToast('Could not fetch emissions — is the proxy running? (python3 proxy.py)');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Journey`;
    }
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

// ── Ecosystem Evolution ──
function updateEcosystem(saved) {
    const sky = document.getElementById('ecoSky');
    const ground = document.getElementById('ecoGround');
    const sun = document.getElementById('ecoSun');
    const river = document.getElementById('ecoRiver');
    const msg = document.getElementById('treeMessage');
    
    // Animals
    const birds = document.querySelectorAll('.bird');
    const deer = document.querySelector('.deer');
    const butterfly = document.querySelector('.butterfly');
    const frog = document.querySelector('.frog');

    // Tree parts
    const trunk = document.getElementById('trunk');
    const leavesW = document.getElementById('leavesWrap');

    let message = "";
    let leafHTML = "";
    let trunkH = 0, bottomOffset = 0;

    if (saved === 0) {
        // Level 0: Desert
        sky.style.background = '#e2e8f0'; // Grey smog
        ground.style.background = '#d6cfc4'; // Desert sand
        sun.style.opacity = '0'; sun.style.transform = 'translateY(20px)';
        river.style.opacity = '0'; river.style.transform = 'scaleY(0)';
        
        birds.forEach(b => { b.style.opacity = '0'; b.style.transform = 'translateX(-20px)'; });
        deer.style.opacity = '0'; deer.style.transform = 'translateX(20px)';
        butterfly.style.opacity = '0'; butterfly.style.transform = 'translateY(10px)';
        frog.style.opacity = '0'; frog.style.transform = 'translateY(10px)';

        trunkH = 0; bottomOffset = 0;
        message = "A barren desert. Save CO₂ to bring it to life!";

    } else if (saved <= 15) {
        // Level 1: Seedling & Sun
        const p = Math.min(1, saved / 15);
        sky.style.background = `rgba(186, 230, 253, ${p})`; // Fades to blue
        sun.style.opacity = p.toString();
        sun.style.transform = `translateY(${20 - (p * 20)}px)`;

        trunkH = 10 + (p * 20);
        bottomOffset = trunkH;
        leafHTML = `<div class="leaf-circle" style="width:${10 + p*10}px;height:${10 + p*10}px;background:#4ade80;"></div>`;
        message = "🌱 The smog lifts! A seedling appears.";

    } else if (saved <= 40) {
        // Level 2: Grass & Small Animals
        const p = (saved - 15) / 25;
        sky.style.background = '#bae6fd'; 
        sun.style.opacity = '1'; sun.style.transform = 'translateY(0)';
        
        // Ground turns green
        const r = 214 - (p * (214 - 134)); // d6 -> 86
        const g = 207 + (p * (239 - 207)); // cf -> ef
        const b = 196 - (p * (196 - 172)); // c4 -> ac
        ground.style.background = `rgb(${r}, ${g}, ${b})`; 

        birds.forEach(b => { b.style.opacity = p.toString(); b.style.transform = `translateX(${p * 20}px)`; });
        butterfly.style.opacity = p.toString(); butterfly.style.transform = `translateY(-${p * 10}px)`;

        trunkH = 30 + (p * 40);
        bottomOffset = trunkH - 5;
        leafHTML = `
            <div class="leaf-circle" style="width:${30 + p*20}px;height:${20 + p*15}px;background:#22c55e;margin-bottom:-5px;"></div>
            <div class="leaf-circle" style="width:${40 + p*30}px;height:${40 + p*30}px;background:#16a34a;"></div>`;
        message = "🌿 Grass grows and insects return!";

    } else if (saved <= 100) {
        // Level 3: River & Frogs
        const p = (saved - 40) / 60;
        ground.style.background = '#86efac';
        
        river.style.opacity = p.toString();
        river.style.transform = `scaleY(${p})`;
        frog.style.opacity = p.toString();
        frog.style.transform = `translateY(-${p * 5}px)`;

        birds.forEach(b => { b.style.opacity = '1'; b.style.transform = 'translateX(20px)'; });
        butterfly.style.opacity = '1'; butterfly.style.transform = 'translateY(-10px)';

        trunkH = 70 + (p * 40);
        bottomOffset = trunkH - 10;
        leafHTML = `
            <div class="leaf-circle" style="width:50px;height:50px;background:#4ade80;margin-bottom:-10px;"></div>
            <div class="leaf-circle" style="width:80px;height:60px;background:#22c55e;margin-bottom:-10px;"></div>
            <div class="leaf-circle" style="width:${80 + p*30}px;height:${80 + p*30}px;background:#16a34a;"></div>`;
        message = "💧 A river flows, bringing life!";

    } else {
        // Level 4: Full Forest & Deer
        const p = Math.min(1, (saved - 100) / 100);
        ground.style.background = '#86efac';
        river.style.opacity = '1'; river.style.transform = 'scaleY(1)';
        frog.style.opacity = '1';
        
        deer.style.opacity = p.toString();
        deer.style.transform = `translateX(-${p * 15}px)`;

        trunkH = 110 + (p * 30);
        bottomOffset = trunkH - 15;
        leafHTML = `
            <div class="leaf-circle" style="width:70px;height:70px;background:#4ade80;margin-bottom:-15px;"></div>
            <div class="leaf-circle" style="width:110px;height:80px;background:#22c55e;margin-bottom:-15px;"></div>
            <div class="leaf-circle" style="width:${110 + p*40}px;height:${110 + p*30}px;background:#15803d;"></div>`;
        message = "🌳 A thriving ecosystem! Nature thanks you!";
    }

    trunk.style.height   = trunkH + 'px';
    leavesW.style.bottom = bottomOffset + 'px';
    leavesW.innerHTML    = leafHTML;
    msg.textContent      = message;
}

// Initialize empty desert state
updateEcosystem(0);

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