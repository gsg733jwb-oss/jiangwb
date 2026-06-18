/** Route map: current schedule stop → next stop (no GPS) */
const MAP_TYPE_COLORS = {
  交通: '#6366f1', 酒店: '#a855f7', 景点: '#22c55e', 餐饮: '#f97316',
  乐园: '#06b6d4', 购物: '#eab308', 休闲: '#94a3b8', 步行: '#94a3b8',
};

let mapInstance = null;
let placesData = [];
let routeLayer = null;
let markersLayer = null;

function assetUrl(path) {
  return new URL(path, window.location.href).href;
}

function resolvePlace(item) {
  if (!item || !placesData.length) return null;
  const act = String(item['活动/站点'] || item['活动/分区'] || '');
  const loc = String(item['地点/地址'] || item['地点'] || '');
  const text = `${act} ${loc}`.toLowerCase();
  if (act.includes('━━') || act.trim().startsWith('→')) return null;

  let best = null;
  let bestScore = 0;
  for (const p of placesData) {
    for (const kw of p.keywords || []) {
      if (text.includes(kw.toLowerCase())) {
        const score = kw.length;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
  }
  return best;
}

function findLeg(items, fromIdx) {
  let from = null;
  let fromI = fromIdx;
  for (let i = fromIdx; i >= 0; i--) {
    const p = resolvePlace(items[i]);
    if (p) { from = p; fromI = i; break; }
  }
  if (!from) return null;

  let to = null;
  let toI = -1;
  for (let i = fromI + 1; i < items.length; i++) {
    const p = resolvePlace(items[i]);
    if (p && p.id !== from.id) { to = p; toI = i; break; }
  }
  return to ? { from, to, fromI, toI } : null;
}

function pinIcon(color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path fill="${color}" stroke="#fff" stroke-width="2" d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24s16-12 16-24C32 7.2 24.8 0 16 0z"/>
    <text x="16" y="20" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">${label}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'route-pin',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -38],
  });
}

function routeProfile(item) {
  const t = String(item?.['交通'] || item?.['类型'] || '');
  if (/步行|walk/i.test(t)) return 'foot';
  return 'driving';
}

async function fetchOsrmRoute(from, to, profile) {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    const r = data.routes[0];
    return {
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: r.distance,
      duration: r.duration,
    };
  } catch {
    return null;
  }
}

function straightRoute(from, to) {
  return { coords: [[from.lat, from.lng], [to.lat, to.lng]], distance: 0, duration: 0 };
}

function formatDist(m) {
  if (!m) return '';
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function formatDur(s) {
  if (!s) return '';
  const m = Math.round(s / 60);
  return m < 60 ? `约${m}分钟` : `约${Math.floor(m / 60)}小时${m % 60}分`;
}

function setRouteStatus(html) {
  const el = document.getElementById('route-status');
  if (el) el.innerHTML = html;
}

async function drawLeg(items, fromIdx) {
  if (!mapInstance) return;
  routeLayer.clearLayers();
  markersLayer.clearLayers();

  const leg = findLeg(items, fromIdx);
  if (!leg) {
    setRouteStatus('<span class="muted">当日行程已结束，或暂无下一段路线</span>');
    highlightTimelineLeg(-1, -1);
    return;
  }

  highlightTimelineLeg(leg.fromI, leg.toI);

  const fromItem = items[leg.fromI];
  const profile = routeProfile(fromItem);
  setRouteStatus('⏳ 正在规划路线…');

  let route = await fetchOsrmRoute(leg.from, leg.to, profile);
  if (!route) route = straightRoute(leg.from, leg.to);

  const line = L.polyline(route.coords, {
    color: '#3b82f6',
    weight: 5,
    opacity: 0.85,
    dashArray: profile === 'foot' ? '8 6' : null,
  }).addTo(routeLayer);

  L.marker([leg.from.lat, leg.from.lng], { icon: pinIcon('#22c55e', '现') })
    .bindPopup(`<strong>当前</strong><br>${leg.from.name}`)
    .addTo(markersLayer);

  L.marker([leg.to.lat, leg.to.lng], { icon: pinIcon('#f59e0b', '下') })
    .bindPopup(`<strong>下一站</strong><br>${leg.to.name}<br>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${leg.to.lat},${leg.to.lng}" target="_blank" rel="noopener">Google 导航</a>`)
    .addTo(markersLayer);

  const dist = formatDist(route.distance);
  const dur = formatDur(route.duration);
  const mode = profile === 'foot' ? '步行' : '驾车';
  setRouteStatus(
    `<strong>${leg.from.name}</strong> → <strong>${leg.to.name}</strong>
     <span class="route-meta">${mode}${dist ? ` · ${dist}` : ''}${dur ? ` · ${dur}` : ''}</span>`
  );

  mapInstance.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 15 });
}

async function initFlowMap() {
  if (mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 120);
    return;
  }

  const container = document.getElementById('trip-map');
  if (!container || container.offsetHeight < 10) {
    await new Promise((r) => requestAnimationFrame(r));
  }

  try {
    const res = await fetch(assetUrl('data/places.json'));
    placesData = await res.json();
  } catch {
    setRouteStatus('<span class="err">无法加载地点数据</span>');
    return;
  }

  mapInstance = L.map('trip-map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([3.14, 101.70], 12);

  // OpenStreetMap 在国内常无法访问，优先用 Esri 瓦片
  const esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
  );
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
    subdomains: 'abc',
  });

  esri.addTo(mapInstance);
  let osmTried = false;
  esri.on('tileerror', () => {
    if (!osmTried) {
      osmTried = true;
      mapInstance.removeLayer(esri);
      osm.addTo(mapInstance);
    }
  });

  routeLayer = L.layerGroup().addTo(mapInstance);
  markersLayer = L.layerGroup().addTo(mapInstance);

  const fixSize = () => mapInstance?.invalidateSize();
  setTimeout(fixSize, 100);
  setTimeout(fixSize, 400);
  window.addEventListener('resize', fixSize);
}

async function updateFlowRoute(items, fromIdx) {
  if (!mapInstance) await initFlowMap();
  await drawLeg(items, fromIdx);
}

function highlightTimelineLeg(fromI, toI) {
  document.querySelectorAll('.t-item').forEach((el) => {
    el.classList.remove('leg-from', 'leg-to');
  });
  if (fromI >= 0) document.getElementById(`item-${fromI}`)?.classList.add('leg-from');
  if (toI >= 0) document.getElementById(`item-${toI}`)?.classList.add('leg-to');
}
