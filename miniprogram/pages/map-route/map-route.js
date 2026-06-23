const tripStore = require('../../utils/trip-store');
const { resolvePlaceByLabel } = require('../../utils/places');

Page({
  data: {
    markers: [],
    polyline: [],
    center: { latitude: 3.12, longitude: 101.68 },
    scale: 12,
    label: '',
  },

  onLoad(query) {
    const tripId = query.tripId || getApp().getCurrentTripId();
    const fromLabel = decodeURIComponent(query.from || '');
    const toLabel = decodeURIComponent(query.to || '');
    const places = tripStore.getPlaces(tripId);
    const from = resolvePlaceByLabel(places, fromLabel);
    const to = resolvePlaceByLabel(places, toLabel);
    const markers = [];
    const points = [];

    if (from) {
      markers.push({
        id: 1,
        latitude: from.lat,
        longitude: from.lng,
        title: fromLabel,
        width: 24,
        height: 24,
        callout: { content: `起 ${fromLabel}`, display: 'ALWAYS', padding: 6, borderRadius: 6 },
      });
      points.push({ latitude: from.lat, longitude: from.lng });
    }
    if (to) {
      markers.push({
        id: 2,
        latitude: to.lat,
        longitude: to.lng,
        title: toLabel,
        width: 24,
        height: 24,
        callout: { content: `落 ${toLabel}`, display: 'ALWAYS', padding: 6, borderRadius: 6 },
      });
      points.push({ latitude: to.lat, longitude: to.lng });
    }

    let center = this.data.center;
    let scale = 14;
    if (points.length === 1) center = points[0];
    if (points.length === 2) {
      center = {
        latitude: (points[0].latitude + points[1].latitude) / 2,
        longitude: (points[0].longitude + points[1].longitude) / 2,
      };
      const span = Math.max(
        Math.abs(points[0].latitude - points[1].latitude),
        Math.abs(points[0].longitude - points[1].longitude),
      );
      scale = span > 2 ? 5 : span > 0.5 ? 10 : 14;
    }

    const polyline = points.length === 2 ? [{
      points,
      color: '#4d9fffAA',
      width: 4,
      dottedLine: true,
    }] : [];

    this.setData({
      markers,
      polyline,
      center,
      scale,
      label: [fromLabel, toLabel].filter(Boolean).join(' → '),
    });

    if (!markers.length) {
      wx.showToast({ title: '未匹配坐标', icon: 'none' });
    }
  },
});
