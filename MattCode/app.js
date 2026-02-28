// ── Data & Constants ──
const MODES = {
    car:     { label: 'Car',           speedKmh: 50, calPerKm: 0,  co2PerKm: 0.192, googleMode: 'DRIVING' },
    walk:    { label: 'Walking',       speedKmh: 5,  calPerKm: 50, co2PerKm: 0,     googleMode: 'WALKING' },
    bike:    { label: 'Bicycle',       speedKmh: 15, calPerKm: 25, co2PerKm: 0,     googleMode: 'BICYCLING' },
    transit: { label: 'Public Transit',speedKmh: 30, calPerKm: 2,  co2PerKm: 0.04,  googleMode: 'TRANSIT' },
    ecar:    { label: 'Electric Car',  speedKmh: 50, calPerKm: 0,  co2PerKm: 0.05,  googleMode: 'DRIVING' }
};
const CAR_CO2 = 0.192;
const MILESTONES = [15, 30, 60, 100, 200];

let journeys = [];
let coordsA = null, coordsB = null;

// Google Maps Variables
let map = null;
let directionsService = null;
let directionsRenderer = null;

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

// ── Google Maps Initialization ──
function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    
    const mapOptions = {
        zoom: 12,
        center: { lat: 51.5074, lng: -0.1278 }, // Default to London
        disableDefaultUI: true,
        zoomControl: true
    };
    
    const mapElement = document.getElementById('map');
    map = new google.maps.Map(mapElement, mapOptions);
    directionsRenderer.setMap(map);

    // Swap Nominatim for Google Places Autocomplete for better UX
    initAutocomplete('originInput', true);
    initAutocomplete('destInput', false);
}

// ── Places Autocomplete ──
function initAutocomplete(inputId, isOrigin) {
    const input = document.getElementById(inputId);
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo('bounds', map);
    
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            showToast("No details available for input: '" + place.name + "'");
            return;
        }

        const coords = {
            lat: place.geometry.location.lat(),
            lon: place.geometry.location.lng(),
            label: place.name || place.formatted_address.split(',')[0],
            placeId: place.place_id
        };

        if (isOrigin) coordsA = coords;
        else          coordsB = coords;
    });
}

// ── Fallback Haversine Distance (If Map Fails) ──
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

// ── Add Journey & Plot Map ──
document.getElementById('addJourneyBtn').addEventListener('click', () => {
    const originVal = document.getElementById('originInput').value.trim();
    const destVal   = document.getElementById('destInput').value.trim();
    const mode      = document.getElementById('transportMode').value;

    if (!originVal || !destVal) { showToast('Please enter both a starting point and a destination.'); return; }
    if (!coordsA || !coordsB)   { showToast('Please select locations from the suggestions list.'); return; }

    const modeData = MODES[mode];

    // Show the map container
    document.getElementById('map').style.display = 'block';

    // Route on Google Maps
    if (directionsService && directionsRenderer) {
        const request = {
            origin: { placeId: coordsA.placeId } || { lat: coordsA.lat, lng: coordsA.lon },
            destination: { placeId: coordsB.placeId } || { lat: coordsB.lat, lng: coordsB.lon },
            travelMode: google.maps.TravelMode[modeData.googleMode]
        };

        directionsService.route(request, (result, status) => {
            if (status == 'OK') {
                directionsRenderer.setDirections(result);
                // Get exact route distance from Google
                const exactDistKm = result.routes[0].legs[0].distance.value / 1000;
                saveAndCalculate(exactDistKm, mode, modeData);
            } else {
                // Fallback to Haversine if routing fails (e.g. no roads)
                showToast("Could not calculate exact route. Using straight line distance.");
                const distKm = haversine(coordsA, coordsB);
                saveAndCalculate(distKm, mode, modeData);
            }
        });
    } else {
        // Fallback if API hasn't loaded
        const distKm = haversine(coordsA, coordsB);
        saveAndCalculate(distKm, mode, modeData);
    }
});

function saveAndCalculate(distKm, mode, modeData) {
    const co2Emitted = distKm * modeData.co2PerKm;
    const co2Saved   = Math.max(0, distKm * CAR_CO2 - co2Emitted);

    journeys.push({ from: coordsA.label, to: coordsB.label, mode, distanceKm: distKm, co2Emitted, co2Saved });

    document.getElementById('originInput').value = '';
    document.getElementById('destInput').value   = '';
    coordsA = null; coordsB = null;

    updateUI();
}

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
        div.className = 'log-item'; // Updated to use the new CSS styling class
        div.innerHTML = `
            <div class="log-details">
                <span class="log-route">${j.from} → ${j.to}</span>
                <span class="log-meta">${MODES[j.mode].label} · ${j.distanceKm.toFixed(1)} km</span>
            </div>
            <span class="log-saved">+${j.co2Saved.toFixed(2)} kg</span>`;
        items.appendChild(div);
    });
}