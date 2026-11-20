# Tradewater credit tracker

A static website that shows who retires carbon credits, built from public registry data. Open `site/index.html` (no server or install needed).

## What it does

Five tabs. Search is the home page, with an "In the news" summary that opens the News tab.

| Tab | What you can do |
|---|---|
| **Search** | Type a company or a developer name. Companies show every credit retirement on their behalf (Tradewater and other developers) and the intermediaries involved. Developers (competitors) show their customers and intermediaries. |
| **Customers** | Every Tradewater credit retired on behalf of a company, how many, and when, for this month, quarter, year or all time, plus an intermediaries table. |
| **Watchlist** | Save target companies with the ☆ next to any company, or paste a list of names. See all their retirements in one table, with a "new" flag for retirements that were not there at your last visit. |
| **News** | Recent headlines on the carbon credit market, filtered by topic or by headlines that name a company on your watchlist. |
| **Data** | The source and its link, each registry and its link, and how old each is. |

Every table has a **Download CSV** button.

## News

`scripts/refresh-news.mjs` runs in the daily GitHub job and writes `site/news.js` from Google News RSS searches (topics and search terms are at the top of the script). It keeps only the headline, publisher, date and link. Google states its RSS feeds are for personal, non-commercial feed-reader use, so check that this fits how Tradewater will use the tool before sharing it widely. Watchlist matching is a whole-word name match, so a short or common name can match the wrong company. If the news step fails, the job still finishes and the old headlines stay.

## Limits to know

- **Data age.** CarbonPlan publishes when it chooses. The snapshot on the Data page is the freshness that counts. "This month" is empty when the snapshot is older than the month.
- **Notifications.** The site has no server, so it cannot email anyone. The watchlist flags new retirements and shows a count on its nav link, only while the site is open.
- **Unnamed credits.** About 59% of Tradewater credits retired have no company named in the registry, and about 14% were retired from Tradewater's own account. Those are not listed per company.
- **Intermediaries.** A registry record usually names either the intermediary or the end customer, rarely both, so few customers show an intermediary. The intermediary list is my judgment (see below).
- **Project types.** Only Ozone Depleting Substances, HFC Reclamation and Oil + Gas Well projects are covered, so a company's history here is its history on those types.
- **Developer names.** The registry gives a developer name for only some projects. Where it is blank, the project name is used with a trailing year or version removed, so one company can appear under more than one name.
- **Retirement is not sale.** A retirement is a credit used by a buyer, not a sale by Tradewater.

## Where your entries are stored

The watchlist is saved in the browser only (localStorage). It is not sent anywhere and not in this repository. A different browser or computer starts empty, and clearing browser data erases it.

## Data

Source: CarbonPlan OffsetsDB (https://carbonplan.org/research/offsets-db, terms at https://carbonplan.org/terms). It collects records from Verra, American Carbon Registry and Climate Action Reserve (the registries that hold Tradewater-type projects). Registries may have their own terms on this data.

- Tradewater projects are those with "Tradewater" in the project name or proponent, plus the IDs in `scripts/extra-tradewater-projects.json`.
- A retirement's company is the beneficiary if one is recorded, otherwise the registry account holder. Names are cleaned so "Aledade, Inc" and "Aledade, Inc." count as one.
- `scripts/intermediaries.json` lists name fragments flagged as likely marketplaces or traders. It was checked against company websites on 2026-11-12, with some entries unconfirmed. Treat it as a starting point. Edit it and rebuild.

### Rebuild by hand

1. Download and unzip `offsets-db.csv.zip` from CarbonPlan into its own empty folder.
2. Run `node scripts/build-data.mjs <that folder>`. This rewrites `site/data.js`.

### Daily refresh

`.github/workflows/refresh-data.yml` runs every day and can be started by hand from the Actions tab. It runs `node scripts/refresh-data.mjs`, which checks CarbonPlan and Berkeley for changes, rebuilds `site/data.js` only when something changed, checks the result, and keeps the old files if the checks fail (the job then shows as failed). It also rebuilds `site/portfolio.js` from the Berkeley Voluntary Registry Offsets Database. No page uses that file now, but the job still downloads Berkeley and needs the file to exist.

Run it yourself with `node scripts/refresh-data.mjs` (add `--dry-run` to only look, or `--force` to rebuild anyway). `scripts/source-state.json` records which versions were last used.

## Share it as a link

The site is plain files in `site`, with no build step, so any static host works (Cloudflare Pages or Netlify, connected to this GitHub repo, output directory `site`). Every push to `main` redeploys. Anyone with the link can open it. The pages ask search engines not to index them, which does not make the link private.

## About

Built by Jasper Shue as a sales tool for Tradewater's carbon credit work, using public registry data.
