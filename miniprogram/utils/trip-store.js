const manifest = require('../data/manifest.json');
const allTrips = require('../data/all-trips.json');
const allPlaces = require('../data/all-places.json');

function getManifest() {
  return manifest;
}

function listTrips() {
  return manifest.trips || [];
}

function getTrip(tripId) {
  return allTrips[tripId] || null;
}

function getPlaces(tripId) {
  return allPlaces[tripId] || [];
}

function getMeta(tripId) {
  return (manifest.trips || []).find((t) => t.id === tripId) || null;
}

module.exports = {
  getManifest,
  listTrips,
  getTrip,
  getPlaces,
  getMeta,
};
