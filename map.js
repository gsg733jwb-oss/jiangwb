/** Leaflet 地图：按 Excel「坐标起 / 坐标落」显示每段路线 */

let PLACES_DATA = [];

function normalizeLabel(label) {
  return String(label || '').trim().replace(/[,，\s]+$/g, '').toLowerCase();
}

function resolvePlaceByLabel(label) {
  if (!label) return null;
  const text = normalizeLabel(label);
  if (!text) return null;

  for (const p of PLACES_DATA) {
    if (normalizeLabel(p.name) === text) return { ...p, title: label };
  }

  let best = null;
  let bestScore = 0;
  for (const p of PLACES_DATA) {
    const name = normalizeLabel(p.name);
    if (text.includes(name) || name.includes(text)) {
      const score = name.length;
      if (score > bestScore) { bestScore = score; best = { ...p, title: label }; }
    }
    for (const kw of p.keywords) {
      const kl = kw.toLowerCase();
      if ((text.includes(kl) || kl.includes(text)) && kl.length > bestScore) {
        bestScore = kl.length;
        best = { ...p, title: label };
      }
    }
  }
  return best;
}

function segmentEndpoints(item) {
  const fromLabel = item['坐标起'];
  const toLabel = item['坐标落'];
  const from = fromLabel ? resolvePlaceByLabel(fromLabel) : null;
  const to = toLabel ? resolvePlaceByLabel(toLabel) : null;
  return { fromLabel, toLabel, from, to };
}

async function loadPlacesData() {
  if (PLACES_DATA.length) return;
  try {
    const res = await fetch('data/places.json');
    if (res.ok) PLACES_DATA = await res.json();
  } catch {
    /* 离线时 places.json 可能不可用 */
  }
  if (!PLACES_DATA.length && Array.isArray(window.__PLACES_DATA__)) {
    PLACES_DATA = window.__PLACES_DATA__;
  }
}

if (Array.isArray(window.__PLACES_DATA__) && window.__PLACES_DATA__.length) {
  PLACES_DATA = window.__PLACES_DATA__;
}
loadPlacesData();

const PIN = {
  prev: { color: '#64748b', label: '上', size: 28 },
  curr: { color: '#22c55e', label: '现', size: 36 },
  next: { color: '#f59e0b', label: '下', size: 32 },
};

const PIN_GAP_PX = 12;

const KL_CENTER = [3.12, 101.68];
const IMAGE_BOUNDS = [[2.62, 101.52], [3.22, 101.78]];
const ROLE_ANGLE = { prev: -Math.PI / 2, next: Math.PI / 6, curr: (Math.PI * 5) / 6 };

/** 国内可访问：高德主图 + Esri 海外 + 腾讯备用 + 本地底图 */
const TILE_PROVIDERS = [
  {
    id: 'amap',
    label: '高德地图',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: '1234',
    attribution: '© 高德',
    maxZoom: 18,
  },
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

function openMap() {}
function closeMap() {}

function updateFlowRoute() {}

function isMapOpen() { return false; }

function invalidateFlowMap() {
  window.SegmentMaps?.refresh();
}

/* ── 每段内嵌小地图 ── */

const segmentMaps = new Map();

function segPinIcon(color, label) {
  return L.divIcon({
    className: 'seg-pin-wrap',
    html: `<div class="seg-pin" style="background:${color}">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function attachAdaptiveTiles(leafletMap, el) {
  const order = [0, 1, 2];
  let idx = 0;
  let layer = null;
  let loaded = 0;
  let errors = 0;
  let switched = false;

  function tryNext() {
    if (idx >= order.length) {
      const hint = el.querySelector('.segment-map-missing');
      if (!hint) {
        const p = document.createElement('p');
        p.className = 'segment-map-missing segment-map-tile-warn';
        p.textContent = '地图瓦片加载失败，请检查网络后重试';
        el.appendChild(p);
      }
      return;
    }
    const provider = TILE_PROVIDERS[order[idx]];
    if (layer) leafletMap.removeLayer(layer);
    loaded = 0;
    errors = 0;
    const opts = {
      maxZoom: provider.maxZoom,
      minZoom: 3,
      attribution: provider.attribution,
      crossOrigin: true,
    };
    if (provider.subdomains) opts.subdomains = provider.subdomains;
    layer = L.tileLayer(provider.url, opts);
    layer.on('tileload', (e) => {
      const tile = e.tile;
      if (!tile || tile.naturalWidth < 64) return;
      loaded += 1;
      el.querySelector('.segment-map-tile-warn')?.remove();
    });
    layer.on('tileerror', () => {
      errors += 1;
      if (!switched && errors >= 3 && loaded === 0) {
        switched = true;
        idx += 1;
        tryNext();
      }
    });
    layer.addTo(leafletMap);
    setTimeout(() => {
      if (!switched && loaded < 2 && idx < order.length - 1) {
        switched = true;
        idx += 1;
        tryNext();
      }
    }, 3500);
  }

  tryNext();
}

function buildSegmentMap(el, fromLabel, toLabel) {
  const from = fromLabel ? resolvePlaceByLabel(fromLabel) : null;
  const to = toLabel ? resolvePlaceByLabel(toLabel) : null;

  if (!from && !to) {
    const missing = [fromLabel, toLabel].filter(Boolean).join('、');
    el.innerHTML = `<p class="segment-map-missing">未匹配到坐标：${missing || '请检查 Excel 与 places.json'}</p>`;
    return null;
  }

  const leafletMap = L.map(el, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: false,
    dragging: true,
    touchZoom: true,
  });

  attachAdaptiveTiles(leafletMap, el);
  const markers = [];

  if (from) {
    markers.push(L.marker([from.lat, from.lng], { icon: segPinIcon('#22c55e', '起') })
      .bindTooltip(fromLabel, { direction: 'top' }).addTo(leafletMap));
  }
  if (to) {
    markers.push(L.marker([to.lat, to.lng], { icon: segPinIcon('#f59e0b', '落') })
      .bindTooltip(toLabel, { direction: 'top' }).addTo(leafletMap));
  }
  if (from && to) {
    L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
      color: '#4d9fff', weight: 3, opacity: 0.85, dashArray: '6 4',
    }).addTo(leafletMap);
  }

  const pts = [];
  if (from) pts.push([from.lat, from.lng]);
  if (to) pts.push([to.lat, to.lng]);
  if (pts.length === 1) leafletMap.setView(pts[0], 14);
  else leafletMap.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: pts.length > 1 && Math.abs(pts[0][0] - pts[1][0]) > 2 ? 6 : 14 });

  requestAnimationFrame(() => {
    leafletMap.invalidateSize();
    setTimeout(() => leafletMap.invalidateSize(), 120);
  });
  return leafletMap;
}

function destroySegmentMaps() {
  for (const m of segmentMaps.values()) m.remove();
  segmentMaps.clear();
}

function mountSegmentMap(el) {
  const id = el.id;
  if (!id || segmentMaps.has(id)) return;
  const map = buildSegmentMap(el, el.dataset.from || '', el.dataset.to || '');
  if (map) segmentMaps.set(id, map);
}

window.SegmentMaps = {
  async mountAll() {
    if (!PLACES_DATA.length) await loadPlacesData();
    destroySegmentMaps();
    document.querySelectorAll('.segment-map-wrap.is-open .segment-map').forEach((el) => {
      mountSegmentMap(el);
    });
  },
  async refresh() {
    destroySegmentMaps();
    await this.mountAll();
  },
  mountOne(el) {
    mountSegmentMap(el);
  },
  destroy: destroySegmentMaps,
};
