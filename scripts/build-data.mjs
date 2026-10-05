// Builds data/hdb-recent.json (last 36 months, compact) from the official data.gov.sg HDB resale
// dataset (Singapore Open Data Licence v1.0). Usage:
//   node scripts/build-data.mjs                 -> downloads the CSV from data.gov.sg
//   node scripts/build-data.mjs path/to.csv     -> uses a local copy (for testing)
// Also exports parseRows() for the backtest script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { monthToIdx } from "../src/estimator.js";

const DATASET = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "hdb-recent.json");
const KEEP_MONTHS = 36;

export function normalizeFlatType(raw) {
  const s = raw.trim().toUpperCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  const d = /^(\d)\s*(?:ROOMS?|RMS?|R)?$/.exec(s);
  if (d) return `${d[1]} ROOM`;
  if (s.startsWith("EXEC")) return "EXECUTIVE";
  if (s.startsWith("MULTI")) return "MULTI-GENERATION";
  return s;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function remainingYears(text, leaseStart, monthIdx) {
  const m = /(\d+)\s*years?(?:\s*(\d+)\s*months?)?/i.exec(text ?? "");
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  return leaseStart + 99 - monthIdx / 12;
}

/** Returns { towns, types, rows } for ALL rows in the CSV text. */
export function parseRows(text) {
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const c = (n) => header.indexOf(n);
  const ix = { month: c("month"), town: c("town"), type: c("flat_type"), storey: c("storey_range"),
    area: c("floor_area_sqm"), lease: c("lease_commence_date"), rem: c("remaining_lease"), price: c("resale_price") };
  if (Object.values(ix).some((v) => v < 0)) throw new Error("Unexpected CSV header: " + lines[0]);
  const towns = [], types = [], rows = [];
  const tIdx = new Map(), yIdx = new Map();
  const id = (map, arr, v) => { let i = map.get(v); if (i === undefined) { i = arr.length; arr.push(v); map.set(v, i); } return i; };
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = splitCsvLine(lines[i]);
    const price = Number(f[ix.price]);
    const area = Number(f[ix.area]);
    if (!(price > 0) || !(area > 0)) continue;
    const m = monthToIdx(f[ix.month]);
    const st = /(\d+)\s*TO\s*(\d+)/i.exec(f[ix.storey] ?? "");
    rows.push([
      m,
      id(tIdx, towns, f[ix.town].toUpperCase()),
      id(yIdx, types, normalizeFlatType(f[ix.type])),
      st ? (Number(st[1]) + Number(st[2])) / 2 : null,
      area,
      Math.round(remainingYears(f[ix.rem], Number(f[ix.lease]), m) * 100) / 100,
      price,
    ]);
  }
  return { towns, types, rows };
}

async function loadCsvText(localPath) {
  if (localPath) return fs.readFileSync(localPath, "utf8");
  const init = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/initiate-download`);
  const url = (await init.json())?.data?.url;
  if (!url) throw new Error("data.gov.sg returned no download URL");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

async function main() {
  const text = await loadCsvText(process.argv[2]);
  const all = parseRows(text);
  if (all.rows.length < 100000) throw new Error(`Refusing to build: only ${all.rows.length} rows parsed`);
  const latest = all.rows.reduce((mx, r) => (r[0] > mx ? r[0] : mx), 0);
  const rows = all.rows.filter((r) => r[0] > latest - KEEP_MONTHS);
  const y = Math.floor(latest / 12), m = (latest % 12) + 1;
  const out = {
    source: "HDB Resale Flat Prices, data.gov.sg (Singapore Open Data Licence v1.0)",
    dataThrough: `${y}-${String(m).padStart(2, "0")}`,
    towns: all.towns, types: all.types, rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${rows.length} rows (through ${out.dataThrough}) to ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
