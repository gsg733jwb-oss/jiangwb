const tripStore = require('./utils/trip-store');

App({
  globalData: {
    currentTripId: '',
  },

  onLaunch() {
    const last = wx.getStorageSync('currentTripId');
    const manifest = tripStore.getManifest();
    const fallback = manifest.defaultTripId || (manifest.trips[0] && manifest.trips[0].id);
    this.globalData.currentTripId = last || fallback || '';
  },

  setCurrentTripId(tripId) {
    this.globalData.currentTripId = tripId;
    wx.setStorageSync('currentTripId', tripId);
  },

  getCurrentTripId() {
    return this.globalData.currentTripId || wx.getStorageSync('currentTripId') || '';
  },
});
