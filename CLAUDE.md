# CLAUDE.md

Standing context for this repository. Read before acting.

## Read this first

**`docs/BLUEPRINT.md` is the canonical plan.** Read it before proposing any
architectural or product direction. This file is the summary; the blueprint is the
authority. If the two ever disagree, the blueprint wins and this file needs updating.

## What this project is

**Today:** `369ACP26` is a print-on-demand art marketplace — artists upload work, an
admin approves it, products are auto-created in Shopify via Printify, orders come back
by webhook, tiered royalties are calculated, and artists are paid through Stripe
Connect. Built ~Nov 2025 – May 2026, then idle.

**What it is becoming:** a vertical-agnostic **revenue-split and payout platform**. The
marketplace is being retired as a business; the payout pipeline underneath it is the
product. Print-on-demand becomes the first vertical, not the whole thing.

**Why:** the marketplace has no defensible position — generative AI collapsed the cost
of art supply, and the codebase invested entirely in supply-side acquisition with
essentially nothing on demand. The pipeline underneath (attribution → cost resolution →
split calculation → immutable ledger → Connect payouts) is genuinely hard software that
thousands of businesses currently do in spreadsheets.

**Do not** propose growing the marketplace, adding artist-acquisition features, or
reviving the cut list below. That direction was evaluated and rejected with reasons —
see `docs/BLUEPRINT.md` §2 and §10.

## Ratified decisions — settled, do not re-litigate

Reopening any of these is a redesign, not a tweak. If you believe one is wrong, say so
explicitly and wait for the user rather than quietly building around it.

1. **Never hold funds.** Tenants connect their own Stripe; we calculate and instruct.
   Custody would make this money transmission. This gates most of the architecture.
2. **Contributors get a login** in Phase 1 — self-serve earnings visibility is the
   core trust differentiator.
3. **Shopify is adapter #1.** CSV statement import is adapter #2. (Rationale and
   alternatives considered: blueprint §1a.)
4. **369 Art Collective stays live as tenant #1**, radically scoped down. It is the
   test tenant, *not* the MVP. The engine is the MVP. (Spec: blueprint §1b.)
5. **No free tier.** Paid from day one, 14-day trial.
6. **Currency code stored on every amount**; USD-only support in Phase 1.
7. **No tenant-authored formula code, ever.** Structured rules only.
8. **Naming/branding** is deferred until the App Store listing.

## Known defects — real, documented, do not "discover" and panic

All four are known. Do not fix them ad hoc or treat them as new findings — **and note
which phase each belongs to.** The two Phase 0 defects are now **fixed**; the two
Phase 1 defects remain open and must not be attempted early, because both change the
ledger model that Phase 1 exists to build.

**Phase 0 — FIXED in step 5. Left here as history; do not "rediscover" them:**

1. ~~`server/lib/order-processor.ts:163-164` hardcoded costs~~ — fixed. **But the
   file was dead code.** The webhook actually called `server/lib/financials.ts`
   (flat 36.9% of price-minus-assumed-40%-COGS, shipping hardcoded to zero). Both
   files are gone; the live path is now `order-processor.ts` rewritten around a
   `CostResolver`.
2. ~~Three conflicting royalty definitions~~ — there were **five**
   (`financials.ts`, `order-processor.ts`, `shared/financial-utils.ts`,
   `royalty-calculator.ts`, and a *sales-count* ladder in `payout-service.ts`).
   All collapsed into `server/lib/royalty.ts`: **net after COGS, shipping and
   processing fees**, with the tier ladder living once in
   `shared/financial-utils.ts`.

**Phase 1 — engine core, *not* Phase 0:**

3. **No refund, chargeback, or clawback handling anywhere in the payout path.** If an
   order refunds after a contributor is paid, nothing happens. Blueprint §8 specifies
   this as **"required from Phase 1"**, and §9 lists reversal handling under Phase 1.
   Retrofitting it changes the ledger model itself, so it lands with the ledger, not
   before it.
4. **`artists.monthlySales` is a stored column** driving royalty tiers — a drift risk.
   This is **§5 decision #4** (immutable ledger; never store balances, derive by
   query), and Phase 1 is defined as honoring all fourteen §5 decisions. The
   `influencers` table already does it correctly, with a comment explaining why.

(A third inconsistency surfaced during step 4 — the 40% rung throwing against a
validator that only allowed 30/35/45, plus the vestigial `FREE/PRO/ELITE` naming.
Both were resolved in step 5.)

## Current status

- **Phase:** ✅ **Phase 0 complete.** All five cut-list steps done, and all four of
  blueprint §9's Phase 0 bullets closed.
- **Next:** Phase 1 — engine core. Canonical `RevenueEvent`, rules engine, immutable
  ledger, reversal handling, multi-tenant from the first migration. This is where the
  actual product gets built; Phase 0 was the smallest phase by a wide margin.
- **Money has still never flowed through the payout path**, so the royalty fixes
  remain **forward-only — no recalculation migration needed.**
- **Track A is still the real critical path** (§9, §15) and is invisible from this
  repo: Shopify Partner account, Stripe Connect platform application, App Store
  competitive research, design-partner outreach, and getting 369 selling again for
  real refund data. All marked Day 1; **none has any status recorded here.** If you
  are picking this up, ask before assuming they are underway.
- **Branch:** `claude/business-idea-feedback-7uwumw`
- **Archive:** `archive/pre-repositioning` holds the complete pre-cut codebase.

### ⚠️ The one thing blocking real money

**The cost fixtures are invented numbers.** `server/lib/__fixtures__/printify-costs.ts`
is interpolated from an undated table, and its variant and print-provider IDs are
placeholders, not live catalog IDs. Sandbox sessions cannot reach `api.printify.com`,
so they could not be verified here.

The calculation is proven; the *inputs* are not. Before anyone is paid:

1. Run `PrintifyCostResolver` locally with real credentials already in `.env.local`.
2. Replace the fixture values and the placeholder IDs with what comes back.
3. Re-run `npm test` — the assertions encode the arithmetic, not the prices, so they
   should still pass with real numbers substituted.

Until then the resolver factory refuses to invent costs: without `PRINTIFY_API_TOKEN`
and without `ALLOW_FIXTURE_COSTS=true`, **every line item is held for review and
nothing is paid.** That is deliberate. No royalty is better than a wrong one.

### Phase 0 progress

**Done** (each removed separately, type-check clean after every step):
1. ✅ CreatorStack subsystem — 4 tables, buyer auth, webhook processor, 3 pages
2. ✅ AI art studio + credits — 3 tables, 6 routes, `ai-service.ts`, studio page
3. ✅ Influencer gamification — 5 tables, leaderboard/challenges/badges, achievement service
4. ✅ Featured placement + artist subscription tiers — see below

Since the cut began: `routes.ts` 6189→4663, `storage.ts` 3507→1981,
`schema.ts` 1225→720, `email-service.ts` 2503→1447. Production build passes.

**What step 4 removed.** There turned out to be *two* featured products, both cut:
the homepage featured-artist rotation (`featured-artists-service.ts` + four artist
columns), and the $99/mo paid featured-**testimonial** placement with merit top-5
rotation (`featured_subscriptions`, `featured_rotation_log`, Stripe checkout).
Testimonials survive as plain admin-curated content on the `featured` boolean.
Subscription tiers took `subscription-service.ts`, the trial services and the whole
`server/email-templates/` directory (all four templates were trial emails) with them.

Three decisions made during step 4, all reversible:

- **Upscaling was kept, its quota flattened.** Every artist now gets the same
  allowance (3 registration + 5/month, the old free-tier numbers); the job queue is
  FIFO. Upscaling is now the only AI feature left and the only paid third-party
  dependency (Replicate) outside the payout path — **its fate is still an open
  question**, deliberately deferred rather than decided.
- **The 20-artwork cap now applies to everyone** rather than gating a paid upgrade.
- **Royalties come from the performance tier alone.** `getRoyaltyTierPercentage()`
  lost its subscription-minimum arm. (The conflicting definitions were reconciled in
  step 5; `getRoyaltyTierPercentage()` itself is gone.)

**5. ✅ Recruitment residuals + royalty unification.** What step 5 actually did:

**New modules** (all covered by `npm test` — 43 tests, no network, no database):

| File | Purpose |
|---|---|
| `server/lib/money.ts` | Integer minor units. String-exact decimal parsing (float parsing loses cents non-deterministically), half-away-from-zero rounding, largest-remainder `allocate()` |
| `server/lib/cost-resolver.ts` | `CostResolver` interface + `PrintifyCostResolver` + `FixtureCostResolver` |
| `server/lib/cost-resolver-factory.ts` | Picks the resolver; **refuses to invent costs** unless `ALLOW_FIXTURE_COSTS=true` |
| `server/lib/royalty.ts` | The one royalty definition |
| `server/lib/sku-catalog.ts` | SKU → Printify blueprint/provider/variant. **This bridge did not exist**, which is a large part of why the cost was a hardcoded constant |
| `server/lib/__fixtures__/printify-costs.ts` | Fixture costs — see the warning above |

**Deleted:** `server/lib/financials.ts`, `server/lib/royalty-calculator.ts`.

**Schema.** `orders` gained a cost snapshot in minor units (`gross_minor`,
`production_minor`, `shipping_minor_amount`, `processing_fee_minor`, `net_minor`,
`currency`, `cost_source`, `cost_resolved_at`, `cost_resolution_error`) plus
`shopify_line_item_id`; `sales` gained `net_minor`, `base_royalty_minor`,
`referral_bonus_minor`, `total_earnings_minor`, `currency`. Legacy `decimal` columns
are still written **from** the minor-unit values so existing reads keep working —
migrating off them is Phase 1.

**Three design decisions worth knowing, all reversible:**

- **Unresolvable cost ⇒ `status: 'needs_review'`, no sale row, nothing owed.** Never
  a fallback estimate. An unpaid line that is held can be fixed; a royalty paid on an
  invented cost cannot be, once the money is gone.
- **Payout is now pure summation.** `payout-service.ts` lost its recalculate-at-payout
  fallback, which silently overwrote what a contributor was told they had earned. A
  royalty is decided once, at event time.
- **Loss-making lines floor at zero rather than going negative.** The negative net is
  still recorded on the order so the loss stays visible.

**Also fixed, found in passing** (both live, both would have cost real money):

- The Shopify webhook called the order processor **twice per delivery**.
- `orders.shopify_order_id` was UNIQUE while one row is written per *line item*, so
  **any order with two artworks lost its second line.** Now unique on
  `(shopify_order_id, shopify_line_item_id)`, which is also the idempotency key.

**Both previously-noted inconsistencies are resolved:** the 40% rung no longer throws
(one ladder feeds both the payout and the validator), and `FREE/PRO/ELITE` are gone.

**Verified beyond type-check and build** (per the step-3 lesson below): ran the app
against local Postgres, processed a two-line order end-to-end through real storage,
confirmed the snapshot columns persist and that the admin financial dashboard,
empire, and payouts pages all render. Fee apportionment reconciled by hand:
$118.00 order → $3.72 fee (2.9% + one 30¢), split 60¢/312¢.

**Recruitment residuals removed** from the royalty path, payout processor, admin
routes, and both client pages. `artists.referredBy`, `artist_referrals`, and the
`recruitment_bonus(es)` columns are **retained as vestigial** for attribution history
— nothing computes a payment from them.

**Vestigial, intentionally left:** `upscale_usage.tier` and `elite_unlimited` in
`upscaleQuotaTypeEnum`; `artists.referredBy`, the `artist_referrals` table, and the
`recruitment_bonus`/`recruitment_bonuses` columns. All kept so historical rows stay
readable. Nothing writes them, and nothing computes a payment from them.

**Still deferred, deliberately:** upscaling's fate (see step 4) is still open.

## Working agreements

- **Decisions live in the repo, not in chat.** Sessions do not share memory across
  surfaces (web / VS Code / CLI). Anything concluded in conversation must be written
  to `docs/BLUEPRINT.md` or this file before the session ends, or it is lost and the
  next session will contradict it.
- **Update this file when status changes** — phase, branch, open questions.
- **Money is never a float.** New money columns are integer minor units with a
  currency code. (Existing `decimal` columns are legacy, migrating in Phase 1.)
- **Ledgers are append-only.** Never store a balance; derive it.
- Do not open pull requests unless the user explicitly asks.
- Prefer honest pushback over agreement. The user has asked for it directly and the
  plan has improved because of it.

## Stack and commands

TypeScript throughout. React + Vite + Wouter + TanStack Query + shadcn/Tailwind on the
client; Express on the server; Drizzle ORM against Postgres (Neon/Supabase); Stripe +
Stripe Connect; Shopify Admin API; Printify; Resend for email.

```bash
npm run dev       # Express + Vite, reads .env.local
npm run build     # vite build
npm run db:push   # drizzle-kit push
```

**Credentials required** for the payout path to run: `DATABASE_URL`,
`PRINTIFY_API_TOKEN`, `SHOPIFY_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`. Not present in
cloud sandboxes — verification of money-affecting changes must happen where they are.

### Handling credentials — standing rule

**Never ask the user to paste a secret into chat, and never accept one there.** A key
in a transcript persists indefinitely and is effectively leaked. Secrets belong in
`.env.local` on the user's machine (gitignored) or in the cloud environment's secret
configuration. If a task appears to need a key in conversation, the task is wrong.

**Money-affecting work therefore splits in two:**

1. **In the sandbox (me):** build it and prove it against fixtures. This is why
   blueprint §9 requires cost resolution behind an interface with a fixture-backed
   test implementation — cloud sessions are network-allowlisted and cannot reach
   `api.printify.com` no matter what credentials exist.
2. **Locally (the user):** run the same code with real credentials already in
   `.env.local` and compare against the fixture expectations.

When something disagrees, **the user pastes the output, never the keys.** Ask for the
computed numbers, the log lines, or the diff — all of which are safe to share.

## Navigating this repo — read before searching

Only ~240 of 1,131 tracked files are source. **71% of the repo is `attached_assets/`,
and 650 files are images.** Searching blind is slow and, worse, returns stale results.

**Where real code lives:**

| Path | What |
|---|---|
| `shared/schema.ts` | 38 Drizzle tables — the data model, start here |
| `server/routes.ts` | 142 endpoints (large; read by range, not whole) |
| `server/lib/` | services — payouts, Stripe, Printify, Shopify, royalties |
| `server/storage.ts` | data access layer (large) |
| `client/src/pages/` | routes/screens |
| `config/` | pricing JSON |
| `docs/BLUEPRINT.md` | the canonical plan |

**Do not search these** unless the task is explicitly about them:

- `attached_assets/**` — 804 files, mostly screenshots and generated images
- `attached_assets/backups/**` — **stale duplicates.** Contains a dozen dated copies of
  `247-art.css` / `247-art.js` / `247-art-product.liquid`. Reading one of these instead
  of the live theme file is a real and repeated failure mode. Live theme files are in
  `attached_assets/theme/`.
- `server/*.bak`, `server/*.backup`, `server/storage.ts.FINAL_RESCUE.bak` — dead copies
- `server/scripts/**` — ~70 one-off operational scripts, mostly obsolete. Useful as
  reference for API usage patterns, misleading as current architecture.
- `docs/legacy/**`, `docs/PROJECT_SUMMARY.md` — describes a much earlier version of this
  system and contradicts current reality. Do not treat as current.

Prefer `Grep` with a `glob` filter (e.g. `--glob '*.ts'`) over broad searches, and
read large files by line range.

## Looking at the running app

Do not ask the user to screenshot the UI — take the screenshot and read it back.

```bash
node scripts/screenshot.mjs http://localhost:5000 /tmp/home.png
node scripts/screenshot.mjs http://localhost:5000/artist/dashboard /tmp/d.png --full
node scripts/screenshot.mjs http://localhost:5000 /tmp/m.png --width=390 --height=844
```

Then `Read` the PNG. The script also reports console errors. Requires
`npm i -D playwright && npx playwright install chromium` (skip the install in the
cloud sandbox — Chromium is preinstalled at `PLAYWRIGHT_BROWSERS_PATH`).

`.mcp.json` also registers the Playwright MCP server for multi-step interaction
(clicking through flows, filling forms). Use the script for "what does it look like,"
the MCP server for "walk through this flow."

**Network note:** cloud sandbox sessions are restricted to an allowlist — general web
access and `WebFetch` against arbitrary domains will fail there. Local sessions have
normal network access.

### Running the app in a cloud sandbox

You can do this, and you should — a type-check and a build will not tell you the app
still works. Postgres 16 is installed. `initdb` refuses to run as root, so run it as
the `postgres` user and keep the data directory somewhere that user can reach:

```bash
export PGDATA=/var/lib/postgresql/tmpdata
mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -A trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -o '-p 55432' -l $PGDATA/server.log start"
psql -h 127.0.0.1 -p 55432 -U postgres -c "create database art369;"
```

Then write a `.env.local` with `DATABASE_URL=postgres://postgres@127.0.0.1:55432/art369`
and a `SESSION_SECRET`, run `npx drizzle-kit push --force`, and `npm run dev`. Startup
seeds an artist and an admin (`admin@369artcollective.com` / `Admin369AC`). The
Printify/Shopify/Stripe paths still cannot run — only the UI and the DB-backed routes.

**Two traps when doing this:**

- `server/vite.ts:36` calls `process.exit(1)` from the vite logger's `error` handler,
  and vite forwards *client-side* console errors to it. A benign React warning from
  the shadcn sidebar therefore kills the dev server the moment the artist dashboard
  renders. Comment out that `process.exit(1)` while you work; don't commit it.
- Start the server with the Bash tool's `run_in_background`, not a shell `&` — a
  backgrounded shell job is killed when the tool call returns.

**Lesson from step 3.** `bf1ca38` deleted 19 unrelated routes from `client/src/App.tsx`
as collateral while removing two. Nothing caught it: every page component was still
imported, so `tsc` and `vite build` both passed while every `/artist/*` and `/admin/*`
URL served the 404 page. Restored in `f298354`. **Green type-check and build are not
evidence the app works — load the pages.**
