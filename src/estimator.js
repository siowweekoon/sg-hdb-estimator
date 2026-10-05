// Shared by the website (browser) and the test scripts (Node). No dependencies.
// Same algorithm as the backtested Agent Companion implementation (src/property/fairValue.ts).

export function monthToIdx(month) {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function idxToMonth(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export class EstimateError extends Error {}

/** data = { towns: string[], types: string[], rows: [monthIdx, townIdx, typeIdx, storeyMid, areaSqm, remainingYears, price][] } */
export function makeIndex(data) {
  const byKey = new Map();
  let latestIdx = 0;
  for (const [m, t, ty, storey, area, rem, price] of data.rows) {
    const key = `${data.towns[t]}|${data.types[ty]}`;
    let arr = byKey.get(key);
    if (!arr) byKey.set(key, (arr = []));
    arr.push({ m, storey, area, rem, price });
    if (m > latestIdx) latestIdx = m;
  }
  return { byKey, latestIdx, towns: data.towns, types: data.types };
}

function weightedQuantile(values, q) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let cum = 0;
  for (const x of sorted) {
    cum += x.w;
    if (cum >= q * total) return x.v;
  }
  return sorted[sorted.length - 1].v;
}

const gauss = (diff, scale) => Math.exp(-((diff / scale) ** 2));

/** input: { town, flatType, floorAreaSqm?, storey?, remainingLeaseYears?, asOfMonthIdx? } */
export function estimate(index, input) {
  const town = String(input.town ?? "").trim().toUpperCase();
  const flatType = String(input.flatType ?? "").trim().toUpperCase();
  const pool = index.byKey.get(`${town}|${flatType}`);
  if (!pool || pool.length === 0) throw new EstimateError(`No transactions found for ${town} ${flatType}.`);
  const asOf = input.asOfMonthIdx ?? index.latestIdx + 1;
  const notes = [];

  let windowMonths = 12;
  let comps = [];
  for (const w of [12, 24, 36]) {
    comps = pool.filter((r) => r.m < asOf && r.m >= asOf - w);
    windowMonths = w;
    if (comps.length >= 15) break;
  }
  if (comps.length < 5) throw new EstimateError("Too few recent sales for this town and flat type to estimate reliably.");
  if (windowMonths > 12) notes.push(`Few recent sales, so the comparison window was widened to the last ${windowMonths} months.`);

  const hasArea = Number.isFinite(input.floorAreaSqm);
  const hasStorey = Number.isFinite(input.storey);
  const hasLease = Number.isFinite(input.remainingLeaseYears);

  const scored = comps.map((r) => {
    let w = Math.exp(-(asOf - r.m) / 6);
    if (hasStorey && Number.isFinite(r.storey)) w *= gauss(r.storey - input.storey, 6);
    if (hasLease) w *= gauss(r.rem - input.remainingLeaseYears, 8);
    if (hasArea) w *= gauss(r.area - input.floorAreaSqm, 10);
    const value = hasArea ? (r.price / r.area) * input.floorAreaSqm : r.price;
    return { r, w: Math.max(w, 1e-6), value };
  });
  const vals = scored.map((s) => ({ v: s.value, w: s.w }));
  const top = [...scored]
    .sort((a, b) => b.w - a.w)
    .slice(0, 5)
    .map((s) => ({
      month: idxToMonth(s.r.m), storey: s.r.storey, areaSqm: s.r.area,
      remainingYears: Math.round(s.r.rem * 10) / 10, price: s.r.price,
    }));
  if (!hasStorey) notes.push("Storey not given: higher floors usually sell for more.");
  if (!hasLease) notes.push("Remaining lease not given: shorter leases usually sell for less.");

  const r1000 = (x) => Math.round(x / 1000) * 1000;
  return {
    estimate: r1000(weightedQuantile(vals, 0.5)),
    low: r1000(weightedQuantile(vals, 0.25)),
    high: r1000(weightedQuantile(vals, 0.75)),
    comparablesUsed: comps.length,
    windowMonths,
    dataThrough: idxToMonth(index.latestIdx),
    topComparables: top,
    notes,
  };
}
