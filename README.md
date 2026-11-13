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

## How buyers are decided

- Tradewater projects are those with "Tradewater" in the project name or proponent.
- For each retirement, the buyer is the beneficiary if one is recorded, otherwise the registry account holder.
- Names are cleaned so "Aledade, Inc" and "Aledade, Inc." count as one buyer.
- `scripts/intermediaries.json` lists name fragments flagged as likely marketplaces or traders. It is a guess. Edit it and rebuild.

## Known limits

- About 59% of retired credits have no buyer recorded and about 14% were retired from Tradewater's own account.
- A retirement is a credit used by a buyer, not a sale by Tradewater. The data has no prices, deal stages or contacts.
- Projects without "Tradewater" in the name or proponent are not included.

## Data terms

Data is from CarbonPlan OffsetsDB (see its terms: https://carbonplan.org/terms). Registries may have their own terms on this data.
