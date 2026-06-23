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
let expandedSet = new Set(JSON.parse(localStorage.getItem('kl-expanded') || '[]'));

function saveDone() {
  localStorage.setItem('kl-done', JSON.stringify([...doneSet]));
}
function saveChecklist() {
  localStorage.setItem('kl-checklist', JSON.stringify([...checklistSet]));
}
function saveExpanded() {
  localStorage.setItem('kl-expanded', JSON.stringify([...expandedSet]));
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

function segMapKey(dayKey, idx) {
  return `map::${dayKey}::${idx}`;
}

function isSegMapOpen(dayKey, idx) {
  return expandedSet.has(segMapKey(dayKey, idx));
}

function hasSegmentCoords(item) {
  return !!(item['坐标起'] || item['坐标落']);
}

function renderSegmentRouteSummary(from, to) {
  const parts = [];
  if (from) parts.push(`<span class="seg-from"><em>起</em>${esc(from)}</span>`);
  if (from && to) parts.push('<span class="seg-arrow">→</span>');
  if (to) parts.push(`<span class="seg-to"><em>落</em>${esc(to)}</span>`);
  return parts.join('');
}

function renderSegmentMapBlock(meta, item, i) {
  const from = item['坐标起'];
  const to = item['坐标落'];
  if (!from && !to) return '';
  const mapId = `seg-${meta.key.replace(/[^a-zA-Z0-9]+/g, '-')}-${i}`;
  const key = segMapKey(meta.key, i);
  const open = isSegMapOpen(meta.key, i);
  const summary = renderSegmentRouteSummary(from, to);
  return `<div class="segment-map-wrap ${open ? 'is-open' : 'is-collapsed'}">
    <button type="button" class="segment-map-toggle" data-segmap-key="${esc(key)}" aria-expanded="${open}">
      <span class="segment-map-toggle-icon" aria-hidden="true">🗺</span>
      <span class="segment-map-toggle-label">路线地图</span>
      <span class="segment-map-toggle-route">${summary}</span>
      <span class="segment-map-chevron" aria-hidden="true">${open ? '▲' : '▼'}</span>
    </button>
    ${open ? `<div class="segment-map-body">
      <div class="segment-route-label">${summary}</div>
      <div class="segment-map" id="${mapId}" data-from="${esc(from || '')}" data-to="${esc(to || '')}"></div>
    </div>` : ''}
  </div>`;
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

function itemPriority(item) {
  const v = item['显示'];
  if (v == null || v === '') return 1;
  return Number(v) || 1;
}

function expandKey(dayKey, idx) {
  return `${dayKey}::${idx}`;
}

function shouldExpandGroup(dayKey, mainIdx, children, currentIdx) {
  const key = expandKey(dayKey, mainIdx);
  if (expandedSet.has(key)) return true;
  if (currentIdx === mainIdx) return true;
  return children.some((c) => c.i === currentIdx);
}

function groupTimelineItems(items) {
  const groups = [];
  let anchor = null;

  items.forEach((item, i) => {
    if (isDivider(item)) {
      anchor = { kind: 'section', item, i, children: [] };
      groups.push(anchor);
      return;
    }

    const pri = itemPriority(item);
    if (pri === 1) {
      anchor = { kind: 'main', item, i, children: [] };
      groups.push(anchor);
      return;
    }

    if (anchor) anchor.children.push({ item, i });
    else {
      anchor = { kind: 'main', item, i, children: [] };
      groups.push(anchor);
    }
  });

  return groups;
}

function renderSubstepPreview(children, currentIdx) {
  const lines = children.slice(0, 3);
  const rest = children.length - lines.length;
  const hiddenNow = children.some((c) => c.i === currentIdx)
    && !lines.some((c) => c.i === currentIdx);

  let html = '<div class="substeps-preview">';
  if (hiddenNow) {
    const nowChild = children.find((c) => c.i === currentIdx);
    const r = getRow(nowChild.item);
    html += `<div class="sub-preview-line now">
      <span class="sub-preview-time">${esc(r.time)}</span>
      <span>${esc(r.act)}</span>
      <span class="sub-preview-tag">进行中</span>
    </div>`;
  }
  lines.forEach(({ item, i }) => {
    if (hiddenNow && i === currentIdx) return;
    const r = getRow(item);
    const isNow = i === currentIdx;
    html += `<div class="sub-preview-line ${isNow ? 'now' : ''}">
      <span class="sub-preview-time">${esc(r.time)}</span>
      <span>${esc(r.act)}</span>
      ${isNow ? '<span class="sub-preview-tag">进行中</span>' : ''}
    </div>`;
  });
  if (rest > 0) {
    html += `<div class="sub-preview-more">⋯ 另有 ${rest} 步，点击展开全部</div>`;
  }
  html += '</div>';
  return html;
}

function renderSubstepList(meta, children, currentIdx) {
  return children.map(({ item, i }) => {
    const r = getRow(item);
    const isNow = i === currentIdx && document.getElementById('live-mode').checked;
    const color = TYPE_COLORS[r.type] || '#64748b';
    return `<div class="substep-row ${isNow ? 'now' : ''}" data-idx="${i}" id="item-${i}">
      <div class="substep-marker" style="background:${color}"></div>
      <div class="substep-body">
        <div class="substep-head">
          <span class="substep-time">${esc(r.time)}</span>
          <span class="substep-type" style="color:${color}">${esc(r.type)}</span>
          ${isNow ? '<span class="substep-now">进行中</span>' : ''}
        </div>
        <div class="substep-title">${esc(r.act)}</div>
        ${r.loc ? `<div class="substep-loc">📍 ${esc(r.loc)}</div>` : ''}
        ${r.detail ? `<div class="substep-note">${esc(r.detail)}</div>` : ''}
        ${r.note ? `<div class="substep-note warn">⚠️ ${esc(r.note)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderSubstepsBlock(meta, mainIdx, children, currentIdx, label) {
  if (!children.length) return '';
  const key = expandKey(meta.key, mainIdx);
  const open = shouldExpandGroup(meta.key, mainIdx, children, currentIdx);
  const hasNowChild = children.some((c) => c.i === currentIdx);

  return `<div class="substeps-block ${open ? 'is-open' : 'is-collapsed'} ${hasNowChild ? 'has-active' : ''}">
    <button type="button" class="substeps-toggle" data-expand-key="${esc(key)}" aria-expanded="${open}">
      <span class="substeps-badge">${children.length}</span>
      <span class="substeps-label">${label}</span>
      <span class="substeps-hint">${open ? '收起' : '展开全部'}</span>
      <span class="substeps-chevron" aria-hidden="true">${open ? '▲' : '▼'}</span>
    </button>
    ${open
      ? `<div class="substeps-list">${renderSubstepList(meta, children, currentIdx)}</div>`
      : renderSubstepPreview(children, currentIdx)}
  </div>`;
}

function renderTimelineItem(meta, item, i, items, currentIdx, { children = [], sectionTitle = null } = {}) {
  const r = getRow(item);
  const id = itemId(meta.key, i);
  const done = doneSet.has(id);
  const isNow = i === currentIdx && document.getElementById('live-mode').checked;
  const isStar = (r.rec && String(r.rec).includes('★')) || (r.rec && String(r.rec).includes('必'));
  const color = TYPE_COLORS[r.type] || '#64748b';
  const isSection = !!sectionTitle;
  const subLabel = isSection ? '路线细节' : '子步骤';
  const childNow = children.some((c) => c.i === currentIdx);

  return `<div class="t-item ${isNow || childNow ? 'now' : ''} ${done ? 'done' : ''} ${children.length ? 'has-children' : ''}" data-idx="${i}" id="item-${i}">
    <div class="t-dot" style="border-color:${color}"></div>
    <div class="t-card ${isStar ? 'highlight' : ''} ${children.length ? 'has-substeps' : ''} ${hasSegmentCoords(item) && !isSection ? 'has-segmap' : ''} ${isSection ? 'is-section' : ''}">
      ${isSection
        ? `<div class="section-title">${esc(sectionTitle)}</div>`
        : `<div class="t-top">
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
      ${r.note ? `<div class="t-note warn">⚠️ ${esc(r.note)}</div>` : ''}`}
      ${!isSection && hasSegmentCoords(item) ? renderSegmentMapBlock(meta, item, i) : ''}
      ${renderSubstepsBlock(meta, i, children, currentIdx, subLabel)}
      ${isSection ? '' : `<div class="t-actions">
        <button class="btn-sm done-btn ${done ? 'is-done' : ''}" data-id="${id}">${done ? '✓ 已完成' : '标记完成'}</button>
      </div>`}
    </div>
  </div>`;
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
      window.__klUserScrolled = false;
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
  const groups = groupTimelineItems(items);
  let html = '';

  groups.forEach((group) => {
    if (group.kind === 'section') {
      const act = group.item['活动/站点'] || group.item['活动/分区'] || '';
      const title = act.replace(/━/g, '').trim();
      html += renderTimelineItem(meta, group.item, group.i, items, currentIdx, {
        children: group.children,
        sectionTitle: title,
      });
      return;
    }

    html += renderTimelineItem(meta, group.item, group.i, items, currentIdx, {
      children: group.children,
    });
  });

  tl.innerHTML = html;

  tl.querySelectorAll('.done-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (doneSet.has(id)) doneSet.delete(id);
      else doneSet.add(id);
      saveDone();
      renderFlow();
    });
  });

  tl.querySelectorAll('.substeps-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.expandKey;
      if (expandedSet.has(key)) expandedSet.delete(key);
      else expandedSet.add(key);
      saveExpanded();
      renderFlow();
    });
  });

  tl.querySelectorAll('.segment-map-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.segmapKey;
      if (!key) return;
      if (expandedSet.has(key)) expandedSet.delete(key);
      else expandedSet.add(key);
      saveExpanded();
      renderFlow();
    });
  });

  tl.querySelectorAll('.substeps-preview').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = el.closest('.substeps-block')?.querySelector('.substeps-toggle')?.dataset.expandKey;
      if (!key || expandedSet.has(key)) return;
      expandedSet.add(key);
      saveExpanded();
      renderFlow();
    });
  });

  if (currentIdx >= 0 && !window.__klUserScrolled) {
    const el = document.getElementById(`item-${currentIdx}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const routeFrom = manualRouteIdx != null ? manualRouteIdx : (currentIdx >= 0 ? currentIdx : 0);
  if (typeof updateFlowRoute === 'function') {
    updateFlowRoute(items, routeFrom, meta.key);
  }

  if (window.SegmentMaps) {
    requestAnimationFrame(() => {
      window.SegmentMaps.mountAll().catch(() => {});
    });
  }

  tl.querySelectorAll('.t-item, .substep-row').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.done-btn') || e.target.closest('.substeps-toggle') || e.target.closest('.segment-map-toggle') || e.target.closest('.segment-map-body')) return;
      const idx = el.dataset.idx;
      if (idx == null) return;
      manualRouteIdx = +idx;
      updateFlowRoute(items, manualRouteIdx, meta.key);
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  updateFab();
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
  document.getElementById('food-table').innerHTML = tableResponsive(trip.foodDist, cols, { titleCol: '餐厅' });

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
      <div class="table-wrap">${tableResponsive(sec.items, rankCols, { titleCol: '餐厅' })}</div>`).join('');
}

function renderMap() {
  const cols = ['序号', '地点名称', '类型', '备注', '优先级', '安排日期', '时段'];
  document.getElementById('map-table').innerHTML = tableResponsive(trip.mapList, cols, { titleCol: '地点名称' });
}

function renderBudget() {
  const rows = trip.budget.filter((b) => !b['可选']);
  const totalBudget = rows.reduce((s, r) => s + (+r['预算(¥)'] || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (+r['实际支付(¥)'] || 0), 0);
  const byDate = {};
  rows.forEach((r) => {
    const d = r['日期'];
    if (!d) return;
    if (!byDate[d]) byDate[d] = { budget: 0, paid: 0 };
    byDate[d].budget += +r['预算(¥)'] || 0;
    byDate[d].paid += +r['实际支付(¥)'] || 0;
  });

  document.getElementById('budget-summary').innerHTML = `
    <div class="stat-card">
      <div class="label">吉隆坡段预算合计</div>
      <div class="value">¥ ${fmtNum(totalBudget)}</div>
      <div class="sub">已支付 ¥ ${fmtNum(totalPaid || null)}</div>
    </div>
    ${Object.entries(byDate).map(([d, v]) => `
      <div class="stat-card">
        <div class="label">${esc(d)} 当日预算</div>
        <div class="value">¥ ${fmtNum(v.budget)}</div>
        <div class="sub">${v.paid ? `已支付 ¥ ${fmtNum(v.paid)}` : '待支付'}</div>
      </div>`).join('')}
  `;

  const cols = ['日期', '类别', '项目', '说明', '预算(¥)', '实际支付(¥)', '可选'];
  document.getElementById('budget-table').innerHTML = tableResponsive(trip.budget, cols, { moneyCols: ['预算(¥)', '实际支付(¥)'], titleCol: '项目' });

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
      <div class="label">7天全程预算合计</div>
      <div class="value">¥ ${fmtNum(totalRow['预算(¥)'])}</div>
      <div class="sub">已支付 ¥ ${fmtNum(totalRow['实际支付(¥)'])}</div>
    </div>` : ''}
    ${hintRow ? `<div class="stat-card">
      <div class="label">支付进度</div>
      <div class="value" style="font-size:1rem;line-height:1.4">${esc(hintRow['分类'])}</div>
    </div>` : ''}`;

  const cols = ['分类', '项目', '说明', '预算(¥)', '实际支付(¥)', '可选', '状态'];
  document.getElementById('full-budget-table').innerHTML = tableResponsive(detailRows, cols, { moneyCols: ['预算(¥)', '实际支付(¥)'], titleCol: '项目' });
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

function tableHtml(rows, cols, { moneyCols = [] } = {}) {
  const cell = (col, val) => {
    if (moneyCols.includes(col)) {
      return val == null || val === '' ? '—' : `¥ ${fmtNum(val)}`;
    }
    return esc(val ?? '—');
  };
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${cell(c, r[c])}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
}

function tableCell(col, val, moneyCols) {
  if (moneyCols.includes(col)) {
    return val == null || val === '' ? '—' : `¥ ${fmtNum(val)}`;
  }
  return esc(val ?? '—');
}

function tableResponsive(rows, cols, { moneyCols = [], titleCol } = {}) {
  const titleKey = titleCol || cols.find((c) => ['项目', '餐厅', '地点名称'].includes(c)) || cols[0];
  const desktop = tableHtml(rows, cols, { moneyCols });
  const mobile = `<div class="mob-cards">${rows.map((r) => `
    <article class="mob-card">
      <div class="mob-card-title">${tableCell(titleKey, r[titleKey], moneyCols)}</div>
      ${cols.filter((c) => c !== titleKey).map((c) => `
        <div class="mob-row">
          <span class="mob-k">${esc(c)}</span>
          <span class="mob-v">${tableCell(c, r[c], moneyCols)}</span>
        </div>`).join('')}
    </article>`).join('')}</div>`;
  return `<div class="table-responsive">${desktop}${mobile}</div>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scrollToCurrentItem() {
  const meta = DAY_META[currentDayIdx];
  const items = trip?.days[meta.key] || [];
  const { currentIdx } = getLiveStatus(meta.key, items);
  if (currentIdx < 0) return;
  const el = document.getElementById(`item-${currentIdx}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash-focus');
    setTimeout(() => el.classList.remove('flash-focus'), 1200);
  }
}

function updateFab() {
  const fab = document.getElementById('fab-jump');
  if (!fab) return;
  const flowActive = document.getElementById('view-flow')?.classList.contains('active');
  const live = document.getElementById('live-mode')?.checked;
  const meta = DAY_META[currentDayIdx];
  const items = trip?.days[meta.key] || [];
  const { currentIdx } = getLiveStatus(meta.key, items);
  fab.hidden = !(flowActive && live && currentIdx >= 0);
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  localStorage.setItem('kl-view', view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateFab();
  if (view === 'flow' && window.SegmentMaps) {
    setTimeout(() => window.SegmentMaps.refresh(), 120);
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

  document.querySelectorAll('.nav-item').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  document.getElementById('fab-jump')?.addEventListener('click', scrollToCurrentItem);

  let scrollTimer;
  window.addEventListener('scroll', () => {
    window.__klUserScrolled = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { window.__klUserScrolled = false; }, 8000);
  }, { passive: true });

  document.getElementById('live-mode').addEventListener('change', () => {
    manualRouteIdx = null;
    window.__klUserScrolled = false;
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

  const savedView = localStorage.getItem('kl-view');
  if (savedView && document.getElementById(`view-${savedView}`)) {
    switchView(savedView);
  }
}

init();
