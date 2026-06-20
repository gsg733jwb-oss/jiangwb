const TYPE_COLORS = {
  餐饮: '#f97316', 交通: '#3b82f6', 景点: '#22c55e', 酒店: '#a855f7',
  乐园: '#06b6d4', 购物: '#eab308', 休闲: '#94a3b8', 项目: '#94a3b8', 步行: '#94a3b8',
};

const DAY_META = [
  { key: '1-7月12日', num: 1, date: '2026-07-12', label: '7/12 周日' },
  { key: '2-7月13日', num: 2, date: '2026-07-13', label: '7/13 周一' },
  { key: '3-7月14日', num: 3, date: '2026-07-14', label: '7/14 周二' },
  { key: '4-7月15日', num: 4, date: '2026-07-15', label: '7/15 周三' },
];

let trip = null;
let currentDayIdx = 0;
let manualRouteIdx = null;
let doneSet = new Set(JSON.parse(localStorage.getItem('kl-done') || '[]'));
let checklistSet = new Set(JSON.parse(localStorage.getItem('kl-checklist') || '[]'));

function saveDone() {
  localStorage.setItem('kl-done', JSON.stringify([...doneSet]));
}
function saveChecklist() {
  localStorage.setItem('kl-checklist', JSON.stringify([...checklistSet]));
}

function migrateChecklistStorage() {
  if (checklistSet.size) return;
  const legacy = [
    ...JSON.parse(localStorage.getItem('kl-prep') || '[]'),
    ...JSON.parse(localStorage.getItem('kl-pack') || '[]'),
  ];
  if (legacy.length) {
    checklistSet = new Set(legacy.map((id) => id.replace(/^prep::/, 'check::').replace(/^pack::/, 'check::')));
    saveChecklist();
  }
}

function itemId(dayKey, idx) {
  return `${dayKey}::${idx}`;
}

function formatCoords(c) {
  if (!c) return '';
  return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
}

function coordSummary(dayKey, idx, item, items) {
  if (!window.TripCoords) return '';
  const c = window.TripCoords.get(dayKey, idx, item, items);
  if (!c) return '<span class="coord-missing">未设坐标</span>';
  return `<span class="coord-val ${c.manual ? 'is-manual' : ''}">${formatCoords(c)}${c.manual ? ' · 手动' : ''}</span>`;
}

function bindCoordEditors(dayKey, items) {
  const tl = document.getElementById('timeline');
  if (!tl || !window.TripCoords) return;

  tl.querySelectorAll('.coord-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.coord-edit');
      const panel = wrap?.querySelector('.coord-panel');
      if (!panel) return;
      const open = !panel.classList.contains('open');
      tl.querySelectorAll('.coord-panel.open').forEach((p) => p.classList.remove('open'));
      if (open) {
        panel.classList.add('open');
        const idx = +wrap.dataset.idx;
        const c = window.TripCoords.get(dayKey, idx, items[idx], items);
        const latIn = panel.querySelector('.coord-lat');
        const lngIn = panel.querySelector('.coord-lng');
        if (latIn) latIn.value = c ? c.lat : '';
        if (lngIn) lngIn.value = c ? c.lng : '';
      }
    });
  });

  tl.querySelectorAll('.coord-panel').forEach((panel) => {
    panel.addEventListener('click', (e) => e.stopPropagation());

    const wrap = panel.closest('.coord-edit');
    const idx = +wrap.dataset.idx;

    panel.querySelector('.coord-save')?.addEventListener('click', () => {
      const lat = panel.querySelector('.coord-lat')?.value;
      const lng = panel.querySelector('.coord-lng')?.value;
      if (!window.TripCoords.set(dayKey, idx, lat, lng)) {
        alert('请输入有效的纬度和经度');
        return;
      }
      panel.classList.remove('open');
      renderFlow();
    });

    panel.querySelector('.coord-clear')?.addEventListener('click', () => {
      window.TripCoords.clear(dayKey, idx);
      panel.classList.remove('open');
      renderFlow();
    });

    panel.querySelector('.coord-copy-prev')?.addEventListener('click', () => {
      const r = window.TripCoords.copyPrev(dayKey, idx, items);
      if (!r.ok) { alert(r.msg); return; }
      panel.classList.remove('open');
      renderFlow();
    });

    panel.querySelector('.coord-copy-next')?.addEventListener('click', () => {
      const r = window.TripCoords.copyNext(dayKey, idx, items);
      if (!r.ok) { alert(r.msg); return; }
      panel.classList.remove('open');
      renderFlow();
    });
  });
}

function klNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
}

function klDateYmd() {
  const n = klNow();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function parseTimeRange(str, refDate) {
  if (!str) return null;
  const s = String(str).trim();
  const range = s.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (range) {
    const start = new Date(refDate);
    start.setHours(+range[1], +range[2], 0, 0);
    const end = new Date(refDate);
    end.setHours(+range[3], +range[4], 0, 0);
    return { start, end };
  }
  const single = s.match(/^(\d{1,2}):(\d{2})$/);
  if (single) {
    const t = new Date(refDate);
    t.setHours(+single[1], +single[2], 0, 0);
    return { start: t, end: new Date(t.getTime() + 30 * 60000) };
  }
  return null;
}

function getRow(item) {
  const act = item['活动/站点'] || item['活动/分区'] || '';
  const loc = item['地点/地址'] || item['地点'] || '';
  const type = item['类型'] || '';
  const time = item['时段'] || '';
  const transport = item['交通'] || '';
  const duration = item['时长'] || '';
  const cost = item['费用(RM)'] || '';
  const detail = item['详细说明'] || '';
  const rec = item['推荐/必做'] || '';
  const note = item['注意事项'] || '';
  return { act, loc, type, time, transport, duration, cost, detail, rec, note };
}

function isDivider(item) {
  const act = item['活动/站点'] || item['活动/分区'] || '';
  return act && String(act).includes('━━');
}

function isSubItem(item) {
  const act = item['活动/站点'] || item['活动/分区'] || '';
  return String(act).trim().startsWith('→');
}

function detectCurrentDay() {
  const ymd = klDateYmd();
  const idx = DAY_META.findIndex((d) => d.date === ymd);
  return idx >= 0 ? idx : 0;
}

function getLiveStatus(dayKey, items) {
  const live = document.getElementById('live-mode').checked;
  const meta = DAY_META.find((d) => d.key === dayKey);
  if (!live || !meta) return { currentIdx: -1, progress: 0 };

  const now = klNow();
  const ref = new Date(meta.date + 'T00:00:00');
  if (klDateYmd() !== meta.date) {
    const tripStart = new Date('2026-07-12');
    const tripEnd = new Date('2026-07-15T23:59:59');
    if (now < tripStart) return { currentIdx: -1, progress: 0 };
    if (now > tripEnd) return { currentIdx: items.length, progress: 100 };
    return { currentIdx: -1, progress: 0 };
  }

  let currentIdx = -1;
  let lastEnd = ref;
  const actionable = [];

  items.forEach((item, i) => {
    if (isDivider(item)) return;
    const { time } = getRow(item);
    const range = parseTimeRange(time, ref);
    if (range) {
      actionable.push({ i, ...range });
      if (now >= range.start && now < range.end) currentIdx = i;
      if (now >= range.end) lastEnd = range.end;
    }
  });

  if (currentIdx < 0 && actionable.length) {
    const future = actionable.find((a) => now < a.start);
    const past = [...actionable].reverse().find((a) => now >= a.end);
    if (future && !past) currentIdx = future.i;
    else if (past) currentIdx = past.i;
  }

  const dayStart = actionable[0]?.start || ref;
  const dayEnd = actionable[actionable.length - 1]?.end || new Date(ref.getTime() + 12 * 3600000);
  const total = dayEnd - dayStart;
  const progress = total > 0 ? Math.min(100, Math.max(0, ((now - dayStart) / total) * 100)) : 0;

  return { currentIdx, progress: Math.round(progress) };
}

function renderDayBar() {
  const bar = document.getElementById('day-bar');
  const todayYmd = klDateYmd();
  bar.innerHTML = DAY_META.map((d, i) => {
    const ov = trip.overview.find((o) => o['日期'] === d.date);
    const isToday = d.date === todayYmd;
    return `<button class="day-btn ${i === currentDayIdx ? 'active' : ''} ${isToday ? 'is-today' : ''}" data-idx="${i}">
      <span class="d-num">Day ${d.num}</span>
      <span class="d-date">${d.label}</span>
      ${ov ? `<span class="d-date">${ov['主题'] || ''}</span>` : ''}
    </button>`;
  }).join('');

  bar.querySelectorAll('.day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDayIdx = +btn.dataset.idx;
      manualRouteIdx = null;
      renderFlow();
      renderDayBar();
    });
  });
}

function renderFlow() {
  const meta = DAY_META[currentDayIdx];
  const items = trip.days[meta.key] || [];
  const ov = trip.overview.find((o) => o['日期'] === meta.date);
  const { currentIdx, progress } = getLiveStatus(meta.key, items);

  document.getElementById('day-heading').textContent = `Day ${meta.num} · ${meta.label}`;
  document.getElementById('day-subtitle').textContent = ov
    ? `${ov['住宿'] || ''} · ${ov['核心活动'] || ''}`
    : '';
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('progress-text').textContent = progress + '%';

  const tl = document.getElementById('timeline');
  let html = '';
  let actionIdx = 0;

  items.forEach((item, i) => {
    if (isDivider(item)) {
      const act = item['活动/站点'] || item['活动/分区'] || '';
      html += `<div class="t-divider">${esc(act.replace(/━/g, '').trim())}</div>`;
      return;
    }

    const r = getRow(item);
    const id = itemId(meta.key, i);
    const done = doneSet.has(id);
    const isNow = i === currentIdx && document.getElementById('live-mode').checked;
    const isStar = (r.rec && String(r.rec).includes('★')) || (r.rec && String(r.rec).includes('必'));
    const sub = isSubItem(item);
    const color = TYPE_COLORS[r.type] || '#64748b';

    html += `<div class="t-item ${isNow ? 'now' : ''} ${done ? 'done' : ''} ${sub ? 'sub' : ''}" data-idx="${i}" id="item-${i}">
      <div class="t-dot" style="border-color:${color}"></div>
      <div class="t-card ${isStar ? 'highlight' : ''}">
        <div class="t-top">
          <span class="t-time">${esc(r.time)}</span>
          <span class="t-badge" style="background:${color}22;color:${color}">${esc(r.type)}</span>
          ${isNow ? '<span class="t-badge now-label">进行中</span>' : ''}
          ${isStar ? '<span class="t-badge star">推荐</span>' : ''}
        </div>
        <div class="t-title">${esc(r.act)}</div>
        ${r.loc ? `<div class="t-loc">📍 ${esc(r.loc)}</div>` : ''}
        <div class="t-meta">
          ${r.transport && r.transport !== '—' ? `<span>🚗 ${esc(r.transport)}</span>` : ''}
          ${r.duration && r.duration !== '—' ? `<span>⏱ ${esc(r.duration)}</span>` : ''}
          ${r.cost && r.cost !== '—' ? `<span>💰 ${esc(r.cost)}</span>` : ''}
        </div>
        ${r.detail ? `<div class="t-note">${esc(r.detail)}</div>` : ''}
        ${r.note ? `<div class="t-note" style="opacity:0.85">⚠️ ${esc(r.note)}</div>` : ''}
        <div class="coord-edit" data-idx="${i}">
          <div class="coord-row">
            ${coordSummary(meta.key, i, item, items)}
            <button type="button" class="btn-sm coord-toggle">编辑坐标</button>
          </div>
          <div class="coord-panel">
            <div class="coord-fields">
              <label>纬度 <input type="number" class="coord-lat" step="0.0001" placeholder="3.1490" /></label>
              <label>经度 <input type="number" class="coord-lng" step="0.0001" placeholder="101.7128" /></label>
            </div>
            <div class="coord-actions">
              <button type="button" class="btn-sm coord-copy-prev">同上</button>
              <button type="button" class="btn-sm coord-copy-next">同下</button>
              <button type="button" class="btn-sm coord-save">保存</button>
              <button type="button" class="btn-sm coord-clear">清除</button>
            </div>
          </div>
        </div>
        <div class="t-actions">
          <button class="btn-sm done-btn ${done ? 'is-done' : ''}" data-id="${id}">${done ? '✓ 已完成' : '标记完成'}</button>
        </div>
      </div>
    </div>`;
    actionIdx++;
  });

  tl.innerHTML = html;

  tl.querySelectorAll('.done-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (doneSet.has(id)) doneSet.delete(id);
      else doneSet.add(id);
      saveDone();
      renderFlow();
    });
  });

  if (currentIdx >= 0) {
    const el = document.getElementById(`item-${currentIdx}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const routeFrom = manualRouteIdx != null ? manualRouteIdx : (currentIdx >= 0 ? currentIdx : 0);
  if (typeof updateFlowRoute === 'function') {
    updateFlowRoute(items, routeFrom, meta.key);
  }

  bindCoordEditors(meta.key, items);

  tl.querySelectorAll('.t-item').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      if (e.target.closest('.done-btn') || e.target.closest('.coord-edit')) return;
      manualRouteIdx = +el.dataset.idx;
      updateFlowRoute(items, manualRouteIdx, meta.key);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

function renderOverview() {
  const el = document.getElementById('overview-cards');
  el.innerHTML = trip.overview
    .filter((o) => o['日期'] !== '—')
    .map((o) => `<div class="card">
      <h3>${esc(o['日期'])} ${esc(o['星期'])} · ${esc(o['主题'])}</h3>
      <p><strong>住宿</strong> ${esc(o['住宿'])}</p>
      <p style="margin-top:0.35rem">${esc(o['核心活动'])}</p>
      <span class="tag">${esc(o['重要提醒'])}</span>
    </div>`).join('');
}

function renderFood() {
  const cols = ['日期', '餐次', '餐厅', '必点', '人均RM', '说明'];
  document.getElementById('food-table').innerHTML = tableHtml(trip.foodDist, cols);

  document.getElementById('restaurant-cards').innerHTML = trip.restaurants
    .filter((r) => r['安排日'] && !String(r['安排日']).includes('备选'))
    .map((r) => `<div class="card">
      <h3>${esc(r['餐厅'])}</h3>
      <p>${esc(r['类型'])} · ${esc(r['安排日'])} · RM ${esc(r['人均(RM)'])}</p>
      <p style="margin-top:0.35rem">📍 ${esc(r['地址'])}</p>
      <p style="margin-top:0.35rem">必点：${esc(r['必点菜品'])}</p>
    </div>`).join('');

  const rankCols = ['排名', '餐厅', '区域', '必点', '人均RM', '距KLCC', '备注'];
  document.getElementById('food-rankings').innerHTML = (trip.foodRankings || [])
    .map((sec) => `
      <h4 class="rank-title">${esc(sec.title)}</h4>
      <div class="table-wrap">${tableHtml(sec.items, rankCols)}</div>`).join('');
}

function renderMap() {
  const cols = ['序号', '地点名称', '类型', '备注', '优先级', '安排日期', '时段'];
  document.getElementById('map-table').innerHTML = tableHtml(trip.mapList, cols);
}

function renderBudget() {
  const rows = trip.budget.filter((b) => b['日期'] !== '全程');
  const summary = trip.budget.find((b) => b['日期'] === '全程');
  const byDate = {};
  rows.forEach((r) => {
    const d = r['日期'];
    if (!byDate[d]) byDate[d] = { min: 0, max: 0 };
    const lo = +r['费用下限(RM)'] || 0;
    const hi = +r['费用上限(RM)'] || 0;
    if (r['人均/合计'] === '人均') {
      byDate[d].min += lo;
      byDate[d].max += hi;
    }
  });

  document.getElementById('budget-summary').innerHTML = `
    <div class="stat-card">
      <div class="label">全程预估（人均）</div>
      <div class="value">RM ${summary ? summary['费用下限(RM)'] : '—'}–${summary ? summary['费用上限(RM)'] : '—'}</div>
      <div class="sub">${summary ? esc(summary['备注']) : ''}</div>
    </div>
    ${Object.entries(byDate).map(([d, v]) => `
      <div class="stat-card">
        <div class="label">${esc(d)} 餐饮门票等</div>
        <div class="value">RM ${v.min}–${v.max}</div>
        <div class="sub">人均项合计</div>
      </div>`).join('')}
  `;

  const cols = ['日期', '类别', '项目', '费用下限(RM)', '费用上限(RM)', '人均/合计', '备注'];
  document.getElementById('budget-table').innerHTML = tableHtml(trip.budget, cols);

  renderFullBudget();
}

function renderFullBudget() {
  const fb = trip.fullBudget;
  if (!fb) return;

  document.getElementById('full-budget-title').textContent = fb.title || '7天全程预算';
  document.getElementById('full-budget-subtitle').textContent = fb.subtitle || '';

  const totalRow = fb.rows.find((r) => String(r['分类'] || '').includes('合计'));
  const hintRow = fb.rows.find((r) => String(r['分类'] || '').includes('已支付'));
  const detailRows = fb.rows.filter((r) => r !== totalRow && r !== hintRow);

  document.getElementById('full-budget-summary').innerHTML = `
    ${totalRow ? `<div class="stat-card">
      <div class="label">全程预算合计</div>
      <div class="value">¥ ${fmtNum(totalRow['预估上限(¥)'])}</div>
      <div class="sub">已支付 ¥ ${fmtNum(totalRow['实际支付(¥)'])}</div>
    </div>` : ''}
    ${hintRow ? `<div class="stat-card">
      <div class="label">支付进度</div>
      <div class="value" style="font-size:1rem;line-height:1.4">${esc(hintRow['分类'])}</div>
    </div>` : ''}`;

  const cols = ['分类', '项目', '说明', '预估上限(¥)', '实际支付(¥)', '可选', '是否已订'];
  document.getElementById('full-budget-table').innerHTML = tableHtml(detailRows, cols);
}

function fmtNum(n) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('zh-CN');
}

function renderPrep() {
  migrateChecklistStorage();
  const cl = trip.checklist;
  if (!cl) return;

  document.getElementById('checklist-title').textContent = cl.title || '行前准备与携带清单';
  document.getElementById('checklist-subtitle').textContent = cl.subtitle || '';

  const byType = {};
  cl.rows.forEach((row) => {
    const type = row['类型'] || '其他';
    const cat = row['分类'] || '其他';
    if (!byType[type]) byType[type] = {};
    if (!byType[type][cat]) byType[type][cat] = [];
    byType[type][cat].push(row);
  });

  document.getElementById('checklist-groups').innerHTML = Object.entries(byType)
    .map(([type, cats]) => `
      <div class="checklist-type">
        <h3 class="checklist-type-title">${esc(type)}</h3>
        ${Object.entries(cats).map(([cat, items]) => `
          <div class="prep-group">
            <h4>${esc(cat)}</h4>
            ${items.map((p) => {
              const id = `check::${p['事项/物品']}`;
              const checked = checklistSet.has(id);
              const must = p['必备'] === '是';
              const when = p['何时/数量'];
              const budget = p['预算(¥)'];
              const extra = [when, budget ? `¥${budget}` : '', p['备注']].filter(Boolean).join(' · ');
              return `<div class="prep-item ${must ? 'must' : ''}">
                <input type="checkbox" id="${esc(id)}" data-id="${esc(id)}" ${checked ? 'checked' : ''} />
                <label for="${esc(id)}">
                  ${esc(p['事项/物品'])}
                  <div class="when">${esc(extra)}</div>
                </label>
              </div>`;
            }).join('')}
          </div>`).join('')}
      </div>`).join('');

  document.querySelectorAll('#checklist-groups input').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) checklistSet.add(cb.dataset.id);
      else checklistSet.delete(cb.dataset.id);
      saveChecklist();
    });
  });
}

function tableHtml(rows, cols) {
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c] ?? '—')}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  if (view === 'flow') {
    setTimeout(() => {
      const meta = DAY_META[currentDayIdx];
      const items = trip?.days[meta.key] || [];
      if (items.length && typeof updateFlowRoute === 'function') {
        const meta = DAY_META[currentDayIdx];
        updateFlowRoute(items, manualRouteIdx ?? 0, meta.key);
      }
      if (typeof isMapOpen === 'function' && isMapOpen() && typeof invalidateFlowMap === 'function') {
        invalidateFlowMap();
      }
    }, 80);
  }
}

function updateClock() {
  const now = klNow();
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  document.getElementById('live-clock').textContent =
    '吉隆坡 ' + now.toLocaleString('zh-CN', opts);

  if (document.getElementById('view-flow').classList.contains('active')) {
    renderFlow();
    renderDayBar();
  }
}

async function loadTripData() {
  if (window.__TRIP_DATA__) return window.__TRIP_DATA__;
  const res = await fetch('data/trip.json');
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

async function init() {
  try {
    trip = await loadTripData();
  } catch {
    document.querySelector('.container').innerHTML =
      '<p style="color:#f87171;padding:2rem">无法加载行程数据。请确认 <code>data/trip.inline.js</code> 存在，或用本地服务器打开。</p>';
    return;
  }

  document.getElementById('trip-title').textContent = trip.title;
  const sub = document.getElementById('trip-subtitle');
  if (sub && trip.subtitle) sub.textContent = trip.subtitle;
  currentDayIdx = detectCurrentDay();

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  document.getElementById('live-mode').addEventListener('change', () => {
    manualRouteIdx = null;
    renderFlow();
    renderDayBar();
  });

  renderDayBar();
  renderFlow();
  renderOverview();
  renderFood();
  renderMap();
  renderBudget();
  renderPrep();
  updateClock();
  setInterval(updateClock, 30000);
}

init();
