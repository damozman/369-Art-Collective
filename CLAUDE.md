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

- **Phase:** Phase 0 not yet started. Blueprint ratified.
- **Branch:** `claude/business-idea-feedback-7uwumw`
- **Committed so far:** documentation only. No code changed.
- **Open question to the user:** is there historical payout data that needs
  reconciling? Fixing the cost placeholders changes what artists are owed, so this
  determines whether Phase 0 needs a recalculation migration or only a forward fix.

### Phase 0 scope (next work)
1. Replace hardcoded costs with real Printify API costs, **snapshotted at event time**
   (never looked up later — providers change prices without notice).
2. Collapse the three royalty definitions into one canonical basis: **net after COGS,
   shipping, and processing fees.**
3. Subtract payment processing fees from net.
4. Archive the cut list to a dormant branch — influencer gamification (challenges,
   badges, leaderboards), AI studio and credits, artist-recruits-artist residuals,
   featured-artist paid rotation.

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
