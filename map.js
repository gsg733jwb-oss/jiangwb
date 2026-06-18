/** Interactive map: trip POIs + user geolocation (Leaflet + OSM) */
const MAP_TYPE_COLORS = {
  机场: '#6366f1', 酒店: '#a855f7', 景点: '#22c55e', 餐饮: '#f97316',
  乐园: '#06b6d4', 购物: '#eab308',
};

let mapInstance = null;
let userMarker = null;
let userCircle = null;
let poiLayer = null;
let placesData = [];
let watchId = null;

function assetUrl(path) {
  const base = document.querySelector('base')?.href || '';
  return new URL(path, base || window.location.href).href;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const p = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lon2 - lon1) * p / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function poiIcon(type, isToday) {
  const color = MAP_TYPE_COLORS[type] || '#3b82f6';
  const ring = isToday ? '#22c55e' : color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path fill="${color}" stroke="${ring}" stroke-width="2" d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"/>
    <circle cx="14" cy="14" r="6" fill="#fff"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'poi-pin',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });
}

function userIcon() {
  return L.divIcon({
    className: 'user-pin',
    html: '<div class="user-dot"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function filterDay() {
  const sel = document.getElementById('map-day-filter');
  return sel ? sel.value : 'all';
}

function placeMatchesDay(place, dayFilter) {
  if (dayFilter === 'all') return true;
  return String(place.day).includes(dayFilter);
}

function renderPois() {
  if (!mapInstance || !poiLayer) return;
  poiLayer.clearLayers();
  const dayFilter = filterDay();
  const today = typeof klDateYmd === 'function' ? klDateYmd() : '';
  const todayShort = today ? `${+today.slice(5, 7)}/${+today.slice(8, 10)}` : '';

  placesData.forEach((p) => {
    if (!placeMatchesDay(p, dayFilter)) return;
    const isToday = todayShort && String(p.day).includes(todayShort);
    const m = L.marker([p.lat, p.lng], { icon: poiIcon(p.type, isToday) });
    m.bindPopup(`
      <strong>${p.name}</strong><br>
      <span style="color:#666">${p.type} · ${p.day}</span><br>
      ${p.time ? `时段：${p.time}<br>` : ''}
      <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">导航到此</a>
    `);
    poiLayer.addLayer(m);
  });
}

function updateUserPosition(lat, lng, accuracy) {
  if (!mapInstance) return;
  const status = document.getElementById('geo-status');
  if (status) {
    status.textContent = `已定位 · 精度约 ${Math.round(accuracy)}m`;
    status.className = 'geo-status ok';
  }

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: userIcon(), zIndexOffset: 1000 }).addTo(mapInstance);
    userMarker.bindPopup('<strong>我的位置</strong>');
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  if (userCircle) userCircle.setLatLng([lat, lng]).setRadius(accuracy);
  else userCircle = L.circle([lat, lng], { radius: accuracy, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1 }).addTo(mapInstance);

  updateNearest(lat, lng);
}

function updateNearest(lat, lng) {
  const el = document.getElementById('nearest-poi');
  if (!el || !placesData.length) return;
  let best = null;
  let bestD = Infinity;
  placesData.forEach((p) => {
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d < bestD) { bestD = d; best = p; }
  });
  if (best) {
    el.innerHTML = `距最近行程点 <strong>${best.name}</strong> 约 <strong>${bestD < 1 ? Math.round(bestD * 1000) + 'm' : bestD.toFixed(1) + 'km'}</strong>`;
  }
}

function startGeolocation() {
  const status = document.getElementById('geo-status');
  if (!navigator.geolocation) {
    if (status) { status.textContent = '浏览器不支持定位'; status.className = 'geo-status err'; }
    return;
  }
  if (status) { status.textContent = '正在获取位置…'; status.className = 'geo-status'; }

  const opts = { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 };
  const onPos = (pos) => updateUserPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
  const onErr = (err) => {
    if (status) {
      status.textContent = err.code === 1 ? '请允许定位权限（HTTPS 页面）' : '定位失败，请重试';
      status.className = 'geo-status err';
    }
  };

  navigator.geolocation.getCurrentPosition(onPos, onErr, opts);
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, () => {}, opts);
}

function fitAllBounds() {
  if (!mapInstance) return;
  const bounds = L.latLngBounds([[3.05, 101.58], [3.18, 101.72]]);
  if (userMarker) bounds.extend(userMarker.getLatLng());
  poiLayer.eachLayer((l) => { if (l.getLatLng) bounds.extend(l.getLatLng()); });
  mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

async function ensureMapInit() {
  if (mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 100);
    return;
  }

  try {
    const res = await fetch(assetUrl('data/places.json'));
    placesData = await res.json();
  } catch {
    document.getElementById('geo-status').textContent = '无法加载地点数据';
    return;
  }

  mapInstance = L.map('trip-map', { zoomControl: true }).setView([3.14, 101.70], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance);

  poiLayer = L.layerGroup().addTo(mapInstance);
  renderPois();

  document.getElementById('map-day-filter')?.addEventListener('change', renderPois);
  document.getElementById('btn-locate')?.addEventListener('click', () => {
    startGeolocation();
    if (userMarker) mapInstance.setView(userMarker.getLatLng(), 16, { animate: true });
  });
  document.getElementById('btn-fit')?.addEventListener('click', fitAllBounds);

  startGeolocation();
  setTimeout(() => mapInstance.invalidateSize(), 200);
}
