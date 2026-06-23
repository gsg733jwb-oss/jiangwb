const tripStore = require('../../utils/trip-store');

function tripOrHome(page) {
  const app = getApp();
  const tripId = app.getCurrentTripId();
  const trip = tripStore.getTrip(tripId);
  if (!trip) {
    wx.reLaunch({ url: '/pages/home/home' });
    return null;
  }
  page.setData({ tripId, title: trip.title });
  return trip;
}

module.exports = { tripOrHome };
