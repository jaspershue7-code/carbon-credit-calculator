# Tradewater sales tool

A static website that supports a Tradewater carbon credit seller's weekly work: outreach, nurturing, account management, open deals, content and events. It combines the seller's own entries with public registry data (CarbonPlan OffsetsDB and the Berkeley Voluntary Registry Offsets Database).

## Open the site

Double-click `site/index.html`. No server or install needed.

## Pages

Work pages (your own entries):

- **This week:** open deals with no next step, an overdue next step or no contact for a while; companies due for a touch; customers and partners that usually retire credits this month or next; events in the next 60 days; recent retirements in the data; touches logged in the last 7 days against a goal you set.
- **Targets:** companies you want to reach, with people, planned channel (warm intro, LinkedIn comment, LinkedIn message, cold email, conference), touch log and next touch date. Suggestions come from the registry data.
- **Accounts:** customers and partners, linked to their registry record to show their usual buying month.
- **Deals:** stages from initial meeting to closed, a next step and due date on each deal, and a dated log.
- **Content:** LinkedIn post drafts built from the data, a monthly newsletter draft, email and message templates (cold email, warm intro, follow-up, nudge, event, proposal outline) that fill in known details, and a library of due diligence answers you write.
- **Events:** who is going, outreach status for each, sessions to attend, and a checklist for before and after.
- **Calendar:** a month view, an agenda and a "Reminders now" list. It collects calls and meetings (with a time), events, deal next steps and next touch dates. Each item has a "Remind me" setting (on the day, 1 day, 3 days or 1 week before, default 1 day). The nav link shows how many reminders are due, and This week lists them at the top. Reminders show only when the tool is open. There is no email, phone or pop-up alert.
- **Settings:** backup, restore, CSV import and review thresholds.

Market data pages (from the registries): Buyers, Partners, Competitor buyers and Portfolio. Each profile has buttons to add the company to your targets or accounts.

## Where your entries are stored

In the browser only (localStorage). They are not sent anywhere and are not in this repository. Export a backup from Settings regularly. Clearing browser data erases them, and a different browser or computer starts empty. Open the site from the same place each time, because the browser ties entries to the address.

Nothing is pre-filled. Import deals or companies from a spreadsheet with Settings, using CSV columns listed there.

## Rebuild the registry data

1. Download and unzip `offsets-db.csv.zip` from CarbonPlan into its own empty folder.
2. Run: `node scripts/build-data.mjs <that folder>`. This rewrites `site/data.js`.
3. For the Portfolio page: `node scripts/build-portfolio.mjs <Berkeley xlsx> <CarbonPlan folder>`. This rewrites `site/portfolio.js`. The CarbonPlan folder is optional and adds the cross-check notes.

## How buyers are decided

- Tradewater projects are those with "Tradewater" in the project name or proponent, plus the IDs in `scripts/extra-tradewater-projects.json` (currently ACR670, "TWRS 2", whose developer is Tradewater in the Berkeley data).
- For each retirement, the buyer is the beneficiary if one is recorded, otherwise the registry account holder.
- Names are cleaned so "Aledade, Inc" and "Aledade, Inc." count as one buyer.
- `scripts/intermediaries.json` lists name fragments flagged as likely marketplaces or traders. It is a guess. Edit it and rebuild.

## Known limits

- The data has no prices, deal stages or contacts. People, mutual connections and LinkedIn details must be typed in. The tool does not read LinkedIn.
- About 59% of retired credits have no buyer recorded and about 14% were retired from Tradewater's own account.
- Most of the "no buyer" credits (3.30M) were retired on 1 November of 2018, 2021 and 2022. That matches California compliance deadlines, but the data does not say so.
- A retirement is a credit used by a buyer, not a sale by Tradewater.
- The registry data is a snapshot (CarbonPlan to 2026-06-01, Berkeley to 2026-08-31). "Recent retirements" is not today's news.
- Other missed Tradewater projects are possible.
- Defaults I chose, which you can change in Settings: nurture again after 60 days (from "every couple of months") and a deal is quiet after 14 days.

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
