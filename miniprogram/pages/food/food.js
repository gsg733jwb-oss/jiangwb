const { tripOrHome } = require('../../utils/page-trip');

Page({
  data: { rows: [], restaurants: [] },
  onShow() {
    const trip = tripOrHome(this);
    if (!trip) return;
    this.setData({
      rows: trip.foodDist || [],
      restaurants: (trip.restaurants || []).filter((r) => r['安排日'] && !String(r['安排日']).includes('备选')),
    });
  },
});
