(function () {
  const flightLine = /^([A-Z0-9]{2})\s?(\d{3,4})\b/;
  const timeLine = /^(\d{2}:\d{2})(?:\+1天)?$/;
  const priceLine = /¥\s*([\d,]+)/;

  function looksLikeAirline(text) {
    return /航|Air|Jetstar|Scoot|亚航|长途/i.test(text);
  }

  function isAirlineLine(line) {
    if (!line || line.length > 40 || line.length < 2) return false;
    if (/^\d|¥|机场|航站楼|小时|分钟|周[一二三四五六日]|境内|查看|订票|多个机场|更多选择|所有机场/.test(line)) {
      return false;
    }
    if (timeLine.test(line)) return false;
    const inline = line.match(/^(.+?)\s+([A-Z0-9]{2})\s?(\d{3,4})\b$/);
    if (inline) return looksLikeAirline(inline[1]);
    if (flightLine.test(line)) return false;
    return looksLikeAirline(line);
  }

  function parseFlightBlock(i, airline, flightNo, lines, timeStart) {
    let dep = "";
    let arr = "";
    let price = 0;
    let duration = "";
    const block = lines.slice(i, i + 14).join(" ");

    if (/中转|经停|转\d|停留/.test(block)) return null;

    const times = [];
    for (let j = timeStart; j < Math.min(i + 12, lines.length); j++) {
      const lineJ = lines[j];
      if (j > timeStart && (isAirlineLine(lineJ) || /^[A-Z0-9]{2}\s?\d{3,4}\b/.test(lineJ))) {
        break;
      }
      const t = lineJ.match(timeLine);
      if (t) times.push(t[1]);
      const p = lines[j].match(priceLine);
      if (p && !price) price = Number(p[1].replace(/,/g, ""));
      const d = lines[j].match(/(\d+小时\d+分|\d+小时|\d+分)/);
      if (d && !duration) duration = d[1];
      if (times.length >= 2 && price) break;
    }

    if (times.length < 2 || !price) return null;
    dep = times[0];
    arr = times[1];

    return {
      airline,
      flight_no: flightNo,
      dep_time: dep,
      arr_time: arr,
      price,
      duration,
    };
  }

  const directBtn = Array.from(document.querySelectorAll("button, a, span, div")).find(
    (el) => (el.innerText || "").trim() === "直飞"
  );
  if (directBtn) directBtn.click();

  for (let step = 0; step < 6; step += 1) {
    window.scrollTo(0, (document.body.scrollHeight / 6) * (step + 1));
  }
  window.scrollTo(0, document.body.scrollHeight);

  const lines = (document.body.innerText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(/^(.+?)\s+([A-Z0-9]{2})\s?(\d{3,4})\b$/);
    if (inline && looksLikeAirline(inline[1])) {
      const row = parseFlightBlock(i, inline[1].trim(), inline[2] + inline[3], lines, i + 1);
      if (row) rows.push(row);
      continue;
    }

    if (!isAirlineLine(line)) continue;

    const airline = line;
    const next = lines[i + 1] || "";
    const flightMatch = next.match(flightLine);
    if (!flightMatch) continue;

    const row = parseFlightBlock(i, airline, flightMatch[1] + flightMatch[2], lines, i + 2);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => a.price - b.price || a.dep_time.localeCompare(b.dep_time));

  const seen = new Set();
  const uniq = [];
  for (const row of rows) {
    const key = `${row.flight_no}|${row.dep_time}|${row.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(row);
    if (uniq.length >= 30) break;
  }

  const pageText = document.body.innerText || "";
  const countMatch = pageText.match(/共\d+个航班[，,]\s*(\d+)个直飞/);
  const directCount = countMatch ? Number(countMatch[1]) : null;
  const lowestMatch = pageText.match(/¥\s*([\d,]+)\s*起/);

  return JSON.stringify({
    flights: uniq,
    direct_count: directCount,
    lowest_hint: lowestMatch ? Number(lowestMatch[1].replace(/,/g, "")) : null,
    updated_at: (pageText.match(/\*最近更新时间:\s*([^\n]+)/) || [])[1] || "",
    page_len: pageText.length,
    has_direct_label: /个直飞/.test(pageText),
    has_price: /¥/.test(pageText),
  });
})();
