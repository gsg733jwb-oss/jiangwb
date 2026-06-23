const TYPE_COLORS = {
  餐饮: '#f97316',
  交通: '#3b82f6',
  景点: '#22c55e',
  酒店: '#a855f7',
  乐园: '#06b6d4',
  购物: '#eab308',
  休闲: '#94a3b8',
  项目: '#94a3b8',
  步行: '#94a3b8',
};

function buildDayMeta(trip) {
  const keys = Object.keys(trip.days || {}).sort();
  return keys.map((key, idx) => {
    const m = key.match(/^(\d+)-(\d+)月(\d+)日$/);
    let date = '';
    let label = key;
    let num = idx + 1;
    if (m) {
      num = Number(m[1]);
      const year = (trip.dateStart || '2026-01-01').slice(0, 4);
      date = `${year}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
      label = `${m[2]}/${m[3]}`;
    }
    return { key, num, date, label };
  });
}

function getRow(item) {
  return {
    act: item['活动/站点'] || item['活动/分区'] || '',
    loc: item['地点/地址'] || item['地点'] || '',
    type: item['类型'] || '',
    time: item['时段'] || '',
    transport: item['交通'] || '',
    duration: item['时长'] || '',
    cost: item['费用(RM)'] || '',
    detail: item['详细说明'] || '',
    rec: item['推荐/必做'] || '',
    note: item['注意事项'] || '',
    from: item['坐标起'] || '',
    to: item['坐标落'] || '',
  };
}

function isDivider(item) {
  const act = item['活动/站点'] || item['活动/分区'] || '';
  return act && String(act).includes('━━');
}

function itemPriority(item) {
  const v = item['显示'];
  if (v == null || v === '') return 1;
  return Number(v) || 1;
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

function nowInTz(timezone) {
  const s = new Date().toLocaleString('en-US', { timeZone: timezone || 'Asia/Shanghai' });
  return new Date(s);
}

function ymdInTz(timezone) {
  const n = nowInTz(timezone);
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function getLiveStatus(trip, dayMeta, items, live) {
  if (!live || !dayMeta) return { currentIdx: -1, progress: 0 };
  const tz = trip.timezone || 'Asia/Shanghai';
  const now = nowInTz(tz);
  const ref = new Date(`${dayMeta.date}T00:00:00`);
  if (ymdInTz(tz) !== dayMeta.date) {
    if (trip.dateStart && trip.dateEnd) {
      const start = new Date(`${trip.dateStart}T00:00:00`);
      const end = new Date(`${trip.dateEnd}T23:59:59`);
      if (now < start) return { currentIdx: -1, progress: 0 };
      if (now > end) return { currentIdx: items.length, progress: 100 };
    }
    return { currentIdx: -1, progress: 0 };
  }

  let currentIdx = -1;
  const actionable = [];
  items.forEach((item, i) => {
    if (isDivider(item)) return;
    const { time } = getRow(item);
    const range = parseTimeRange(time, ref);
    if (range) {
      actionable.push({ i, ...range });
      if (now >= range.start && now < range.end) currentIdx = i;
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

module.exports = {
  TYPE_COLORS,
  buildDayMeta,
  getRow,
  isDivider,
  groupTimelineItems,
  getLiveStatus,
  nowInTz,
};
