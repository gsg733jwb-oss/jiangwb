const { tripOrHome } = require('../../utils/page-trip');

Page({
  data: { rows: [], summary: '' },
  onShow() {
    const trip = tripOrHome(this);
    if (!trip) return;
    const fb = trip.fullBudget || {};
    this.setData({
      rows: fb.rows || [],
      summary: fb.subtitle || '',
      title: fb.title || '预算',
    });
  },
});
