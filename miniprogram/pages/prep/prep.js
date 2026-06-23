const tripStore = require('../../utils/trip-store');
const storage = require('../../utils/storage');

Page({
  data: { groups: [], title: '', subtitle: '' },

  onShow() {
    const app = getApp();
    const tripId = app.getCurrentTripId();
    const trip = tripStore.getTrip(tripId);
    if (!trip) {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    this._tripId = tripId;
    this._checked = storage.loadChecklist(tripId);
    const rows = trip.checklist?.rows || [];
    const groups = {};
    rows.forEach((row, idx) => {
      const type = row['类型'] || '其他';
      const cat = row['分类'] || '—';
      if (!groups[type]) groups[type] = {};
      if (!groups[type][cat]) groups[type][cat] = [];
      const id = `check::${idx}`;
      groups[type][cat].push({
        id,
        item: row['事项/物品'],
        when: row['何时/数量'],
        note: row['备注'],
        done: this._checked.has(id),
      });
    });
    const list = Object.keys(groups).map((type) => ({
      type,
      cats: Object.keys(groups[type]).map((cat) => ({
        cat,
        items: groups[type][cat],
      })),
    }));
    this.setData({
      title: trip.checklist?.title || '行前准备',
      subtitle: trip.checklist?.subtitle || '',
      groups: list,
    });
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    if (this._checked.has(id)) this._checked.delete(id);
    else this._checked.add(id);
    storage.saveChecklist(this._tripId, this._checked);
    this.onShow();
  },
});
