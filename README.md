# Singapore HDB resale price check

A free, static website that gives an indicative price range for an HDB resale flat from recent
registered sales. It runs entirely in the visitor's browser: no server, no database, no login.

- **Method:** similarity-weighted comparables (recency, floor, remaining lease, floor area) from the
  last 12 months of resale transactions, widened to 24 or 36 months if there are few.
- **Accuracy (backtest, 800 unseen sales, May-Jul 2026, each estimated using only earlier months):**
  median error **5.0%** vs **9.0%** for a plain town-and-type median; the 25-75% range covered 48.5% of
  actual prices. Reproduce with `node scripts/backtest.mjs path/to/hdb_resale.csv`.
- **Limits:** no block-level, view or condition information. Indicative only; not a valuation and not
  financial advice.

## Data and licence

Contains information from HDB Resale Flat Prices accessed from data.gov.sg, made available under the
[Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence). This project is
independent and is not endorsed by HDB or any Singapore Government agency. Any product built from the
data must keep this notice conspicuous.

## Files

- `index.html` - the page (also the whole UI).
- `src/estimator.js` - the algorithm, shared by the page and the tests. Deterministic.
- `data/hdb-recent.json` - last 36 months, compact. Rebuilt automatically.
- `scripts/build-data.mjs` - downloads the dataset from data.gov.sg and rebuilds the JSON.
- `scripts/backtest.mjs` - the accuracy test.
- `.github/workflows/refresh-data.yml` - rebuilds the data twice a month. GitHub disables scheduled
  workflows in a repository with no activity for 60 days; if the data date on the page stops moving,
  re-enable it under the repository's Actions tab.

## Publishing (GitHub Pages)

Repository Settings -> Pages -> Deploy from a branch -> `main` / root. The site appears at
`https://<user>.github.io/sg-hdb-estimator/`.

## Demand test analytics

GitHub does not report visits to a Pages site. Create a free [GoatCounter](https://www.goatcounter.com)
site and put its address in the commented snippet near the top of `index.html`. The page records one
event each time someone gets an estimate. GoatCounter's free plan is for non-commercial use; switch
before charging for anything.

## For AI agents

Everything is public and deterministic: fetch `data/hdb-recent.json` and `src/estimator.js` and run
`estimate()` locally. See `llms.txt`.

## Code licence

Not yet chosen.
