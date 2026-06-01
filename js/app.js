// ── TERRITOIRE — app.js ──
// GPS tracking + Leaflet map + LocalStorage journal

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let map, userMarker, trackPolyline;
let isTracking = false;
let watchId = null;
let currentPath = [];
let sessionDistance = 0;
let lastPos = null;

// Persistent data
let data = loadData();

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderJournal();
  renderStats();
  updateHeader();
});

function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
  });

  // Tile layer — OpenStreetMap
 L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap'
}).addTo(map);

  L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Default view: Paris
  map.setView([48.8566, 2.3522], 15);

  // Try to center on user position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      placeUserMarker(pos.coords.latitude, pos.coords.longitude);
    }, () => {});
  }

  // Redraw existing explored streets on map
  redrawAllStreets();
  updateProgress();
}

// ─────────────────────────────────────────
// TRACKING
// ─────────────────────────────────────────
function toggleTracking() {
  if (isTracking) {
    stopTracking();
  } else {
    startTracking();
  }
}

function startTracking() {
  if (!navigator.geolocation) {
    showToast('GPS non disponible sur ce navigateur');
    return;
  }

  isTracking = true;
  currentPath = [];
  sessionDistance = 0;
  lastPos = null;

  document.getElementById('fab').textContent = '⏹';
  document.getElementById('fab').classList.add('recording');
  document.getElementById('map-info').classList.add('visible');

  // Start new polyline for current session
  trackPolyline = L.polyline([], {
    color: '#2ECC8A',
    weight: 5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  watchId = navigator.geolocation.watchPosition(
    onPosition,
    onGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    }
  );

  showToast('Exploration démarrée !');
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  isTracking = false;
  document.getElementById('fab').textContent = '▶';
  document.getElementById('fab').classList.remove('recording');
  document.getElementById('map-info').classList.remove('visible');

  if (currentPath.length > 1) {
    saveSession();
    showToast('Session sauvegardée ! ' + data.streets.length + ' rues explorées');
  } else {
    showToast('Session trop courte');
    if (trackPolyline) { map.removeLayer(trackPolyline); trackPolyline = null; }
  }

  renderJournal();
  renderStats();
  updateHeader();
  updateProgress();
}

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;

  placeUserMarker(lat, lng);

  // Only add point if moved enough (avoid GPS noise)
  if (lastPos) {
    const dist = haversine(lastPos.lat, lastPos.lng, lat, lng);
    if (dist < 3) return; // ignore if < 3 meters
    sessionDistance += dist;
  }

  lastPos = { lat, lng };
  currentPath.push([lat, lng]);

  if (trackPolyline) {
    trackPolyline.addLatLng([lat, lng]);
    map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }

  document.getElementById('map-info-text').textContent =
    'Exploration en cours · ' + formatDistance(sessionDistance);
}

function onGpsError(err) {
  showToast('GPS indisponible, essaie en extérieur');
}

// ─────────────────────────────────────────
// SAVE SESSION
// ─────────────────────────────────────────
function saveSession() {
  if (currentPath.length < 2) return;

  const session = {
    id: Date.now(),
    path: currentPath,
    distance: sessionDistance,
    date: new Date().toISOString(),
    streetName: guessStreetName(currentPath),
  };

  data.sessions.push(session);
  data.totalDistance += sessionDistance;

  // Add to explored streets (deduplicated by proximity)
  addExploredSegments(currentPath);

  // Track active days
  const today = new Date().toDateString();
  if (!data.activeDays.includes(today)) {
    data.activeDays.push(today);
  }

  saveData(data);

  // Style the saved polyline as explored
  if (trackPolyline) {
    trackPolyline.setStyle({ color: '#1BA870', weight: 4, opacity: 0.8 });
  }
}

function addExploredSegments(path) {
  // Group path into ~50m segments and store as "streets"
  const SEGMENT_SIZE = 5; // points per segment
  for (let i = 0; i < path.length; i += SEGMENT_SIZE) {
    const segment = path.slice(i, Math.min(i + SEGMENT_SIZE + 1, path.length));
    if (segment.length < 2) continue;

    // Check if we've explored this area before
    const center = segment[Math.floor(segment.length / 2)];
    const alreadyExplored = data.streets.some(s => {
      const sc = s.center;
      return haversine(sc[0], sc[1], center[0], center[1]) < 40;
    });

    if (!alreadyExplored) {
      data.streets.push({
        id: Date.now() + i,
        path: segment,
        center: center,
        date: new Date().toISOString(),
        name: guessStreetName(segment),
        visits: 1,
      });
    } else {
      // Increment visit count
      const existing = data.streets.find(s => {
        const sc = s.center;
        return haversine(sc[0], sc[1], center[0], center[1]) < 40;
      });
      if (existing) existing.visits = (existing.visits || 1) + 1;
    }
  }
}

// ─────────────────────────────────────────
// MAP RENDERING
// ─────────────────────────────────────────
function redrawAllStreets() {
  data.streets.forEach(s => {
    if (s.path && s.path.length >= 2) {
      const visits = s.visits || 1;
      const opacity = Math.min(0.5 + visits * 0.15, 1);
      const weight = visits > 3 ? 6 : 4;

      L.polyline(s.path, {
        color: '#2ECC8A',
        weight,
        opacity,
        lineCap: 'round',
      }).addTo(map);
    }
  });
}

function placeUserMarker(lat, lng) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:#0A5C36;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
  }
}

function updateProgress() {
  const count = data.streets.length;
  const pct = Math.min(count / 500 * 100, 100);
  document.getElementById('mp-fill').style.width = pct + '%';
  document.getElementById('mp-pct').textContent = count + ' segment' + (count > 1 ? 's' : '') + ' explorés';
}

// ─────────────────────────────────────────
// JOURNAL
// ─────────────────────────────────────────
function renderJournal() {
  const container = document.getElementById('journal');
  const empty = document.getElementById('journal-empty');

  if (data.streets.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  // Sort streets by date desc
  const sorted = [...data.streets].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Keep only existing cards and prepend new ones
  const existingIds = new Set([...container.querySelectorAll('.street-card')].map(el => el.dataset.id));
  const newStreets = sorted.filter(s => !existingIds.has(String(s.id)));

  newStreets.forEach(s => {
    const card = buildStreetCard(s);
    container.insertBefore(card, container.firstChild === empty ? null : container.firstChild);
  });
}

function buildStreetCard(s) {
  const card = document.createElement('div');
  card.className = 'street-card';
  card.dataset.id = s.id;

  const visits = s.visits || 1;
  let badge = '';
  if (visits === 1) badge = '<span class="street-badge badge-first">1ère fois ★</span>';
  else if (visits <= 3) badge = '<span class="street-badge badge-recent">Récente</span>';
  else badge = `<span class="street-badge badge-familiar">${visits}× passé</span>`;

  card.innerHTML = `
    <div class="street-color"></div>
    <div class="street-info">
      <div class="street-name">${s.name}</div>
      <div class="street-meta">${formatDate(s.date)} · ${formatDistance(segmentLength(s.path))}</div>
    </div>
    ${badge}
  `;
  return card;
}

// ─────────────────────────────────────────
// STATS
// ─────────────────────────────────────────
function renderStats() {
  const streets = data.streets.length;
  const km = (data.totalDistance / 1000).toFixed(1);
  const days = data.activeDays.length;
  const streak = calcStreak();
  const longest = longestStreet();

  document.getElementById('stat-streets-big').textContent = streets;
  document.getElementById('s-km').textContent = km;
  document.getElementById('s-days').textContent = days;
  document.getElementById('s-streak').textContent = streak;
  document.getElementById('s-longest').textContent = longest;

  // Achievements
  if (streets >= 1) document.getElementById('ach-first').classList.remove('locked');
  if (streets >= 10) document.getElementById('ach-10').classList.remove('locked');
  if (streets >= 50) document.getElementById('ach-50').classList.remove('locked');
  if (streets >= 100) document.getElementById('ach-100').classList.remove('locked');
}

function updateHeader() {
  document.getElementById('h-streets').textContent = data.streets.length;
  document.getElementById('h-km').textContent = (data.totalDistance / 1000).toFixed(1);
  document.getElementById('h-days').textContent = data.activeDays.length;
}

// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────
function switchTab(viewId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  btn.classList.add('active');

  if (viewId === 'map') {
    setTimeout(() => map && map.invalidateSize(), 50);
  }
}

// ─────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem('territoire_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { streets: [], sessions: [], totalDistance: 0, activeDays: [] };
}

function saveData(d) {
  try {
    localStorage.setItem('territoire_v1', JSON.stringify(d));
  } catch (e) {
    showToast('Stockage plein, ancienne data supprimée');
    d.sessions = d.sessions.slice(-10);
    localStorage.setItem('territoire_v1', JSON.stringify(d));
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function segmentLength(path) {
  if (!path || path.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversine(path[i-1][0], path[i-1][1], path[i][0], path[i][1]);
  return d;
}

function formatDistance(meters) {
  if (meters < 1000) return Math.round(meters) + ' m';
  return (meters / 1000).toFixed(1) + ' km';
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `Il y a ${diff} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function guessStreetName(path) {
  if (!path || path.length === 0) return 'Segment exploré';
  // Use coordinates as a rough name until reverse geocoding is added
  const [lat, lng] = path[Math.floor(path.length / 2)];
  return `Zone ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

function calcStreak() {
  if (data.activeDays.length === 0) return 0;
  const sorted = [...data.activeDays].map(d => new Date(d)).sort((a, b) => b - a);
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i-1] - sorted[i]) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function longestStreet() {
  if (data.streets.length === 0) return '–';
  const longest = data.streets.reduce((max, s) => {
    const len = segmentLength(s.path);
    return len > segmentLength(max.path) ? s : max;
  }, data.streets[0]);
  return formatDistance(segmentLength(longest.path));
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
