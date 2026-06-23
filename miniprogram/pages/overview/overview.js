const { tripOrHome } = require('../../utils/page-trip');

Page({
  data: { cards: [] },
  onShow() {
    const trip = tripOrHome(this);
    if (!trip) return;
    const cards = (trip.overview || []).filter((o) => o['日期'] !== '—').map((o) => ({
      date: o['日期'],
      week: o['星期'],
      theme: o['主题'],
      hotel: o['住宿'],
      activity: o['核心活动'],
      note: o['重要提醒'],
    }));
    this.setData({ cards });
  },
});
