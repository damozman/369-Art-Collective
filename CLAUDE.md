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

These are known and scheduled for Phase 0. Do not fix them ad hoc or treat them as
new findings.

1. **`server/lib/order-processor.ts:163-164`** — royalties are computed from
   **hardcoded placeholder costs** (`printifyCost = 15.00`, `shippingCost = 5.00`)
   rather than real Printify costs. Every royalty the system has ever calculated is
   wrong; low-priced items underpay by roughly 3x.
2. **Three conflicting royalty definitions.** `order-processor.ts` applies the
   percentage to net profit; `shared/financial-utils.ts` applies it to retail price;
   and the former's "profit" is derived from the fake costs above. Neither subtracts
   Stripe processing fees.
3. **No refund, chargeback, or clawback handling anywhere in the payout path.** If an
   order refunds after a contributor is paid, nothing happens. (Design: blueprint §8.)
4. **`artists.monthlySales` is a stored column** driving royalty tiers — a drift risk.
   Note the `influencers` table already does this correctly, with a comment explaining
   why: calculate by query, never store.

## Current status

- **Phase:** Phase 0 in progress — cut list 3 of 5 done.
- **Branch:** `claude/business-idea-feedback-7uwumw`
- **Archive:** `archive/pre-repositioning` holds the complete pre-cut codebase.
- **Resolved:** no money has ever flowed through the payout path and no artist has been
  paid, so the royalty fixes are **forward-only — no recalculation migration needed.**

### Phase 0 progress

**Done** (each removed separately, type-check clean after every step):
1. ✅ CreatorStack subsystem — 4 tables, buyer auth, webhook processor, 3 pages
2. ✅ AI art studio + credits — 3 tables, 6 routes, `ai-service.ts`, studio page
3. ✅ Influencer gamification — 5 tables, leaderboard/challenges/badges, achievement service

Since the cut began: `routes.ts` 6189→5443, `storage.ts` 3507→2650,
`schema.ts` 1225→832. Production build passes.

**Remaining, in this order** (ordering matters — these are coupled):
4. ⬜ **Featured rotation + artist subscription tiers, together.** `subscription-service.ts`
   calls `updateFeaturedStatusForTier()` and featured placement is sold as a tier perk;
   removing them separately means editing the same file twice.
5. ⬜ **Recruitment residuals + royalty unification, together.** `calculateRecruitmentBonus()`
   lives in `royalty-calculator.ts`, which the royalty rewrite replaces anyway.
   - Replace hardcoded costs with real Printify costs, **snapshotted at event time**
     (never looked up later — providers change prices without notice). Use the existing
     `getVariants()` / `getShipping()` in `server/lib/printify.ts`.
   - Collapse the three royalty definitions into one basis: **net after COGS, shipping,
     and processing fees.**
   - Put cost resolution behind an interface with a fixture-backed test implementation —
     cloud sandbox sessions cannot reach `api.printify.com`.

**Known deferred cleanup:** `financial-service.ts` and `AdminFinancialDashboard.tsx`
still carry hardcoded CreatorStack and AI-credit revenue projections. They type-check
because the figures are placeholders, not queries. Clear them during step 5, when
`financial-service.ts` is rewritten anyway. `email-service.ts` trial emails also still
reference the AI studio — fix during step 4 with the subscription work.

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
