function normalizeLabel(label) {
  return String(label || '').trim().replace(/[,，\s]+$/g, '').toLowerCase();
}

function resolvePlaceByLabel(places, label) {
  if (!label || !places.length) return null;
  const text = normalizeLabel(label);
  for (const p of places) {
    if (normalizeLabel(p.name) === text) return p;
  }
  let best = null;
  let bestScore = 0;
  for (const p of places) {
    const name = normalizeLabel(p.name);
    if (text.includes(name) || name.includes(text)) {
      if (name.length > bestScore) {
        bestScore = name.length;
        best = p;
      }
    }
    for (const kw of p.keywords || []) {
      const kl = kw.toLowerCase();
      if ((text.includes(kl) || kl.includes(text)) && kl.length > bestScore) {
        bestScore = kl.length;
        best = p;
      }
    }
  }
  return best;
}

module.exports = {
  resolvePlaceByLabel,
};
