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
9. **The engine gets a new schema, built alongside the existing tables.** Phase 1
   does *not* retrofit `tenant_id`, minor units, and generic vocabulary into the 38
   marketplace-shaped tables. Engine tables are new, clean, and multi-tenant from the
   first migration; the marketplace keeps running untouched on its own tables, and
   369 migrates onto the engine in Phase 2 as tenant #1. This follows directly from
   decision #4 — 369 is the test tenant, not the MVP.
11. **Build the generic product out before branding it as 369.** The user asked
    (2026-07-31) to evaluate the out-of-the-box product cleanly — what a *customer*
    sees — before it is dressed as their art business, so the two are never confused.
    This reinforces decision #4 rather than changing it: 369 is the test tenant, not
    the MVP. Practical consequence: keep tenant-neutral naming and copy in the engine
    surfaces, demo with `npm run seed:demo` rather than real 369 data, and do NOT
    migrate 369 onto the engine until the user says the generic product is ready to
    judge. 369 can keep selling on the old marketplace meanwhile — the two are
    unlinked, which is exactly what decision #9 bought.

10. **The §6 rule shape is built as specified, without waiting for design-partner
    data.** §6 warns that guessing at deal structures is the likeliest way to build
    the wrong abstraction. Accepted with eyes open: rules are stored as **data**, so a
    wrong guess about *which* structures matter is a config change, not a rewrite.
    What must be right up front is the *shape* — basis, method, effective dating,
    priority, multi-party. When design-partner structures arrive, the expected
    outcome is new rows and possibly new `method` values, not a schema change. If a
    partner's structure cannot be expressed without altering the shape, that is a
    real signal — surface it rather than bending the rule table around it.

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

**Phase 1 — SOLVED IN THE ENGINE, still true of the marketplace.** Both were always
scoped to the engine's ledger model, and both are now handled there. Neither is being
back-ported to the marketplace tables: those are retired in Phase 2, and retrofitting
them would be work thrown away.

3. ~~No refund, chargeback, or clawback handling~~ — built. `server/engine/reversal.ts`
   handles refunds as negative events through the same idempotency guard, generating
   reversing allocations that reference the original, with per-tenant
   recoup/absorb/reserve policy and a payout holding period. **The marketplace order
   path still has none of this** and will not get it.
4. ~~`artists.monthlySales` as a stored balance~~ — the engine stores no balance
   anywhere. Contributor balances and the trailing volume that drives tiered rules are
   both derived by summing the ledger, and an end-to-end check asserts no
   stored-balance column exists. **`artists.monthlySales` still exists and is still a
   drift risk** for as long as the marketplace runs.

(A third inconsistency surfaced during step 4 — the 40% rung throwing against a
validator that only allowed 30/35/45, plus the vestigial `FREE/PRO/ELITE` naming.
Both were resolved in step 5.)

## Current status

- **Phase 0 ✅ · Phase 1 ✅ · the owner-facing product is built ✅ · WHATS-LEFT
  step 1 (Shopify + Stripe against fixtures) ✅.**
- **What exists:** the engine (16 `engine_*` tables, canonical `RevenueEvent`, §6
  rules, immutable ledger, §8 reversals, transactional ingestion, payout batches
  with the state machine), the **contributor portal** at `/portal/:tenantSlug`, the
  **owner console** at `/manage/:tenantSlug` — dashboard, people, review queue,
  rates, payout preview and run, plus rate editing with versioning and resolving
  stuck items — and now **both provider adapters**: the Shopify ingestion path
  (signed webhooks → per-line events → ledger, plus refunds and cancellations) and
  the Stripe `TransferExecutor`.
- **266 unit tests · 141 end-to-end checks against real Postgres.** Every screen has
  been driven in a real browser, and the webhook endpoint over real HTTP.
- **Money has still never moved, and no live store is connected.** Both adapters are
  written and proven against fixtures; neither has credentials. `getTransferExecutor`
  returns `UnconfiguredTransferExecutor` without `STRIPE_SECRET_KEY`, so pressing
  "Pay" fails honestly rather than pretending. This is a *swap*, not a build — see
  "Switching the adapters on" below.
- **Cost fixtures are still invented** — see below. The first real capture happened
  on 2026-07-31 and is recorded in `docs/SOP.md` §6b, but the fixture file has not
  been replaced (one product, one variant; the user is changing supplier first).
- **Track A: not started as of 2026-07-31.** Shopify Partner, Stripe Connect
  application, App Store research, design-partner outreach, 369 selling again.
  Still the real critical path; none of it goes faster by building faster.
- **Branch:** `claude/business-idea-feedback-7uwumw`

### What to build next

**`docs/WHATS-LEFT.md` is the authoritative gap list** — what is built, what is not,
and the order agreed with the user on 2026-07-31. Read it before planning work.
Keep it current: if it claims something is missing and it is not, fix the file.

Summary of that order:

1. ~~**Shopify and Stripe against fixtures**~~ — **done.** See "The adapters" below.
   The approvals now wait on themselves rather than on us.
2. **Artist bank onboarding** — nobody can be paid without it, even with Stripe live.
   `StripeClient.getAccountStatus` already exists for the status half; what is
   missing is Account Links, the onboarding return/refresh routes, and the screen.
3. **Artwork and settings screens** — finishes "operable without a developer".
4. **Customer billing and signup** — turns it into a business. **There is currently
   no way to charge anyone**, which is easy to leave until last and then discover is
   the thing standing between working software and revenue.
5. Email, 1099, audit viewer.
6. CSV import, then advances (§10b) — advances only once a real publishing or music
   deal can be seen, so the shape is drawn rather than guessed.

**Migrating 369 on as tenant #1 stays deferred** by ratified decision #11 until the
user has evaluated the generic product cleanly.

**The user is not on a timeline** (stated 2026-07-31) and prefers correctness over
speed. Do not compress work to seem fast.

Offered and declined for now: a credential-leak audit of the whole codebase. The
user fixed the one known instance (plaintext password logging at login, removed in
`a1b2c3d`-era commit "security: stop logging plaintext passwords"). **Worth
offering again before anything runs against real money.**

### The engine — where things live

| Path | What |
|---|---|
| `shared/engine-schema.ts` | 16 `engine_*` tables. Every §5 decision annotated where it lands |
| `server/engine/money.ts` | bigint minor units, basis points, largest-remainder `allocate()` |
| `server/engine/revenue-event.ts` | canonical event (§7), validation, `buildReversal` |
| `server/engine/rules.ts` | §6 evaluator — pure, clock-free, emits the explain trace |
| `server/engine/ledger.ts` | append-only entries, balance derivation, hold logic |
| `server/engine/reversal.ts` | §8 reversals + recoup/absorb/reserve policies |
| `server/engine/ingest.ts` | the DB-facing path: resolve → evaluate → allocate → ledger |
| `server/engine/payout.ts` | batch selection, the payout state machine, `TransferExecutor` seam |
| `server/engine/auth.ts` | contributor login, tenant-scoped; identity is `(tenant, email)` |
| `server/engine/statement.ts` | statement assembly — pure, reads stored rows, never recomputes |
| `server/engine/statement-query.ts` | the DB reads a statement is assembled from |
| `server/engine/routes.ts` | contributor portal HTTP API, mounted at `/api/engine` |
| `server/engine/admin-auth.ts` | tenant-user login; a THIRD session namespace, `engineAdmin` |
| `server/engine/admin-query.ts` | read-only queries behind the owner console |
| `server/engine/admin-mutations.ts` | rule versioning, people and works |
| `server/engine/admin-routes.ts` | the owner console HTTP API |
| `server/engine/review.ts` | resolving stuck items: assign, dismiss, write off |
| `server/engine/seed-demo.ts` | realistic demo data (`npm run seed:demo`) |
| `server/engine/db.ts` | the engine's own Drizzle client (lazy; separate from `lib/db.ts`) |
| `server/engine/secrets.ts` | AES-256-GCM seal/open for provider credentials + `safeEqual` |
| `server/engine/connections.ts` | `engine_source_connections` CRUD; the ONLY module that touches sealed columns |

### The adapters — §4's two seams, filled in

| Path | What |
|---|---|
| `server/engine/adapters/cost-source.ts` | `LineCostSource` — where supplier costs (Printify et al) plug in. Default returns none |
| `server/engine/adapters/shopify/types.ts` | the slice of Shopify payloads we read, hand-written on purpose |
| `server/engine/adapters/shopify/webhook-auth.ts` | HMAC verification over the RAW body, timing-safe; shop-domain normalisation |
| `server/engine/adapters/shopify/map.ts` | **pure.** All five money decisions live here — read its header before changing anything |
| `server/engine/adapters/shopify/client.ts` | Admin API seam + `LiveShopifyClient` + `FixtureShopifyClient` + `syncWebhooks` |
| `server/engine/adapters/shopify/ingest.ts` | DB-facing: attribution via `works`/`work_contributors`, then `ingestEvent` |
| `server/engine/adapters/shopify/routes.ts` | `POST /api/engine/webhooks/shopify` — one URL for all tenants |
| `server/engine/adapters/stripe/client.ts` | four-call Stripe surface + `LiveStripeClient` + `FixtureStripeClient` |
| `server/engine/adapters/stripe/transfer-executor.ts` | `TransferExecutor` over Stripe; bigint→number checked, never rounded |
| `server/engine/adapters/stripe/factory.ts` | `getTransferExecutor()` — refuses by default, fixture is opt-in |

**Five things about the adapters that are load-bearing:**

1. **`map.ts` is pure and contains every money decision.** Tax excluded, discounts
   deducted from `discount_allocations` (NOT `total_discount` — a cart-level code
   appears only in the former, and reading the latter overpays on every discounted
   order), customer-paid shipping recorded but not deducted, **payment fee fetched
   and never assumed**, test orders dropped. Each is argued in the file header.
2. **There is deliberately no "assume 2.9% + 30¢" option**, and **absorb-vs-deduct
   is NOT a connection setting.** Whether a fee reduces someone's share is already
   `splitRules.costDeductions` — per contributor, effective-dated. A second switch
   at the connection level could contradict it, and the version that existed
   briefly (`feePolicy: "none"`) also stopped *recording* the fee, corrupting the
   tenant's own margin reporting. Fees are now always recorded when readable. The
   only connection setting is `onUnknownFee`: `hold` (default) or `proceed`, for
   gateways that never report one. An "estimate" arm would recreate the
   invented-cost bug Phase 0 existed to remove — do not add one.
3. **One event per `${orderId}:${lineItemId}`.** Same key the marketplace learned
   the hard way, now enforced by `(tenantId, source, sourceEventId)`.
4. **Refund proportions divide by the RECORDED gross, not the payload's list
   price.** A refund of a discounted line otherwise under-recovers, permanently.
5. **`ingestEvent` gained `holdForReview`.** An adapter can know something the
   engine cannot (a missing fee). Held events record the revenue and their costs,
   allocate nothing, and land in the existing review queue.

**One known gap, named rather than hidden.** A line held because its payment fee
could not be read can still be resolved through `resolveEventContributor`, and doing
so allocates with **no** `processing_fee` cost — i.e. the tenant absorbs the fee for
that line, which is exactly what `onUnknownFee: "proceed"` does deliberately. The
hold reason is shown on the item, so it is a visible choice rather than a hidden
one, and blocking resolution instead would leave an item with no way out. **The
proper fix is a "record the missing cost" action on the review screen**, which
belongs with the settings/artwork screens in `WHATS-LEFT.md` step 3. Do not fix it
by adding an estimated-fee fallback.

### Switching the adapters on

Neither adapter needs a code change to go live.

- **Stripe:** set `STRIPE_SECRET_KEY` and put the tenant's connected account id on
  `engine_tenants.stripe_account_id`. `getTransferExecutor` picks up the live path.
  `ALLOW_FIXTURE_TRANSFERS=true` forces the fixture — **never set it anywhere real**;
  it marks payouts paid and debits balances while moving nothing.
- **Shopify:** insert a row in `engine_source_connections` (`provider: 'shopify'`,
  `external_ref`: the myshopify domain, sealed access token and webhook secret) and
  point the app's webhooks at `POST /api/engine/webhooks/shopify`. `syncWebhooks`
  registers the four topics. There is **no UI for this yet** — see `WHATS-LEFT.md`.
- **`ENGINE_SECRET_KEY` is now required** for anything touching connections
  (`openssl rand -hex 32`, or any passphrase locally). Without it, sealing throws
  rather than storing plaintext.

The portal UI, which is the engine's surface rather than the marketplace's:

| Path | What |
|---|---|
| `client/src/pages/portal/index.tsx` | the shell — resolves the tenant, gates on the session |
| `client/src/pages/portal/portal-login.tsx` | sign-in; tenant fixed by the URL |
| `client/src/pages/portal/portal-dashboard.tsx` | balances, statement, payout history |
| `client/src/pages/portal/statement-line.tsx` | one line plus its stored derivation trace |
| `client/src/lib/portal-api.ts` | typed client; every amount a string |
| `client/src/lib/portal-money.ts` | bigint-backed money formatting, mirrors the server |
| `client/src/lib/portal-date.ts` | UTC date formatting (see below for why) |

```bash
npm test              # 266 unit tests, no network, no database
npm run test:e2e      # 141 checks against a real Postgres (needs DATABASE_URL)
npm run seed:demo     # realistic demo data; prints the sign-ins
npm run db:push:engine
npm run printify:costs -- --fixture   # local only, needs real credentials
```

**Three surfaces, three separate sessions.** `session.user` is the marketplace's,
`session.engineContributor` is an artist's, `session.engineAdmin` is an owner's.
They are deliberately different keys over different tables — collapsing them is how
an artist login ends up able to trigger a payout run.

**The engine and the marketplace are deliberately unlinked.** Separate schemas,
separate drizzle configs (`drizzle.engine.config.ts`, `migrations/engine/`), no
imports between them. That is what lets the marketplace tables be dropped wholesale
in Phase 2 without disturbing the engine. Do not "tidy" this by merging the configs —
drizzle-kit then diffs the two schemas against each other and offers to *rename*
marketplace tables into engine tables, which is wrong and destructive.

**One bug worth remembering.** `isUniqueViolation` originally checked `error.code`,
which type-checks and looks right. Drizzle wraps driver errors, so the SQLSTATE is on
`error.cause` — the check silently turned every replayed webhook into a 500 instead
of a no-op. Unit tests could not have caught it; the real-Postgres run did on its
first attempt. This is the step-3 lesson recurring: **green type-check and green
tests are not evidence that the database path works.**

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

## Picking this up in a NEW SESSION — read this first

Sessions do not share memory. Everything below is the state as of the last commit on
`claude/business-idea-feedback-7uwumw`. Trust the repo, not any recollection.

**Orientation, in order:**
1. This file's "Ratified decisions" (ten of them) and "Known defects".
2. `docs/BLUEPRINT.md` §5 (the fourteen expensive-to-retrofit decisions), §6 (rule
   shape), §8 (reversals), §9 (phasing), plus **§10a and §10b** — two open items
   recorded rather than resolved.
3. The engine table above. Every module opens with a comment explaining *why* it is
   shaped the way it is; those comments are load-bearing, not decoration.

**Verify the state before changing anything:**
```bash
npm test          # 266 unit tests — no network, no database
npx tsc --noEmit  # must be clean
npm run build     # must pass
```

For the end-to-end run (141 checks against real Postgres) start the local database
first — see "Running the app in a cloud sandbox" below, then:
```bash
DATABASE_URL=postgres://postgres@127.0.0.1:55432/art369 npm run test:e2e
```
The e2e **truncates and reseeds** the engine tables, so it doubles as the way to get
demo data. It seeds two tenants (`369`, `press`), contributors Alice/Bob/Eve, and a
login: `shared@example.com` / `correct horse battery` on tenant `369`.

### The contributor portal — BUILT. How it works

Routed at **`/portal/:tenantSlug`** (e.g. `/portal/369`), outside `ProtectedRoute`
and the marketplace `AuthProvider`. It carries its own tenant-scoped session and
shares nothing with `pages/artist-*` except the shadcn component library, so Phase 2
can delete the marketplace client without touching it.

The three things it had to get right, and how each landed:

1. **Money is never a number.** `client/src/lib/portal-money.ts` parses minor-unit
   strings with `BigInt` and formats by integer division — no float anywhere. A test
   asserts `9007199254740993` survives, and asserts that `Number()` on it does *not*,
   so the reason the rule exists survives future readers.
2. **The derivation is rendered, never recomputed.** `statement-line.tsx` shows the
   stored `explanation` inline and expands `trace` into labelled steps with the rule
   key and version. Nothing on the client does arithmetic on a rate.
3. **Held lines are visibly distinct.** Amber row, a `Held` badge, and the sentence
   "becomes available on <date>" on the line itself, plus a banner above the
   statement.

**One scope subtlety worth knowing before touching the held UI.** `/me` reports
`heldMinor` as `balance − payable` — the non-withdrawable slice of the *all-time
balance* — while a statement reports the sum of held *lines in the selected period*.
Normally they agree. They diverge when payouts or reversals have pulled the balance
below the held-line total: `derivePayableBalance` floors at zero, so the `/me` figure
under-reports and can read `$0.00` while held lines are on screen. The banner is
therefore driven by the statement's total and worded "of the earnings shown below";
the balance card keeps the `/me` figure so that *Available + Held = Total balance*
stays true. Both numbers are correct — they answer different questions. This is a
presentation decision, not an engine defect; the engine was not changed.

**Dates are formatted in UTC from the ISO string**, never via `new Date()` and a
locale. A sale stamped `02:00Z` otherwise renders a day earlier in California, and a
statement that disagrees with the emailed one by a day looks exactly like a
discrepancy worth disputing.

Endpoints behind it, all under `/api/engine/t/:tenantSlug`:

| Method | Path | Returns |
|---|---|---|
| GET | `/` | tenant name, slug, currency |
| POST | `/login` | `{email, password}` → contributor + tenant |
| POST | `/logout` | `{ok:true}` |
| GET | `/me` | balance, payable, held |
| GET | `/statement?from=&to=` | lines with the stored derivation + totals + summary |
| GET | `/payouts` | payout history |

**These invariants still bind any new screen over the engine:** money arrives as
strings and is never passed through `Number(...)`; derivations are rendered from
`explanation`/`trace`, never recomputed; held lines carry their reason on the same
screen. And the portal stays a **separate surface from the marketplace's artist
pages** — do not extend `client/src/pages/artist-*`, and do not reach for
`auth-context` or `ProtectedRoute`; those belong to the system being retired.

### Traps that have already bitten, in this repo

- **`npm run build` and `tsc` are not evidence the app works.** Load the pages. This
  has now caught four separate defects that both passed clean.
- **A real database catches what unit tests cannot.** Three bugs so far were found only
  by the Postgres run: the Drizzle-wrapped SQLSTATE on `error.cause`, a fixture
  minting colliding transfer ids, and a stale test assumption about a balance.
- **`server/vite.ts:36` calls `process.exit(1)`** from the vite logger's error handler,
  and vite forwards *client-side* console errors to it. A benign React warning kills
  the dev server the moment a page renders. Comment it out while working on the UI;
  do not commit that.
- **Do not merge the drizzle configs.** `drizzle.config.ts` (marketplace) and
  `drizzle.engine.config.ts` (engine) are separate on purpose; one config makes
  drizzle-kit offer to *rename* marketplace tables into engine tables.
- **`drizzle-kit push` prompts interactively** and fails without a TTY. Use
  `npx drizzle-kit generate --config=drizzle.engine.config.ts` then apply the SQL with
  `psql`.

### Still true, and still the constraints

- **No money has ever moved through any payout path.** All fixes are forward-only.
- **The Printify cost fixtures are invented numbers** with placeholder catalog IDs.
  See the warning section above. This is the one thing blocking real payouts.
- **Track A had not started as of 2026-07-31** and is the real critical path. The user
  expects to begin within ~24 hours of that date. Ask for status; do not assume.
- **`docs/SOP.md` is the owner's guide** — plain-language, no jargon, written for the
  business owner. Keep it current when behaviour changes; it is the document the user
  actually reads. Technical depth stays here and in code comments.

## How to communicate with the user — IMPORTANT

The user is the business owner, not a developer. They asked directly (2026-07-31) to
stop being given implementation detail they cannot use. Follow this:

- **Debrief in plain language after each chunk of work.** What changed, what it means
  for the business, what it protects against. No file names, no function names, no
  framework jargon unless they ask.
- **End every response with a clear DECISIONS NEEDED list** — each item one line of
  what the decision is, plus a short description of each path. Never bury a question
  inside a paragraph.
- **Ask questions the moment they arise**, not only at the end.
- **Be brief.** They said explicitly that long technical passages waste tokens and give
  them nothing. Detail belongs in this file and in code comments, not in chat.
- Technical depth is still expected *in the repo* — comments, docs, commit messages.
  The rigour does not drop; only the chat register changes.

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

**`ENGINE_SECRET_KEY` is required by the engine** wherever `engine_source_connections`
is read or written — it is the AES key that seals provider credentials. Generate with
`openssl rand -hex 32`; a passphrase also works locally. It is *not* interchangeable
with `SESSION_SECRET`, and losing it makes every stored store token unreadable (the
fix is reconnecting the stores, not a data-recovery exercise).

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
