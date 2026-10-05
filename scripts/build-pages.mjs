// Generates the crawlable static pages from data/hdb-recent.json:
//   prices.html  - median resale price by town and flat type (last 12 months)
//   sitemap.xml  - for search engines
// Run after build-data.mjs (the monthly workflow does both).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { idxToMonth } from "../src/estimator.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://siowweekoon.github.io/sg-hdb-estimator/";
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "hdb-recent.json"), "utf8"));

const latest = data.rows.reduce((mx, r) => (r[0] > mx ? r[0] : mx), 0);
const cells = new Map(); // "town|type" -> prices
for (const [m, t, ty, , , , price] of data.rows) {
  if (m <= latest - 12) continue;
  const key = `${data.towns[t]}|${data.types[ty]}`;
  (cells.get(key) ?? cells.set(key, []).get(key)).push(price);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const cols = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"];
const sgd = (n) => "S$" + Math.round(n / 1000).toLocaleString("en-US") + "k";
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const through = idxToMonth(latest);

const body = [...data.towns].sort().map((town) => {
  const tds = cols.map((c) => {
    const p = cells.get(`${town}|${c}`);
    return p && p.length >= 5 ? `<td>${sgd(median(p))}<br><small>${p.length} sales</small></td>` : "<td>-</td>";
  }).join("");
  return `<tr><th scope="row">${title(town)}</th>${tds}</tr>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HDB resale prices by town: median price, last 12 months (through ${through})</title>
<meta name="description" content="Median HDB resale price by town and flat type for the last 12 months, from official registered sales through ${through}.">
<link rel="canonical" href="${SITE}prices.html">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px 16px;color:#1d2430}
table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border-bottom:1px solid #dde2ea;text-align:right}th:first-child,td:first-child{text-align:left}
thead th{color:#5b6575;font-weight:500}small{color:#5b6575}.n{color:#5b6575;font-size:.85rem}</style></head>
<body>
<h1>HDB resale prices by town</h1>
<p>Median resale price by town and flat type over the last 12 months, using registered sales through ${through}.
Want a range for a specific flat? <a href="${SITE}">Use the price check</a>, which adjusts for floor, size and remaining lease.</p>
<table><thead><tr><th>Town</th>${cols.map((c) => `<th>${title(c)}</th>`).join("")}</tr></thead>
<tbody>
${body}
</tbody></table>
<p class="n">Medians are over all sales of that flat type in the town, so they mix different floors, sizes and leases. A dash means fewer than 5 sales. Statistical summary of past sales; not a valuation, not financial advice.</p>
<p class="n">Contains information from HDB Resale Flat Prices accessed from <a href="https://data.gov.sg">data.gov.sg</a>, made available under the terms of the <a href="https://data.gov.sg/open-data-licence">Singapore Open Data Licence version 1.0</a>. This site is independent and is not endorsed by HDB or any Singapore Government agency.</p>
</body></html>
`;
fs.writeFileSync(path.join(ROOT, "prices.html"), html);

const lastmod = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${lastmod}</lastmod></url>
  <url><loc>${SITE}prices.html</loc><lastmod>${lastmod}</lastmod></url>
</urlset>
`);
console.log(`Wrote prices.html (${data.towns.length} towns, through ${through}) and sitemap.xml`);
