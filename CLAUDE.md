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

12. **Pricing: flat monthly tiers by people PAID per month. Settled 2026-08-01.**
    $49/$99/$199 for 10/50/200, 14-day trial, no free tier. Full reasoning and the
    four rules that make it work are in blueprint §12. The two that get broken by
    accident: **the plan is chosen by the customer, never metered up by our count**,
    and **billing never blocks a payout or blocks adding people** — it notifies and
    moves the plan at renewal. Numbers are placeholders pending design-partner
    conversations; the *model* is not. No percentage-of-volume pricing, ever.

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
  step 1 (Shopify + Stripe against fixtures) ✅ · step 2 (artist bank
  onboarding) ✅ · step 3 (works + settings screens, and recording a missing
  cost) ✅ · step 4 (billing, signup and pricing) ✅ · step 5 email ✅ · the
  daily job ✅ · the 1099 export ✅ (the audit viewer remains).**
- **What exists:** the engine (16 `engine_*` tables, canonical `RevenueEvent`, §6
  rules, immutable ledger, §8 reversals, transactional ingestion, payout batches
  with the state machine), the **contributor portal** at `/portal/:tenantSlug`, the
  **owner console** at `/manage/:tenantSlug` — dashboard, people, review queue,
  rates, payout preview and run, plus rate editing with versioning and resolving
  stuck items — and now **both provider adapters**: the Shopify ingestion path
  (signed webhooks → per-line events → ledger, plus refunds and cancellations) and
  the Stripe `TransferExecutor` — plus **artist payout-account onboarding**
  (`server/engine/payout-account.ts`, Account Links + status read back from Stripe),
  **billing** (plans, trials, usage counting, annual, the Stripe charging seam,
  self-serve signup at `/signup`) and **email** (`server/engine/email/`).
- **394 unit tests · 245 end-to-end checks against real Postgres.** Every screen has
  been driven in a real browser, and the webhook endpoint over real HTTP.
- **Money has still never moved, and no live store is connected.** Both adapters are
  written and proven against fixtures; neither has credentials. `getTransferExecutor`
  returns `UnconfiguredTransferExecutor` without `STRIPE_SECRET_KEY`, so pressing
  "Pay" fails honestly rather than pretending. This is a *swap*, not a build — see
  "Switching the adapters on" below.
- **Cost fixtures are still invented** — see below. The first real capture happened
  on 2026-07-31 and is recorded in `docs/SOP.md` §6b, but the fixture file has not
  been replaced (one product, one variant; the user is changing supplier first).
- **Nothing outside is switched on.** No live store, no live bank, no live card
  charges, no email actually sending. Every one of those is a credentials swap
  behind a seam that refuses by default rather than pretending — `STRIPE_SECRET_KEY`,
  `BILLING_STRIPE_SECRET_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, and a
  `engine_source_connections` row for Shopify.
- **Track A: still not started as of 2026-08-01.** Shopify Partner, Stripe Connect
  application, App Store research, design-partner outreach, 369 selling again.
  Still the real critical path; none of it goes faster by building faster. **Ask
  for status; do not assume.**
- **Branch:** `claude/business-idea-feedback-7uwumw`

### What to build next

**`docs/WHATS-LEFT.md` is the authoritative gap list** — what is built, what is not,
and the order agreed with the user on 2026-07-31. Read it before planning work.
Keep it current: if it claims something is missing and it is not, fix the file.

Summary of that order:

1. ~~**Shopify and Stripe against fixtures**~~ — **done.** See "The adapters" below.
   The approvals now wait on themselves rather than on us.
2. ~~**Artist bank onboarding**~~ — **done.** See "Payout accounts" below.
3. ~~**Works and settings screens**~~ — **done.** See "Step 3" below.
4. ~~**Customer billing and signup**~~ — **done.** See "Billing" below.
5. ~~Email~~ — **done, see below.** Two things remain from this step, and they
   are **the next work in the queue, in this order**:
   - ~~**The daily job.**~~ — **done.** See "The daily job" below.
   - ~~**1099 export.**~~ — **done.** See "The 1099 export" below.
   - **The audit-log viewer.** Every change is already recorded; nothing shows it.
     **This is the next thing to build** — and the tax export just added a new
     entry type to it (`export_tax_report`), so the viewer now has something to
     show beyond rule edits.
6. CSV import, then advances (§10b) — advances only once a real publishing or music
   deal can be seen, so the shape is drawn rather than guessed.

Also still open and not in the numbered order: **password reset** for both portals,
and the **connect-a-store screen** (waits on the Shopify Partner account).

**Migrating 369 on as tenant #1 stays deferred** by ratified decision #11 until the
user has evaluated the generic product cleanly.

**The user is not on a timeline** (stated 2026-07-31) and prefers correctness over
speed. Do not compress work to seem fast.

**Do not use time-to-revenue as an argument for sequencing work.** The user pushed
back on this directly (2026-08-01): *"you keep mentioning if I want revenue sooner.
Apparently, that's changing your decision making… it's kind of negligent at this
point. I have plenty of time to get this finished, do full testing, reviews,
modifications if necessary before I need to worry about making a first dollar."*
Billing still has to be built — that fact is unchanged and stays in the list — but
"this gets you paid sooner" is not a reason to move it, and framing it that way
imports an urgency the user does not have. Sequence on what makes the product
correct and operable, and say so in those terms.

### Credential-leak sweep — DONE (2026-08-01). Do not redo; do not regress

Ran before the Stripe Connect application, as agreed. The earlier fix (plaintext
password logging at login) had removed *the password* and left the **session
credentials** behind. Five leaks found and closed, all in the marketplace's
auth path — the engine was clean:

1. **`server/index.ts`** — a debug middleware logged `req.headers.cookie`,
   `req.cookies` and `req.sessionID` on **every `/api/` request**. The raw
   `Cookie` header *is* the signed session; log access was account takeover.
2. **`server/index.ts`** — the request logger appended the JSON response body,
   truncated to 79 chars. Truncation caps how much leaks, not what. The Stripe
   Connect onboarding link is single-use and sits in the first 40 characters of
   its response.
3. **`server/routes.ts`** artist login — logged `res.getHeader('set-cookie')`
   and `res.getHeaders()` on every success: the freshly minted session cookie,
   ready to replay.
4. **`server/middleware/auth.ts`** — `sessionID` + raw `Cookie` on every
   artist-gated request. A redacted `safeContext` was already computed three
   lines below and unused for this.
5. **`server/bootstrap.ts`** — a **hardcoded admin password in a tracked file**,
   echoed to stdout at every cold start. Also: the test-artist seed was
   commented "development/test only" with **no guard**, so production got a
   second known-password sign-in.

**Rules this leaves behind.** Session identifiers and cookie values are never
loggable — log presence, never the value. Response bodies are never logged by
default; trace inside a handler through `secureLog`, which redacts. And
`server/lib/secure-logger.ts` already existed and already listed `sessionID`,
`cookie` and `token` as redacted — every one of these leaks was a raw
`console.log` **routed around it**. Prefer `secureLog` over `console.log`
anywhere near auth.

**Deployment consequence:** production now requires `BOOTSTRAP_ADMIN_PASSWORD`
to seed an initial admin, and creates no account without it. Local development
is unchanged.

Verified beyond type-check: signed in against a real server and confirmed the
logs now contain method, path, status and duration and nothing else.

**Not covered by this sweep** (scope named honestly): secrets reaching
third-party log sinks, the client bundle, and the ~70 obsolete
`server/scripts/**` one-offs, which are not on any request path.

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
| `server/engine/payout-account.ts` | contributor bank onboarding — Account Links, status read back from Stripe |
| `server/engine/billing/plans.ts` | the plans, as CODE not rows. Annual = 10 months' price |
| `server/engine/billing/subscription.ts` | trials, usage counting, `entitlement`, `currentUsageWindow` |
| `server/engine/billing/signup.ts` | self-serve account creation, one transaction |
| `server/engine/billing/checkout.ts` | Stripe checkout → subscription, read back from Stripe |
| `server/engine/billing/billing-client.ts` | OUR Stripe account — read its header before touching |
| `server/engine/billing/routes.ts` | `/api/engine/plans`, `/signup`, and the billing screen |
| `server/engine/email/sender.ts` | `EmailSender` seam + Resend + fixture + unconfigured |
| `server/engine/email/templates.ts` | pure; every word the customer reads |
| `server/engine/email/notify.ts` | `sendOnce` — the at-most-once guarantee |
| `server/engine/email/notifications.ts` | who gets told what, all failure-swallowing |
| `server/engine/jobs/daily.ts` | the sweep — trial threshold, who gets nagged. Idempotent by design |
| `server/engine/jobs/scheduler.ts` | the hourly tick. REFUSES to start without a configured sender |
| `server/engine/tax/report-1099.ts` | pure: the year window, flags, thresholds, CSV. Read its header before changing a rule |
| `server/engine/tax/report-1099-query.ts` | the grouped read — paid payouts only, summed in Postgres |
| `server/engine/review.ts` | + `recordEventCost` — typing in a cost the channel never sent, guarded on 'nothing allocated yet' |

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

**The known gap here is now CLOSED — `recordEventCost` in `review.ts`.** It used to
read: a line held for an unreadable payment fee could only be resolved through
`resolveEventContributor`, which allocated with **no** `processing_fee` cost, so the
tenant silently absorbed it. The owner can now type the real figure in from the
provider's statement before assigning. Two guards make it safe, and both are asserted
end-to-end:

- **Nothing may be allocated yet.** Allocations snapshot their own inputs (§5 #6);
  adding a cost afterwards would leave the event and the payment disagreeing with no
  way to tell which is right. Once money is worked out, the way to change it is a
  reversal, not an edit.
- **The cost type comes from a closed list** (`RECORDABLE_COST_TYPES`). Rules select
  costs by exact string match against `costDeductions`, so a free-text
  "proccessing_fee" would be stored, appear in margin reporting, and reduce nobody's
  share — an overpayment that looks perfectly correct on every screen.

Correcting an already-recorded cost is deliberately allowed, since both guards still
hold. **Still do not add an estimated-fee fallback** — that would recreate the
invented-cost bug Phase 0 existed to remove. Skipping the entry and assigning anyway
remains legal and means the tenant absorbs the fee, which is what
`onUnknownFee: "proceed"` does on purpose.

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

### Payout accounts — how a contributor gets bankable

`selectPayoutCandidates` skips anyone without `stripeAccountId` or with
`stripePayoutsEnabled` false. Those two columns used to be set by hand;
`server/engine/payout-account.ts` is what replaced the hand. Four rules are
load-bearing, and the file header argues each at length:

1. **One Stripe account per contributor, ever.** A stored id is reused. Minting a
   second on a repeat visit orphans the first — and if the first was the verified
   one, money goes somewhere the person cannot withdraw from.
2. **`payoutsEnabled` only ever comes from Stripe.** Never from reaching the return
   URL. Finishing onboarding and being able to receive money are different events;
   Stripe asks for documents afterwards and can disable an account months later.
   An e2e check asserts that finishing the form does *not* make an account ready,
   and another that a later suspension is reflected without anyone signing in.
3. **Account links are minted fresh, never stored.** They expire in minutes and are
   single-use. A cached link is a support ticket.
4. **Country is fixed at creation** — Stripe requires recreating the account to
   change it, so it is asked for rather than assumed.

⚠️ **One assumption in here is unverified and is a real onboarding requirement, not
a detail.** Connected accounts are created **under the tenant's own Stripe account**
via the `Stripe-Account` header — the same `onBehalfOfAccount` the transfer executor
uses — because decision #1 says funds never pass through an account we control. That
requires *the tenant* to have Connect enabled on their own Stripe. Sandboxes cannot
reach `api.stripe.com`, so this has never run live. **Confirm it during the Connect
application before promising a customer it works.** If Stripe refuses, the fallback
is that we are the platform and each tenant is a connected account with `transfers`
capability — which changes decision #1's shape and is a conversation, not a patch.

### Step 3 — works, settings, and recording a missing cost

Three things landed together, plus one real bug found on the way.

**Works screen** (`client/src/pages/engine-admin/works-editor.tsx`). Called *works*,
never *artwork* — decision #11 requires tenant-neutral surfaces, and `works` rows
carry no medium, so the same screen serves a label and a print shop. Archiving only,
never delete: deleting cascades to `work_contributors` and orphans the attribution
behind allocations already paid. No rate field either — rates live in Rates,
effective-dated and versioned, and a second place to set what people are paid is the
exact defect this system exists to remove.

**Settings screen** (`settings-editor.tsx`, `updateTenantSettings`). ⚠️ **The
settings are not uniformly retroactive, and the asymmetry is load-bearing.**
`minimumPayoutMinor` and `clawbackPolicy` are read at payout/reversal time, so they
bite on the next run. `payoutHoldDays` is consumed by `holdUntil(occurredAt, days)`
at allocation time and written to `available_at`, so changing it does nothing to
money already earned. An e2e check asserts every existing `available_at` is byte-for-
byte unchanged across a settings update. **Do not "fix" this by recomputing
`available_at`** — it rewrites a release date a contributor has already been shown.
The form warns on the field as you change it.

Reserve at 0% is rejected rather than stored: `reversal.ts:249` returns a zero
reserve when the rate is not positive, so it would silently behave as `recoup` while
the screen said otherwise.

**`recordEventCost`** — see "the known gap here is now CLOSED" above.

**⚠️ A cross-tenant bug was found and fixed in `linkWorkContributor`.** It inserted
`{tenantId, workId, contributorId}` without checking that the work or the contributor
belonged to that tenant. The FKs point at `works.id` and `contributors.id`
*globally*, so a request naming another tenant's contributor id satisfied every
database constraint and inserted happily — attaching a stranger to your work and
putting them in line to be paid from your sales. Reachable only by hand-crafting a
request (no screen offers another tenant's ids) and nothing had been paid. Two e2e
checks now hold it shut, in both directions. **The lesson generalises: a `tenantId`
column on the row being inserted proves nothing about the ids inside it.** Any new
mutation that accepts an id from an HTTP body must verify tenancy explicitly.

### Billing — charging the customer

`/pricing` (public, no session) and a Billing tab in the console. Blueprint §12 has
the model; four things about the CODE are load-bearing:

1. **`billing-client.ts` is OUR Stripe account. `adapters/stripe/client.ts` is the
   TENANT's.** Separate env vars (`BILLING_STRIPE_SECRET_KEY` vs `STRIPE_SECRET_KEY`),
   separate files, headers on both. Crossing them either bills the wrong party or
   takes our fee out of contributor funds. Charging a subscription does NOT touch
   ratified decision #1 — that governs contributor money, not our own revenue.
2. **`currentUsageWindow()` is monthly, always.** `peopleLimit` is per month but an
   annual `periodEnd` is a year out; measuring usage across the billing period would
   report every annual customer as permanently over their plan. Windows anchor to the
   signup day, and `addMonths` clamps 31 Jan → 28 Feb rather than rolling to 3 March.
3. **`entitlement()` has no ingestion permission, and that absence is deliberate.**
   Read-only stops payout runs and admin writes; webhooks keep recording revenue
   always. A blocked write is undone by paying, a dropped sale is a permanent hole
   nobody notices. `past_due` grants FULL access — suspending over a failed card
   withholds contributors' income over $49 of ours. A unit test says changing that
   needs the user's agreement.
4. **`completeCheckout` reads back from Stripe.** Reaching the success URL is not
   evidence of payment, same lesson as `payoutsEnabled`. It is idempotent and refuses
   a subscription whose metadata names another tenant.

`suggestDowngrade` is deliberate lost revenue — telling a customer they are paying
for more than they use. It is what makes the overage notice believable.

`ALLOW_FIXTURE_BILLING=true` simulates subscriptions and charges nothing. Less
dangerous than `ALLOW_FIXTURE_TRANSFERS` but still opt-in: a deployment that thinks
it is charging and is not takes months to notice.

### Email — three rules, all easy to break

1. **A send failure must never fail the thing being reported.** Nothing in
   `email/` throws. `notifyPayoutsPaid` is called from `admin-routes` AFTER the
   payout run has committed, deliberately NOT from inside `payout.ts` — putting
   it there would place a mail failure in the same call stack as a transfer, and
   the next refactor would have to re-derive why it must not throw.
2. **At most once.** `engine_email_log.dedupe_key` is unique per tenant and the
   row is claimed BEFORE the provider is called, so a replayed run collides on
   the index. Keys come from stable ids (`payout_paid:<payoutId>`), never
   timestamps. Being told twice that you were paid reads as being paid twice.
   The claim-then-send order can lose a message if the process dies mid-flight;
   that trade is argued in the file header and is deliberate.
3. **Emails must agree with the screens character for character.** Same
   `formatMoney`, same UTC date handling. An email that differs by a day or a
   comma looks like a discrepancy worth disputing.

Two sentences in `templates.ts` are load-bearing and have tests naming them:
the trial email promises **nothing is deleted** (an expired trial is read-only),
and the payment-failed email says **nothing has been switched off** (`past_due`
grants full access). Both are true; copy that implies otherwise would cause a
panic about something that is not happening.

### The daily job — BUILT. Four things are load-bearing

`server/engine/jobs/` is what fires `notifyTrialEnding` and `notifyReviewWaiting`,
the two notifications that are due because time passed rather than because a
request arrived. Started from `server/index.ts` when the engine DB is configured;
`npm run job:daily` runs one sweep and exits, for an external scheduler or by hand.

1. **The sweep is idempotent, and the scheduler depends on it.** It ticks HOURLY
   and re-runs on every restart. There is no last-run timestamp and no lock
   table — `sendOnce`'s unique index is the only thing preventing repeats, which
   is why the keys are the trial's end date and the calendar day. **Anything
   added to the sweep must go through `sendOnce` with a key derived from stable
   facts.** A key containing the current time turns an hourly tick into hourly
   email. The hourly design is deliberate over "run at 03:00": a process that is
   not awake at 03:00 silently skips that day forever, and on a host that
   recycles it could skip weeks.
2. **⚠️ It REFUSES to start when email is unconfigured, and this is not
   cosmetic.** `sendOnce` claims its dedupe row BEFORE calling the provider and
   leaves it claimed on failure. Sweeping every tenant through
   `UnconfiguredEmailSender` would burn every trial-warning key permanently —
   adding a real `RESEND_API_KEY` afterwards would NOT repair it, because the
   system would correctly believe those customers had already been told.
   `isEmailConfigured()` exists for this. **Request-path callers must not gate on
   it** — one-at-a-time courtesy sends after committed work should record the
   failure honestly.
3. **`TRIAL_WARNING_DAYS = 3` lives in the job, not in `notifyTrialEnding`.** The
   notifier sends whenever asked; it has no opinion about when a message is due.
   Without the threshold on the job's side, a daily sweep would fire on the
   customer's first morning saying "your trial ends in 14 days", burn the key
   (which is the trial's end date), and then say nothing in the week that
   matters. The threshold is the final 72 hours because the day count rounds up,
   matching the number the email prints.
4. **Only an explicit `canceled` silences the review digest.** The tempting rule —
   "only nag people who can currently write" — silences two groups who should be
   nagged: a lapsed trial is read-only but is exactly who a "four sales are stuck"
   notice should reach, and a tenant with **no subscription row at all** is not
   delinquent. The engine predates billing and **369 will be provisioned by hand
   as tenant #1**, so gating on billing state would quietly mute the first real
   customer.

Interval is `DAILY_JOB_INTERVAL_MINUTES` (default 60). A non-numeric value falls
back rather than becoming `setInterval(fn, NaN)`, which Node treats as 1ms and
would sweep every tenant in a tight loop.

One honest consequence: the review digest goes out on the first tick after
midnight UTC, so its arrival time depends on when the process last started. If it
ever needs to land at a specific local hour, that is per-tenant timezone plus a
send-hour preference — a real feature, not a tweak to the interval.

Signup, payout and payment-failure notifications still fire from their request
paths and are not part of the sweep.

### The 1099 export — BUILT. Five rules decide what lands in a year

`server/engine/tax/` plus a **Tax tab** in the owner console. It does **not file
anything** and the copy must never imply it does: by ratified decision #1 the money
moves through the *tenant's* Stripe, so Stripe issues forms under their account. What
we supply is their own record of what they paid whom — the figure their accountant
files from and reconciles Stripe against.

**⚠️ There is no TIN/SSN/EIN in the export, and there is no column for one.** Tax
identity is collected by Stripe during Connect onboarding and stays there (§5 #14).
Adding a TIN column would import the breach-notification and retention obligations
attached to the most regulated identifier a US person has, for no gain — the party
that files already has it. If a customer asks, the answer is "from Stripe's tax
reporting", not "we'll add a field".

The five rules, each argued at length in `report-1099.ts`'s header:

1. **Cash basis.** Sums PAYOUTS, never ledger allocations. Earned in December, paid
   in January ⇒ the *following* year. Reporting earnings instead is the single most
   common way these come out wrong.
2. **Only money that moved** — `status = 'paid'`, nothing else. A failed payout later
   retried gets `completedAt` stamped at the retry, so it counts once, in the right
   year.
3. **The reserve is not paid.** `amountMinor` is already the transferred figure;
   `reserveHeldMinor` sits in the next column and stays in the contributor's balance.
   An e2e check pins this because one day somebody will add them up.
4. **A closed year is never restated.** A 2027 clawback reduces 2027, not 2026. The
   money was genuinely received; restating a filed year is a corrected 1099 and an
   accountant's decision. Said on screen rather than buried.
5. **The year boundary is UTC and is printed on the report.** A payout run at 19:00 US
   Eastern on 31 December falls in the next tax year. Consistent with every other date
   in the system; local-midnight boundaries would need a per-tenant timezone.

**Thresholds are reported, never enforced.** `REPORTING_THRESHOLD_MINOR` ($600) marks
rows; nothing is filtered out. State thresholds are lower, the federal figure moves,
and a row an accountant ignores costs nothing while a row never shown cannot be
recovered. Same reasoning as everywhere else here: flag, don't hide.

**Three more things that are decisions rather than mechanics:**

- **The read is not audit-logged; the CSV download is.** Looking at a screen and
  taking a copy away are different acts, and only the second one leaves the system
  carrying every contributor's name and what they were paid. Logged *after* the report
  is built, so a failed read never records an export that did not happen.
- **The routes are deliberately NOT behind `write()`.** A lapsed trial is read-only but
  still owes contributors tax paperwork for money that already moved — same reasoning
  that keeps ingestion running in `entitlement()`.
- **⚠️ CSV formula injection is guarded in `csvField`.** A cell beginning `=`, `+`,
  `-`, `@`, tab or CR is a FORMULA to every spreadsheet. Contributor names are
  tenant-supplied or adapter-imported, and this file is opened by an accountant. Every
  field is prefixed with an apostrophe when it leads with one of those, not just the
  ones that look risky — "which columns are user-controlled" is exactly the fact that
  changes quietly when a column is added.

**A defect was found by loading the screen, again.** The summary card labelled the ROW
count as "people paid", so a business paying one artist in two currencies was told it
had paid two. The total beside it was right, which is worse — the wrong number is the
one an owner checks against their own records first. `contributorCount` is now
distinct people and is what the screen reads. **This is the fifth defect found by
loading the app that a green `tsc`, a green build and a green suite all missed.**

**⚠️ A live defect was found by BOOTING THE APP while building this, and it had
nothing to do with the job.** `ResendEmailSender` loaded the provider through a
bare `require`. This package is ESM, so `require` is not defined at runtime — but
it type-checked, and every test injects a client and so never executed that line.
**All live email would have thrown `require is not defined` on the first real
send**, including `notifyPayoutsPaid` for a payout whose money had already moved.
Nothing had ever constructed the real sender before, because nothing had ever run
with `RESEND_API_KEY` set.

Two fixes, both worth keeping:

- `createRequire` is now imported at the top of `sender.ts`. The `resend` package
  itself stays behind the lazy call, which is what the laziness was ever for.
- **`getEmailSender()` no longer throws, by contract.** `admin-routes` builds a
  sender AFTER the payout has committed, so a throwing constructor turns a
  completed payout into a 500 — the exact failure the whole email subsystem is
  built to prevent, arriving through the one line nobody thought could fail. A
  construction failure now yields `BrokenEmailSender`, which carries the real
  reason into `engine_email_log.error` rather than a misleading "not configured".

A unit test now constructs the real sender with no injected client. **This is the
fourth defect found by loading the app that a green `tsc`, a green build and a
green suite all missed.**

**Config:** `RESEND_API_KEY` + `EMAIL_FROM` to send at all, `PUBLIC_APP_URL` so
emailed links do not come from a client-controlled `Host` header,
`PLATFORM_NOTIFY_EMAIL` to be told about new signups, and
`DAILY_JOB_INTERVAL_MINUTES` (default 60) for the sweep.

The portal UI, which is the engine's surface rather than the marketplace's:

| Path | What |
|---|---|
| `client/src/pages/portal/index.tsx` | the shell — resolves the tenant, gates on the session |
| `client/src/pages/portal/portal-login.tsx` | sign-in; tenant fixed by the URL |
| `client/src/pages/portal/portal-dashboard.tsx` | balances, statement, payout history |
| `client/src/pages/portal/statement-line.tsx` | one line plus its stored derivation trace |
| `client/src/lib/portal-api.ts` | typed client; every amount a string |
| `client/src/lib/portal-money.ts` | bigint-backed money formatting, mirrors the server (incl. `groupDigits`) |
| `client/src/pages/signup/index.tsx` | pricing + signup, one page, no session |
| `client/src/pages/engine-admin/billing-tab.tsx` | plan, usage, and changing either |
| `client/src/lib/portal-date.ts` | UTC date formatting (see below for why) |

```bash
npm test              # 394 unit tests, no network, no database
npm run test:e2e      # 245 checks against a real Postgres (needs DATABASE_URL)
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

### ⚠️ The invented cost fixtures — scope corrected

**The cost fixtures are invented numbers.** `server/lib/__fixtures__/printify-costs.ts`
is interpolated from an undated table, and its variant and print-provider IDs are
placeholders, not live catalog IDs. Sandbox sessions cannot reach `api.printify.com`,
so they could not be verified here.

**What this actually blocks — read this before flagging it again.** Earlier notes in
this file called it "the one thing blocking real money," which over-stated it. It
blocks **the marketplace order path**, which is being retired in Phase 2. It does
**not** block the engine:

- The engine's supplier-cost seam is `LineCostSource`, and the default returns
  none. Nothing in the engine reads the Printify fixture.
- The Shopify adapter reads the **actual** payment fee off the order rather than
  looking a cost up, by deliberate design (`map.ts` — no "assume 2.9% + 30¢" arm).
- The tests encode arithmetic, not prices, so substituting real numbers verifies
  nothing the fixtures do not already verify.

It becomes load-bearing at exactly one moment: **when 369 moves onto the engine as
tenant #1 and its supplier costs have to plug into `LineCostSource`.** That is
deferred by decision #11. The user scheduled the capture alongside the Stripe
Connect application (2026-08-01) — do not raise it as a blocker before then.

When it is time:

1. Run `PrintifyCostResolver` locally with real credentials already in `.env.local`.
2. Replace the fixture values and the placeholder IDs with what comes back.
3. Re-run `npm test` — the assertions should still pass with real numbers substituted.

Meanwhile the resolver factory refuses to invent costs: without `PRINTIFY_API_TOKEN`
and without `ALLOW_FIXTURE_COSTS=true`, **every marketplace line item is held for
review and nothing is paid.** That is deliberate. No royalty is better than a wrong one.

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
1. This file's "Ratified decisions" (twelve of them) and "Known defects".
2. `docs/BLUEPRINT.md` §5 (the fourteen expensive-to-retrofit decisions), §6 (rule
   shape), §8 (reversals), §9 (phasing), **§12** (pricing — settled, with the four
   rules that make it work), plus **§10a, §10b and §10c** — three open items
   recorded rather than resolved.
3. The engine table above. Every module opens with a comment explaining *why* it is
   shaped the way it is; those comments are load-bearing, not decoration.

### ⚠️ CARRIED OVER — the open items as of 2026-08-02

Written at the end of the session that built the daily job and the 1099 export.
None is blocked on code; two are waiting on the user, one is the next thing to build.

**1. Next build: the audit-log viewer.** The last `WHATS-LEFT.md` step 5 leftover.
Every change is already recorded in `engine_audit_log` — rule edits, review
resolutions, settings changes, and now tax-report exports (`export_tax_report`,
added by the 1099 work) — and **nothing displays any of it.** After that: step 6
(CSV import, then advances), plus **password reset** for both portals and the
**connect-a-store screen**, which sit outside the numbered order. The
connect-a-store screen waits on the Shopify Partner account; the other two do not
wait on anything.

⚠️ **Three questions were put to the user at the end of that session and had not
been answered when it closed.** Ask rather than assuming:
   - Track A status (below).
   - Whether the audit viewer really is next, or password reset first.
   - Whether anything about the new Tax tab should change before a real accountant
     sees it — the judgement calls about what to show and what to warn about are
     mine, not theirs.

**2. During the Stripe Connect application, confirm the one unverified assumption**
— that contributor accounts can be created under the *tenant's* Stripe via the
`Stripe-Account` header. See "Payout accounts" above. Sandboxes cannot reach
`api.stripe.com`, so this has never run live, and the fallback changes ratified
decision #1's shape. **Do not promise a customer it works before this is checked.**

**3. The Printify cost capture happens alongside that same Connect work**, by the
user's decision. Do not raise it as a blocker before then — see "The invented cost
fixtures — scope corrected" for why it blocks the marketplace and not the engine.

**Track A was still the critical path and still not started as of 2026-08-01**, and
was asked about again on 2026-08-02 without an answer arriving before the session
ended: Shopify Partner, Stripe Connect, App Store research, design-partner
conversations, 369 selling again. **Ask for status rather than assuming**; none of
it goes faster by building faster.

**Sequencing rule, restated because it has been broken before:** do not use
time-to-revenue as an argument for ordering work. The user pushed back on this
directly and it is recorded under "What to build next" above. Sequence on what
makes the product correct and operable, and say so in those terms.

**Verify the state before changing anything:**
```bash
npm test          # 394 unit tests — no network, no database
npx tsc --noEmit  # must be clean
npm run build     # must pass
```

For the end-to-end run (245 checks against real Postgres) start the local database
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
  See "The invented cost fixtures — scope corrected" above. ⚠️ **An earlier version of
  this line called it "the one thing blocking real payouts", which is wrong and was
  corrected** — it blocks the *marketplace* order path, which Phase 2 retires. Nothing
  in the engine reads it. Do not reinstate the stronger claim.
- **Track A is the real critical path and had not started as of 2026-08-01.** Asked
  about again on 2026-08-02 with no answer before the session ended. Ask for status;
  do not assume, and do not infer progress from the passage of time.
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

**`BOOTSTRAP_ADMIN_PASSWORD` is required in production** to seed the first admin
account. Without it `bootstrapAdmin()` creates nothing and warns — deliberately, since
the alternative it replaced was a password hardcoded in this repository. Optional
`BOOTSTRAP_ADMIN_EMAIL` overrides the address. Development keeps its existing default
(`admin@369artcollective.com` / `Admin369AC`) and is unaffected.

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
