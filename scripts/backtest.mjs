// Backtest of the SAME estimator the website runs. Uses the full CSV for history, but each
// estimate only sees months strictly before the sale's month (no leakage).
// Usage: node scripts/backtest.mjs path/to/hdb_resale.csv
import fs from "node:fs";
import { makeIndex, estimate, idxToMonth } from "../src/estimator.js";
import { parseRows } from "./build-data.mjs";

const csv = process.argv[2];
if (!csv) { console.error("Usage: node scripts/backtest.mjs path/to/hdb_resale.csv"); process.exit(1); }
const data = parseRows(fs.readFileSync(csv, "utf8"));
const index = makeIndex(data);
const from = index.latestIdx - 5, to = index.latestIdx - 3;
const pool = data.rows.filter((r) => r[0] >= from && r[0] <= to);
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const sample = [...pool].sort(() => rand() - 0.5).slice(0, 800);

const apeM = [], apeB = [];
let inRange = 0;
for (const [m, t, ty, storey, area, rem, price] of sample) {
  const town = data.towns[t], type = data.types[ty];
  try {
    const e = estimate(index, { town, flatType: type, floorAreaSqm: area, storey: storey ?? undefined, remainingLeaseYears: rem, asOfMonthIdx: m });
    apeM.push(Math.abs(e.estimate - price) / price);
    if (price >= e.low && price <= e.high) inRange++;
    const base = (index.byKey.get(`${town}|${type}`) ?? []).filter((x) => x.m < m && x.m >= m - 12).map((x) => x.price).sort((a, b) => a - b);
    if (base.length) apeB.push(Math.abs(base[Math.floor(base.length / 2)] - price) / price);
  } catch { /* skipped */ }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const within = (a, t) => a.filter((x) => x <= t).length / a.length;
const pct = (x) => (x * 100).toFixed(1) + "%";
console.log(`Test months ${idxToMonth(from)}..${idxToMonth(to)}  n=${apeM.length}`);
console.log(`MODEL    median APE ${pct(med(apeM))}  mean ${pct(mean(apeM))}  within10% ${pct(within(apeM, 0.1))}  within5% ${pct(within(apeM, 0.05))}`);
console.log(`BASELINE median APE ${pct(med(apeB))}  mean ${pct(mean(apeB))}  within10% ${pct(within(apeB, 0.1))}  within5% ${pct(within(apeB, 0.05))}`);
console.log(`25-75% range coverage ${pct(inRange / apeM.length)}`);
