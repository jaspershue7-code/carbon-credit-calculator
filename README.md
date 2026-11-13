# Tradewater buyer finder

A static website that shows which companies have retired credits from Tradewater projects, built from CarbonPlan's OffsetsDB.

## Open the site

Double-click `site/index.html`. No server or install needed.

## Rebuild the data

1. Download and unzip `offsets-db.csv.zip` from CarbonPlan into its own empty folder.
2. Run: `node scripts/build-data.mjs <that folder>`
3. This rewrites `site/data.js`.

## Pages

- **Buyers:** who retired credits from Tradewater projects, with a profile per company.
- **Partners:** the buyers flagged as marketplaces, traders or programs, with volume by year and typical days between retirements.
- **Competitor buyers:** companies that retired the same credit types (ozone depleting substances, HFC reclamation, oil and gas wells) from other proponents' projects but have no retirement from a Tradewater project in this data.

- **Portfolio:** Tradewater's 112 projects with credits issued, retired and remaining by project, vintage and year, from the Berkeley database (v2026-08, through 2026-08-31).

To rebuild the portfolio page: `node scripts/build-portfolio.mjs <path to the Berkeley xlsx>`. This rewrites `site/portfolio.js`. The Berkeley file is not stored in this repo.

## How buyers are decided

- Tradewater projects are those with "Tradewater" in the project name or proponent.
- For each retirement, the buyer is the beneficiary if one is recorded, otherwise the registry account holder.
- Names are cleaned so "Aledade, Inc" and "Aledade, Inc." count as one buyer.
- `scripts/intermediaries.json` lists name fragments flagged as likely marketplaces or traders. It is a guess. Edit it and rebuild.

## Known limits

- About 59% of retired credits have no buyer recorded and about 14% were retired from Tradewater's own account.
- Most of the "no buyer" credits (3.30M) were retired on 1 November of 2018, 2021 and 2022. That matches California compliance deadlines, but the data does not say so.
- A retirement is a credit used by a buyer, not a sale by Tradewater. The data has no prices, deal stages or contacts.
- Projects are selected by "Tradewater" in the name or proponent, plus the IDs in `scripts/extra-tradewater-projects.json` (currently ACR670, "TWRS 2", whose developer is Tradewater in the Berkeley data). Other missed projects are possible.

## Data accuracy checks

Run `node scripts/audit-data.mjs <CarbonPlan csv folder> <Berkeley xlsx>` to cross-check both sources. On the August 2026 files it found:

- **Different retirement totals:** CarbonPlan (to 2026-06-01) shows 6,469,637 credits retired on 109 projects. Berkeley (to 2026-08-31) shows 6,850,102 on 112 projects. Of the gap, 329,772 is on California compliance projects, where Berkeley counts retirements CarbonPlan lacks, and 50,693 is on other projects, probably newer retirements. Issued credits agree on every matched project.
- **Cancelled credits:** 1,027,894 credits on 10 projects are cancelled in CarbonPlan but counted as remaining by Berkeley.
- **Compliance dates differ:** both sources show the same 1,147,724 credit lump, dated 2018-11-01 by CarbonPlan and 2017 by Berkeley. Five CarbonPlan retirements dated 2022-11-01 fall before their project's first issuance, so those dates are approximate. Year charts on the Portfolio page (Berkeley) and the buyer pages (CarbonPlan) can disagree.
- **Not fixable:** 9 retirement rows (301,640 credits) have no date, and 11 pairs of small identical rows could be real or duplicates. They are left as they are.
- **Fixed:** "TWRS 2" (ACR670) was missed by the name match and is now included. Spellings such as "Aledade, Inc" and "Aledade, Inc." are merged.

## Data terms

Buyer, partner and competitor pages use CarbonPlan OffsetsDB (see its terms: https://carbonplan.org/terms). Registries may have their own terms on this data.

The portfolio page uses the Voluntary Registry Offsets Database, released under CC BY 4.0. Cite as: Pamela Quartson, Barbara K Haya, Tyler Bernard, Aline Abayo, Xinyun Rong, Ivy S So, Micah Elias. (2026). Voluntary Registry Offsets Database v2026-08, Berkeley Carbon Trading Project, University of California, Berkeley. https://gspp.berkeley.edu/berkeley-carbon-trading-project/offsets-database

## About

My name is Jasper Shue. The REC is super cool.
