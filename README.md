# Tradewater sales tool

A static website that supports a Tradewater carbon credit seller's weekly work: outreach, nurturing, account management, open deals, content and events. It combines the seller's own entries with public registry data (CarbonPlan OffsetsDB and the Berkeley Voluntary Registry Offsets Database).

## Open the site

Double-click `site/index.html`. No server or install needed.

## Pages

The front page and the briefing pages (from the registry data):

- **Overview:** a written briefing on Tradewater's portfolio with numbered, annotated charts (credits retired per year, credits remaining by vintage) and a summary of how Tradewater compares with other developers. Numbers and sentences are computed from the data on load.
- **Insights:** who else sells these credits. For each of the three Berkeley project types Tradewater works in, developers ranked by credits issued, plus Tradewater against everyone else over time. Types are Berkeley's labels, so other refrigerant project types are not counted.

Work pages (your own entries), under the **My work** menu:

- **This week:** a quick-add bar at the top (deal, target, call or event, press Enter), lead cards from the registry data with a peek at each company's history and an add button, and buttons on every row (log a touch, snooze, set a next step, mark a step or call done). When nothing is entered yet it shows only the add bar and the lead cards. Below that: open deals with no next step, an overdue next step or no contact for a while; companies due for a touch; customers and partners that usually retire credits this month or next; events in the next 60 days; recent retirements in the data; touches logged in the last 7 days against a goal you set.
- **Lead ranking:** two ranked lists, new targets (named companies that retired the same credit types from other developers) and repeat customers (named companies that already retired Tradewater credits). Each score out of 100 is a weighted sum of six signals (size, recent activity, repeat buying, credit type fit, vintage fit, timing), and "Why this score" shows every signal. Marketplaces, traders and developers of the same project types are left out. Weights are sliders, and a panel compares the signals of your won and lost deals once there are 5 outcomes. Weights never change on their own. It is a ranking of fit, not a prediction. Defaults I chose: recency tiers of 90 days, one year and two years, and a vintage counts as in stock when Tradewater has 100,000 or more credits left in it. Most vintages from 2018 to 2026 qualify, so the vintage signal mainly separates buyers of older vintages.
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

## Share it as a link

The site is plain files in the `site` folder, with no build step, so any static host works. Cloudflare Pages and Netlify are both free and can deploy from a private GitHub repo. Button names may differ slightly from these steps.

- **Cloudflare Pages:** Workers and Pages, Create, Pages, Connect to Git, choose this repo. Leave the build command empty and set the output directory to `site`. Save and deploy, then copy the `pages.dev` link.
- **Netlify:** Add new site, Import an existing project, choose this repo. Leave the build command empty and set the publish directory to `site` (`netlify.toml` already says so).

Every push to `main` redeploys the site, including the daily data refresh below.

Notes:
- Anyone with the link can open it. Password protection is a paid feature on both hosts. The pages ask search engines not to index them, but that does not make the link private.
- Each person's deals, contacts and events stay in their own browser. They are not shared between people, and they are not in the repo.
- The data on the pages is public registry data. Registries may have their own terms (see Data terms below).

## Daily data refresh

`.github/workflows/refresh-data.yml` runs every day at about 06:23 UTC and can also be started by hand from the Actions tab. It runs `node scripts/refresh-data.mjs`, which:

1. Asks CarbonPlan and Berkeley whether their files changed, without downloading them. CarbonPlan's file has a fixed address. Berkeley's address contains the version, so the script reads the newest link from Berkeley's page.
2. If something changed, downloads both, rebuilds `site/data.js` and `site/portfolio.js`, and checks the result (project counts, totals, version and date, and no more than a 30% drop in Tradewater credits issued).
3. Keeps the new files only if the checks pass. Otherwise it restores the old files and the job shows as failed, which also sends you a GitHub email.
4. The workflow saves a commit only when files changed, and the host redeploys.

Run it yourself with `node scripts/refresh-data.mjs` (add `--dry-run` to only look, `--force` to rebuild anyway, or `--cp-zip` and `--xlsx` to use local files). `scripts/source-state.json` records which versions were last used.

Things that can stop it: Berkeley changing its page or file layout (the job fails and keeps the old data), a source being down, or GitHub pausing scheduled jobs on a quiet repo. Check the Actions tab now and then. The sources may update rarely: on 2026-11-12 CarbonPlan's file was still dated 2026-06-01.

## Company labels

Companies flagged as likely marketplaces, traders or program operators are listed in `scripts/intermediaries.json`. They were checked on 2026-11-12 against company websites and news by a research assistant, with a spot check of two by hand. Treat the result as a starting point, not proof.

- **Reseller or marketplace (checked):** Patch, Cool Effect, Wren, Climate Impact Partners (also develops projects), 3Degrees (also develops projects), Bonneville Environmental Foundation, CNaught, CEEZER (the TradeCo entity itself was not confirmed), Rubicon Carbon Services, Karbon-X, Carbonzero, Restitution Brands (Terrapass), PDI Technologies (runs offset programs for fleet customers; its page does not say it retires the credits itself).
- **Broker or trader:** STX Commodities, BGC Environmental Brokerage Services and Morgan Stanley Capital Group. The last two rest on search summaries because the primary pages did not load.
- **Only partly right or unconfirmed:** Watershed (mainly carbon accounting software, with a credit marketplace as a side offering), First Climate Markets (develops and sells), Carbon Financial Services and ClearBlue Asset Management (no reliable source found), REMOVALL (may be a project developer), and "Climate Heroes" (a program name in registry notes; the owner was not found).
- **Not marketplaces:** Just Energy, SouthStar and Interstate Gas Supply are energy retailers, Shell Energy and NRG Power Marketing are power marketers (low confidence), and Range Resources is an end buyer. They stay in the buyer lists.

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
