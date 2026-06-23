function key(tripId, suffix) {
  return `tg::${tripId}::${suffix}`;
}

function loadSet(tripId, suffix) {
  const raw = wx.getStorageSync(key(tripId, suffix));
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveSet(tripId, suffix, set) {
  wx.setStorageSync(key(tripId, suffix), [...set]);
}

function loadExpanded(tripId) {
  return loadSet(tripId, 'expanded');
}

function saveExpanded(tripId, set) {
  saveSet(tripId, 'expanded', set);
}

function loadDone(tripId) {
  return loadSet(tripId, 'done');
}

function saveDone(tripId, set) {
  saveSet(tripId, 'done', set);
}

function loadChecklist(tripId) {
  return loadSet(tripId, 'checklist');
}

function saveChecklist(tripId, set) {
  saveSet(tripId, 'checklist', set);
}

module.exports = {
  loadExpanded,
  saveExpanded,
  loadDone,
  saveDone,
  loadChecklist,
  saveChecklist,
};
