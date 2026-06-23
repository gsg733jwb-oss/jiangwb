const tripStore = require('../../utils/trip-store');

Page({
  data: {
    trips: [],
    activeId: '',
  },

  onShow() {
    const app = getApp();
    const manifest = tripStore.getManifest();
    this.setData({
      trips: tripStore.listTrips(),
      activeId: manifest.activeTripId || manifest.defaultTripId || '',
      currentId: app.getCurrentTripId(),
    });
  },

  openTrip(e) {
    const tripId = e.currentTarget.dataset.id;
    const app = getApp();
    app.setCurrentTripId(tripId);
    wx.switchTab({ url: '/pages/flow/flow' });
  },

  goFlow() {
    const app = getApp();
    const id = app.getCurrentTripId();
    if (!id) {
      wx.showToast({ title: '请先选择行程', icon: 'none' });
      return;
    }
    wx.switchTab({ url: '/pages/flow/flow' });
  },
});
