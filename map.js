/** Leaflet 交互地图：按需加载 · 腾讯地图（国内）+ 备用，上 / 现 / 下 */

const PLACES_DATA = [
  { id: 'klia', name: '吉隆坡国际机场 KLIA', lat: 2.7456, lng: 101.7099, keywords: ['KLIA', '国际机场', '机场'] },
  { id: 'moxy', name: 'Moxy Chinatown', lat: 3.1415, lng: 101.6978, keywords: ['Moxy', 'Hang Lekiu', '唐人街酒店'] },
  { id: 'petaling', name: '茨厂街', lat: 3.1440, lng: 101.6969, keywords: ['茨厂街', 'Petaling', '唐人街', '关帝庙', '仙四师爷庙'] },
  { id: 'central-market', name: '中央艺术坊', lat: 3.1454, lng: 101.6956, keywords: ['中央艺术坊', 'Hang Kasturi', '艺术坊'] },
  { id: 'masjid-jamek', name: '占美清真寺', lat: 3.1493, lng: 101.6967, keywords: ['占美清真寺', 'Jamek', 'River of Life'] },
  { id: 'merdeka', name: '独立广场', lat: 3.1490, lng: 101.6939, keywords: ['独立广场', '苏丹阿都沙末', '圣玛丽', 'I♥KL', '城市画廊', 'Merdeka'] },
  { id: 'pavilion', name: 'Pavilion KL', lat: 3.1492, lng: 101.7132, keywords: ['Pavilion', '武吉免登', 'Bukit Bintang', '168 Jln'] },
  { id: 'madam-kwans', name: "Madam Kwan's Pavilion", lat: 3.1490, lng: 101.7128, keywords: ['Madam Kwan', "Madam Kwan's"] },
  { id: 'durian-bros', name: 'Durian Bros 榴莲兄弟', lat: 3.1478, lng: 101.7103, keywords: ['Durian Bros', '榴莲兄弟', '榴莲'] },
  { id: 'sunway-lagoon', name: '双威水上乐园', lat: 3.0699, lng: 101.6066, keywords: ['Sunway Lagoon', '双威乐园', '水上乐园', 'PJS 11/15'] },
  { id: 'sunway-pyramid', name: 'Sunway Pyramid', lat: 3.0722, lng: 101.6074, keywords: ['Sunway Pyramid', '双威金字塔', "A'Decade", 'Food Court'] },
  { id: 'adecade', name: "A'Decade", lat: 3.0722, lng: 101.6074, keywords: ["A'Decade", 'Decade'] },
  { id: 'imperial-lexis', name: 'Imperial Lexis', lat: 3.1512, lng: 101.7145, keywords: ['Imperial Lexis', 'Kia Peng'] },
  { id: 'klcc-park', name: 'KLCC公园', lat: 3.1578, lng: 101.7113, keywords: ['KLCC公园', '城中城公园', 'Loke Yew'] },
  { id: 'village-park', name: 'Village Park', lat: 3.1308, lng: 101.6234, keywords: ['Village Park', 'Damansara Utama', 'SS 21/37'] },
  { id: 'petronas', name: '国油双峰塔', lat: 3.1578, lng: 101.7120, keywords: ['双峰塔', 'Petronas', 'Twin Towers', 'Skybridge', '观景台'] },
  { id: 'aquaria', name: 'KLCC水族馆', lat: 3.1540, lng: 101.7118, keywords: ['水族馆', 'Aquaria', '海底隧道'] },
  { id: 'feifei-crab', name: '肥肥蟹', lat: 3.1492, lng: 101.7130, keywords: ['肥肥蟹', 'Fei Fei', 'Pavilion Elite'] },
  { id: 'redai', name: '热带 ReDai', lat: 3.1345, lng: 101.7150, keywords: ['ReDai', '热带', '肉骨茶', 'Thambi', 'Pudu'] },
  { id: 'suria-klcc', name: 'Suria KLCC', lat: 3.1575, lng: 101.7118, keywords: ['Suria KLCC', 'Chipster', '伴手礼', '7-Eleven', 'KK Mart'] },
];

const PIN = {
  prev: { color: '#64748b', label: '上', size: 34 },
  curr: { color: '#22c55e', label: '现', size: 46 },
  next: { color: '#f59e0b', label: '下', size: 40 },
};

const KL_CENTER = [3.12, 101.68];
const IMAGE_BOUNDS = [[2.62, 101.52], [3.22, 101.78]];
const ROLE_ANGLE = { prev: -Math.PI / 2, next: Math.PI / 6, curr: (Math.PI * 5) / 6 };

/** 国内可访问：腾讯地图优先，Esri 备用 */
const TILE_PROVIDERS = [
  {
    id: 'tencent',
    label: '腾讯地图',
    url: 'https://rt{s}.map.gtimg.com/realtimerender?z={z}&x={x}&y={y}&type=vector&style=0',
    subdomains: '0123',
    attribution: '© 腾讯地图',
    maxZoom: 18,
  },
  {
    id: 'esri-street',
    label: 'Esri 街道',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 18,
  },
];

let map = null;
let markerLayer = null;
let baseLayer = null;
let localMapLayer = null;
let mapReady = false;
let mapOpen = false;
let mapControlsBound = false;
let pendingRoute = null;
let lastPins = [];
let usingLocalMap = false;
let providerIndex = 0;

function isDividerRow(item) {
  return String(item['活动/站点'] || item['活动/分区'] || '').includes('━━');
}

function rowTitle(item) {
  return String(item['活动/站点'] || item['活动/分区'] || '').trim();
}

function resolvePlace(item) {
  if (!item) return null;
  const act = rowTitle(item);
  const loc = String(item['地点/地址'] || item['地点'] || '');
  const text = `${act} ${loc}`.toLowerCase();
  if (!act || act.startsWith('→')) return null;

  let best = null;
  let bestScore = 0;
  for (const p of PLACES_DATA) {
    for (const kw of p.keywords) {
      if (text.includes(kw.toLowerCase()) && kw.length > bestScore) {
        bestScore = kw.length;
        best = { ...p, title: act };
      }
    }
  }
  return best;
}

function scheduleRows(items) {
  return items.map((item, index) => ({ item, index })).filter(({ item }) => !isDividerRow(item));
}

function getTriple(items, clickIdx) {
  const rows = scheduleRows(items);
  let pos = rows.findIndex((r) => r.index === clickIdx);
  if (pos < 0) {
    pos = rows.findIndex((r) => r.index > clickIdx);
    if (pos < 0) pos = rows.length - 1;
    else if (pos > 0) pos -= 1;
  }
  return {
    prev: pos > 0 ? rows[pos - 1] : null,
    curr: rows[pos] ?? null,
    next: pos < rows.length - 1 ? rows[pos + 1] : null,
  };
}

function setRouteStatus(html) {
  const el = document.getElementById('route-status');
  if (el) el.innerHTML = html;
}

function highlightTimeline(prevI, currI, nextI) {
  document.querySelectorAll('.t-item').forEach((el) => el.classList.remove('leg-prev', 'leg-from', 'leg-to'));
  if (prevI >= 0) document.getElementById(`item-${prevI}`)?.classList.add('leg-prev');
  if (currI >= 0) document.getElementById(`item-${currI}`)?.classList.add('leg-from');
  if (nextI >= 0) document.getElementById(`item-${nextI}`)?.classList.add('leg-to');
}

function offsetLatLng(lat, lng, role, groupSize) {
  if (groupSize <= 1) return [lat, lng];
  const angle = ROLE_ANGLE[role] ?? 0;
  const meters = 55 + groupSize * 12;
  const dLat = (meters / 111320) * Math.sin(angle);
  const dLng = (meters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
  return [lat + dLat, lng + dLng];
}

function layoutPinPositions(pins) {
  const clusters = new Map();
  for (const p of pins) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(p);
  }
  const out = [];
  for (const group of clusters.values()) {
    for (const p of group) {
      const [lat, lng] = offsetLatLng(p.lat, p.lng, p.role, group.length);
      out.push({ ...p, lat, lng });
    }
  }
  return out;
}

function makePinIcon(cfg) {
  const s = cfg.size;
  return L.divIcon({
    className: 'flow-pin-wrap',
    html: `<div class="flow-pin" style="width:${s}px;height:${s}px;background:${cfg.color}"><span>${cfg.label}</span></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function showMapToast(msg) {
  const el = document.getElementById('map-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showMapToast._t);
  showMapToast._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function setMapHint(show) {
  const el = document.getElementById('map-hint');
  if (el) el.classList.toggle('hidden', !show);
}

function useLocalMap() {
  if (!map) return;
  usingLocalMap = true;
  if (baseLayer && map.hasLayer(baseLayer)) {
    map.removeLayer(baseLayer);
    baseLayer = null;
  }
  if (!localMapLayer) {
    localMapLayer = L.imageOverlay('assets/kl-map.jpg', IMAGE_BOUNDS, { opacity: 1, interactive: false });
  }
  if (!map.hasLayer(localMapLayer)) localMapLayer.addTo(map);
  map.setMaxBounds(L.latLngBounds(IMAGE_BOUNDS).pad(0.02));
  showMapToast('在线地图不可用，已切换本地示意图（可缩放）');
}

function clearLocalMap() {
  if (!map) return;
  usingLocalMap = false;
  if (localMapLayer && map.hasLayer(localMapLayer)) map.removeLayer(localMapLayer);
  map.setMaxBounds(null);
}

function makeTileLayer(provider) {
  let loaded = 0;
  let errors = 0;
  let switched = false;

  const opts = {
    maxZoom: provider.maxZoom,
    minZoom: 3,
    attribution: provider.attribution,
    crossOrigin: true,
  };
  if (provider.subdomains) opts.subdomains = provider.subdomains;

  const layer = L.tileLayer(provider.url, opts);

  layer.on('tileload', (e) => {
    if (e.tile?.naturalWidth <= 1 || e.tile?.naturalHeight <= 1) return;
    loaded += 1;
    if (loaded === 1) {
      clearLocalMap();
      showMapToast(`在线地图 · ${provider.label}`);
    }
  });

  layer.on('tileerror', () => {
    errors += 1;
    if (switched || usingLocalMap) return;
    if (errors >= 4 && loaded === 0) tryNextProvider();
  });

  layer._providerId = provider.id;
  return layer;
}

function tryNextProvider() {
  if (!map) return;
  providerIndex += 1;
  if (providerIndex >= TILE_PROVIDERS.length) {
    useLocalMap();
    return;
  }
  if (baseLayer) {
    map.removeLayer(baseLayer);
    baseLayer = null;
  }
  const provider = TILE_PROVIDERS[providerIndex];
  baseLayer = makeTileLayer(provider);
  baseLayer.addTo(map);
}

function createBaseLayer() {
  providerIndex = 0;
  const layer = makeTileLayer(TILE_PROVIDERS[0]);
  setTimeout(() => {
    if (!usingLocalMap && layer._tiles && Object.keys(layer._tiles).length === 0) {
      tryNextProvider();
    }
  }, 5000);
  return layer;
}

function mapZoomBy(delta) {
  if (!map) return;
  map.setZoom(map.getZoom() + delta, { animate: true });
}

function fitToPins(pins) {
  if (!map || !pins.length) return;
  const curr = pins.find((p) => p.role === 'curr');
  const next = pins.find((p) => p.role === 'next');
  const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));

  let maxZoom = usingLocalMap ? 14 : 16;
  if (curr && next) {
    const dist = map.distance([curr.lat, curr.lng], [next.lat, next.lng]);
    if (dist < 400) maxZoom = usingLocalMap ? 15 : 17;
    else if (dist < 1500) maxZoom = usingLocalMap ? 14 : 16;
    else if (dist < 8000) maxZoom = usingLocalMap ? 12 : 13;
    else maxZoom = usingLocalMap ? 10 : 11;
  }

  map.fitBounds(bounds, { padding: [44, 44], maxZoom, animate: true });
}

function renderPins(pins) {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  lastPins = pins;

  if (!pins.length) {
    setMapHint(true);
    map?.setView(KL_CENTER, 10, { animate: false });
    return;
  }

  setMapHint(false);
  const placed = layoutPinPositions(pins);
  for (const p of placed) {
    L.marker([p.lat, p.lng], { icon: makePinIcon(p.cfg), zIndexOffset: p.role === 'curr' ? 300 : p.role === 'next' ? 200 : 100 })
      .bindTooltip(`${p.cfg.label} · ${p.title}`, { direction: 'top', offset: [0, -8] })
      .addTo(markerLayer);
  }
  fitToPins(placed);
}

function buildRouteData(items, clickIdx) {
  const triple = getTriple(items, clickIdx);
  const prevI = triple.prev?.index ?? -1;
  const currI = triple.curr?.index ?? -1;
  const nextI = triple.next?.index ?? -1;

  const parts = [];
  const pins = [];

  const collect = (row, role) => {
    if (!row) return;
    const title = rowTitle(row.item);
    const cfg = PIN[role];
    parts.push(`<span class="leg-${role}">${cfg.label} ${title}</span>`);
    const place = resolvePlace(row.item);
    if (place) pins.push({ lat: place.lat, lng: place.lng, cfg, title, role });
  };

  collect(triple.prev, 'prev');
  collect(triple.curr, 'curr');
  collect(triple.next, 'next');

  const missing = [];
  if (triple.prev && !pins.some((p) => p.role === 'prev')) missing.push('上');
  if (triple.curr && !pins.some((p) => p.role === 'curr')) missing.push('现');
  if (triple.next && !pins.some((p) => p.role === 'next')) missing.push('下');
  const extra = missing.length
    ? ` <span class="route-meta">（${missing.join('、')}暂无坐标）</span>`
    : '';

  return { prevI, currI, nextI, parts, pins, extra };
}

function drawTriple(items, clickIdx) {
  const { prevI, currI, nextI, parts, pins, extra } = buildRouteData(items, clickIdx);
  highlightTimeline(prevI, currI, nextI);

  setRouteStatus(parts.length
    ? parts.join(' <span class="route-arrow">→</span> ') + extra
    : '<span class="muted">请选择左侧行程</span>');

  if (mapOpen && mapReady) renderPins(pins);
}

function bindMapControls() {
  if (mapControlsBound) return;
  mapControlsBound = true;

  document.getElementById('map-zoom-in')?.addEventListener('click', () => mapZoomBy(1));
  document.getElementById('map-zoom-out')?.addEventListener('click', () => mapZoomBy(-1));
  document.getElementById('map-fit-btn')?.addEventListener('click', () => {
    if (lastPins.length) fitToPins(layoutPinPositions(lastPins));
    else map?.setView(KL_CENTER, 11);
  });
  document.getElementById('map-reset-btn')?.addEventListener('click', () => {
    map?.setView(KL_CENTER, 11, { animate: true });
  });
  document.getElementById('map-open-btn')?.addEventListener('click', openMap);
  document.getElementById('map-close-btn')?.addEventListener('click', closeMap);
}

function initFlowMap() {
  if (mapReady || typeof L === 'undefined') return;
  const el = document.getElementById('trip-map');
  if (!el) return;

  mapReady = true;
  map = L.map(el, {
    center: KL_CENTER,
    zoom: 11,
    zoomControl: false,
    scrollWheelZoom: true,
    touchZoom: true,
    pinchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    minZoom: 3,
    maxZoom: 18,
  });

  baseLayer = createBaseLayer();
  baseLayer.addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  bindMapControls();
  setMapHint(true);

  setTimeout(() => map.invalidateSize(), 100);
  window.addEventListener('resize', () => {
    if (mapOpen) map?.invalidateSize();
  });
}

function isMapOpen() {
  return mapOpen;
}

function openMap() {
  mapOpen = true;
  document.getElementById('map-placeholder')?.classList.add('is-hidden');
  document.getElementById('map-body')?.classList.remove('is-hidden');

  initFlowMap();
  requestAnimationFrame(() => {
    map?.invalidateSize();
    if (pendingRoute) {
      const { items, clickIdx } = pendingRoute;
      const { pins } = buildRouteData(items, clickIdx);
      renderPins(pins);
    }
  });
}

function closeMap() {
  mapOpen = false;
  document.getElementById('map-placeholder')?.classList.remove('is-hidden');
  document.getElementById('map-body')?.classList.add('is-hidden');
}

function invalidateFlowMap() {
  map?.invalidateSize();
}

function updateFlowRoute(items, clickIdx) {
  pendingRoute = { items, clickIdx };
  drawTriple(items, clickIdx);
  if (mapOpen && mapReady) {
    requestAnimationFrame(() => map?.invalidateSize());
  }
}

function highlightTimelineLeg() {}

function setupMapShell() {
  bindMapControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMapShell);
} else {
  setupMapShell();
}
