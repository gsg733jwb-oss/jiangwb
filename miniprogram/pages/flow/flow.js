const tripStore = require('../../utils/trip-store');
const core = require('../../utils/trip-core');
const storage = require('../../utils/storage');

Page({
  data: {
    tripId: '',
    title: '',
    subtitle: '',
    dayMeta: [],
    dayIdx: 0,
    dayHeading: '',
    daySub: '',
    progress: 0,
    live: true,
    groups: [],
    clock: '—',
  },

  onShow() {
    this.bootstrap();
  },

  bootstrap() {
    const app = getApp();
    let tripId = app.getCurrentTripId();
    const trip = tripStore.getTrip(tripId);
    if (!trip) {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    const dayMeta = core.buildDayMeta(trip);
    let dayIdx = this.data.dayIdx;
    if (dayIdx >= dayMeta.length) dayIdx = 0;
    const today = core.ymdInTz(trip.timezone);
    const todayIdx = dayMeta.findIndex((d) => d.date === today);
    if (todayIdx >= 0 && this._autoDay) dayIdx = todayIdx;
    this._trip = trip;
    this._done = storage.loadDone(tripId);
    this._expanded = storage.loadExpanded(tripId);
    this.setData({
      tripId,
      title: trip.title,
      subtitle: trip.subtitle,
      dayMeta,
      dayIdx,
    }, () => this.renderFlow());
    this.tickClock();
  },

  onLoad() {
    this._autoDay = true;
    this._timer = setInterval(() => this.tickClock(), 30000);
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },

  tickClock() {
    const trip = this._trip;
    if (!trip) return;
    const now = core.nowInTz(trip.timezone);
    const text = now.toLocaleString('zh-CN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    this.setData({ clock: text });
    if (this.data.live) this.renderFlow();
  },

  toggleLive() {
    this.setData({ live: !this.data.live }, () => this.renderFlow());
  },

  pickDay(e) {
    this._autoDay = false;
    this.setData({ dayIdx: Number(e.currentTarget.dataset.idx) }, () => this.renderFlow());
  },

  renderFlow() {
    const trip = this._trip;
    const { dayMeta, dayIdx, live, tripId } = this.data;
    const meta = dayMeta[dayIdx];
    if (!meta) return;
    const items = trip.days[meta.key] || [];
    const { currentIdx, progress } = core.getLiveStatus(trip, meta, items, live);
    const ov = (trip.overview || []).find((o) => o['日期'] === meta.date);
    const groups = core.groupTimelineItems(items).map((g) => this.serializeGroup(g, meta, items, currentIdx, tripId, live));
    this.setData({
      dayHeading: `Day ${meta.num} · ${meta.label}`,
      daySub: ov ? `${ov['住宿'] || ''} · ${ov['核心活动'] || ''}` : '',
      progress,
      groups,
      currentIdx,
    });
  },

  serializeGroup(group, meta, items, currentIdx, tripId, live) {
    const isSection = group.kind === 'section';
    const main = group.item;
    const r = core.getRow(main);
    const color = core.TYPE_COLORS[r.type] || '#64748b';
    const mainId = `${meta.key}::${group.i}`;
    const children = (group.children || []).map(({ item, i }) => {
      const cr = core.getRow(item);
      return {
        i,
        id: `${meta.key}::${i}`,
        ...cr,
        color: core.TYPE_COLORS[cr.type] || '#64748b',
        isNow: live && i === currentIdx,
      };
    });
    const expandKey = `${meta.key}::${group.i}`;
    const subOpen = this._expanded.has(expandKey) || children.some((c) => c.isNow) || group.i === currentIdx;
    const hasMap = !!(r.from || r.to);
    const mapOpen = this._expanded.has(`map::${expandKey}`);
    return {
      kind: group.kind,
      i: group.i,
      mainId,
      isSection,
      sectionTitle: isSection ? String(r.act).replace(/━/g, '').trim() : '',
      ...r,
      color,
      isNow: live && (group.i === currentIdx || children.some((c) => c.isNow)),
      done: this._done.has(mainId),
      children,
      childCount: children.length,
      subOpen,
      hasMap,
      mapOpen,
      expandKey,
      mapKey: `map::${expandKey}`,
    };
  },

  toggleDone(e) {
    const id = e.currentTarget.dataset.id;
    if (this._done.has(id)) this._done.delete(id);
    else this._done.add(id);
    storage.saveDone(this.data.tripId, this._done);
    this.renderFlow();
  },

  toggleSub(e) {
    const key = e.currentTarget.dataset.key;
    if (this._expanded.has(key)) this._expanded.delete(key);
    else this._expanded.add(key);
    storage.saveExpanded(this.data.tripId, this._expanded);
    this.renderFlow();
  },

  toggleMap(e) {
    const key = e.currentTarget.dataset.key;
    if (this._expanded.has(key)) this._expanded.delete(key);
    else this._expanded.add(key);
    storage.saveExpanded(this.data.tripId, this._expanded);
    this.renderFlow();
  },

  openMap(e) {
    const from = e.currentTarget.dataset.from || '';
    const to = e.currentTarget.dataset.to || '';
    wx.navigateTo({
      url: `/pages/map-route/map-route?tripId=${this.data.tripId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    });
  },

  goHome() {
    wx.navigateTo({ url: '/pages/home/home' });
  },
});
