/** Leaflet 交互地图：按需加载 · 腾讯地图（国内）+ 备用，上 / 现 / 下 */

const COORD_STORE_KEY = 'kl-coords';
let coordOverrides = JSON.parse(localStorage.getItem(COORD_STORE_KEY) || '{}');
let PLACES_DATA = [];

function coordStorageKey(dayKey, idx) {
  return `${dayKey}::${idx}`;
}

function getCoordOverride(dayKey, idx) {
  const v = coordOverrides[coordStorageKey(dayKey, idx)];
  if (!v || v.lat == null || v.lng == null) return null;
  return { lat: +v.lat, lng: +v.lng };
}

function setCoordOverride(dayKey, idx, lat, lng) {
  const la = +lat;
  const ln = +lng;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  coordOverrides[coordStorageKey(dayKey, idx)] = { lat: la, lng: ln };
  localStorage.setItem(COORD_STORE_KEY, JSON.stringify(coordOverrides));
  return true;
}

function clearCoordOverride(dayKey, idx) {
  delete coordOverrides[coordStorageKey(dayKey, idx)];
  localStorage.setItem(COORD_STORE_KEY, JSON.stringify(coordOverrides));
}

function adjacentScheduleIndex(items, idx, dir) {
  const step = dir === 'prev' ? -1 : 1;
  for (let j = idx + step; j >= 0 && j < items.length; j += step) {
    if (!isDividerRow(items[j])) return j;
  }
  return -1;
}

function getCoordsForItem(dayKey, idx, item, items) {
  const manual = getCoordOverride(dayKey, idx);
  if (manual) return { ...manual, title: rowTitle(item), manual: true };
  const place = resolvePlace(item);
  if (place) return { lat: place.lat, lng: place.lng, title: place.title || rowTitle(item), manual: false };
  return null;
}

function copyCoordsFromAdjacent(dayKey, idx, items, dir) {
  const adj = adjacentScheduleIndex(items, idx, dir);
  if (adj < 0) return { ok: false, msg: dir === 'prev' ? '没有上一站' : '没有下一站' };
  const c = getCoordsForItem(dayKey, adj, items[adj], items);
  if (!c) return { ok: false, msg: '相邻站点暂无坐标' };
  setCoordOverride(dayKey, idx, c.lat, c.lng);
  return { ok: true, coords: c };
}

async function loadPlacesData() {
  try {
    const res = await fetch('data/places.json');
    if (res.ok) PLACES_DATA = await res.json();
  } catch {
    /* file:// 或离线时保留空列表，依赖手动坐标 */
  }
}

function refreshMapRoute() {
  if (!pendingRoute) return;
  const { items, clickIdx, dayKey } = pendingRoute;
  drawTriple(items, clickIdx, dayKey);
}

window.TripCoords = {
  get: getCoordsForItem,
  set: setCoordOverride,
  clear: clearCoordOverride,
  copyPrev: (dayKey, idx, items) => copyCoordsFromAdjacent(dayKey, idx, items, 'prev'),
  copyNext: (dayKey, idx, items) => copyCoordsFromAdjacent(dayKey, idx, items, 'next'),
  refresh: refreshMapRoute,
};

loadPlacesData().then(() => refreshMapRoute());

const PIN = {
  prev: { color: '#64748b', label: '上', size: 28 },
  curr: { color: '#22c55e', label: '现', size: 36 },
  next: { color: '#f59e0b', label: '下', size: 32 },
};

const PIN_GAP_PX = 12;

const KL_CENTER = [3.12, 101.68];
const IMAGE_BOUNDS = [[2.62, 101.52], [3.22, 101.78]];
const ROLE_ANGLE = { prev: -Math.PI / 2, next: Math.PI / 6, curr: (Math.PI * 5) / 6 };

/** 国内可访问：Esri 主图（海外区域有内容）+ 腾讯备用 + 本地底图 */
const TILE_PROVIDERS = [
  {
    id: 'esri-street',
    label: '街道图',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 18,
  },
  {
    id: 'tencent',
    label: '腾讯地图',
    url: 'https://rt{s}.map.gtimg.com/realtimerender?z={z}&x={x}&y={y}&type=vector&style=0',
    subdomains: '0123',
    attribution: '© 腾讯',
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
    if (group.length === 1) {
      out.push({ ...group[0] });
      continue;
    }
    for (const p of group) {
      const [lat, lng] = offsetLatLng(p.lat, p.lng, p.role, group.length);
      out.push({ ...p, lat, lng, stacked: true });
    }
  }
  return out;
}

function makePinIcon(cfg) {
  const s = cfg.size;
  return L.divIcon({
    className: 'flow-pin-wrap',
    html: `<div class="flow-pin flow-pin-dot" style="width:${s}px;height:${s}px;background:${cfg.color}"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function pinsOverlapAtZoom(pins, zoom) {
  if (pins.length < 2) return false;
  const pts = pins.map((p) => {
    const pt = map.project([p.lat, p.lng], zoom);
    return { r: p.cfg.size / 2, x: pt.x, y: pt.y };
  });
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (dist < pts[i].r + pts[j].r + PIN_GAP_PX) return true;
    }
  }
  return false;
}

function zoomToSeparatePins(pins) {
  if (!map || !pins.length) return;
  const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
  const maxZ = usingLocalMap ? 16 : 18;

  map.fitBounds(bounds, { padding: [52, 52], maxZoom: 12, animate: false });

  let zoom = map.getZoom();
  const center = bounds.getCenter();

  while (zoom < maxZ && pinsOverlapAtZoom(pins, zoom)) zoom += 1;

  map.setView(center, zoom, { animate: true });
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

function showLocalUnderlay() {
  if (!map) return;
  if (!localMapLayer) {
    localMapLayer = L.imageOverlay('assets/kl-map.jpg', IMAGE_BOUNDS, { opacity: 1, interactive: false });
  }
  if (!map.hasLayer(localMapLayer)) localMapLayer.addTo(map);
}

function useLocalMap() {
  if (!map) return;
  usingLocalMap = true;
  if (baseLayer && map.hasLayer(baseLayer)) {
    map.removeLayer(baseLayer);
    baseLayer = null;
  }
  showLocalUnderlay();
  map.setMaxBounds(L.latLngBounds(IMAGE_BOUNDS).pad(0.02));
  showMapToast('已切换本地示意图');
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

  const opts = {
    maxZoom: provider.maxZoom,
    minZoom: 3,
    attribution: provider.attribution,
    crossOrigin: true,
  };
  if (provider.subdomains) opts.subdomains = provider.subdomains;

  const layer = L.tileLayer(provider.url, opts);

  layer.on('tileload', (e) => {
    const tile = e.tile;
    if (!tile || tile.naturalWidth < 64 || tile.naturalHeight < 64) return;
    loaded += 1;
    if (loaded === 1) {
      clearLocalMap();
      showMapToast(`在线地图 · ${provider.label}`);
    }
  });

  layer.on('tileerror', () => {
    errors += 1;
    if (usingLocalMap) return;
    if (errors >= 3 && loaded === 0) tryNextProvider();
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
  showLocalUnderlay();
  const layer = makeTileLayer(TILE_PROVIDERS[0]);
  setTimeout(() => {
    if (!usingLocalMap && loadedTilesCount(layer) < 2) tryNextProvider();
  }, 4000);
  return layer;
}

function loadedTilesCount(layer) {
  return layer?._tiles ? Object.keys(layer._tiles).length : 0;
}

function mapZoomBy(delta) {
  if (!map) return;
  map.setZoom(map.getZoom() + delta, { animate: true });
}

function fitToPins(pins) {
  zoomToSeparatePins(pins);
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
      .bindTooltip(p.title, { direction: 'top', offset: [0, -6] })
      .addTo(markerLayer);
  }
  requestAnimationFrame(() => zoomToSeparatePins(placed));
}

function buildRouteData(items, clickIdx, dayKey) {
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
    const coords = getCoordsForItem(dayKey, row.index, row.item, items);
    if (coords) pins.push({ lat: coords.lat, lng: coords.lng, cfg, title, role });
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

function drawTriple(items, clickIdx, dayKey) {
  const { prevI, currI, nextI, parts, pins, extra } = buildRouteData(items, clickIdx, dayKey);
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

  const refresh = () => {
    map?.invalidateSize(true);
    if (pendingRoute) {
      const { items, clickIdx, dayKey } = pendingRoute;
      const { pins } = buildRouteData(items, clickIdx, dayKey);
      renderPins(pins);
    }
  };

  requestAnimationFrame(refresh);
  setTimeout(refresh, 120);
  setTimeout(refresh, 400);
}

function closeMap() {
  mapOpen = false;
  document.getElementById('map-placeholder')?.classList.remove('is-hidden');
  document.getElementById('map-body')?.classList.add('is-hidden');
}

function invalidateFlowMap() {
  map?.invalidateSize();
}

function updateFlowRoute(items, clickIdx, dayKey) {
  pendingRoute = { items, clickIdx, dayKey };
  drawTriple(items, clickIdx, dayKey);
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
