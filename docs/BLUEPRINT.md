# Split Engine — Product Blueprint & Strategy

**Status:** Draft for review. Decisions marked ⬜ need your sign-off before build starts.
**Working name:** "Split Engine" (placeholder — see §12)
**Author context:** Written as the architectural plan for repositioning the 369 Art
Collective codebase into a multi-vertical revenue-split and payout platform.

---

## §0. Read this first

**What we're building:** software that takes revenue events from any source, applies
per-contributor split rules, produces a defensible ledger, and executes payouts.
It is vertical-agnostic by construction. Print-on-demand is the first vertical, not
the product.

**Why:** the 369 Art Collective marketplace has no defensible position — AI collapsed
the cost of art supply, and the codebase invested entirely in supply-side acquisition
with nothing on demand. But the payout pipeline underneath it is genuinely hard
software that thousands of businesses currently do in spreadsheets.

**The constraint that shapes everything below:** the builder is full-time available,
is not under cash pressure, and ships substantially faster than conventional estimates
assume. Therefore the sequencing in §9 is **platform-first** — build the real thing,
properly, and start the externally-gated items on day one because those are the only
parts that can't be compressed.

**The one-line architectural thesis:**

> Every vertical differs only in *how revenue arrives* and *what it's called*.
> The split rules, ledger, statements, payouts, and tax reporting are identical.
> Build that middle once, behind two thin seams, and new verticals cost weeks.

---

## §1. Foundational decisions — AGREED

All eight ratified. These are settled; changing any of them later is a redesign, not
a tweak.

| # | Decision | Ruling | Why |
|---|---|---|---|
| ✅ 1 | Does the platform hold funds? | **No. Orchestrate only.** Each tenant connects their own Stripe; we instruct their account to pay their contributors. We never custody money. | Holding funds = money transmission = state licensing, bonding, audits. This single choice is the difference between shipping this year and needing a compliance budget. |
| ✅ 2 | Do contributors get a login? | **Yes, Phase 1.** | It's the trust problem that makes merchants switch, it's what incumbents don't do, and you already built it (`artist-earnings.tsx`, `artist-payouts.tsx`). Adding a second user class to a live multi-tenant schema later is a genuine retrofit. |
| ✅ 3 | First revenue source adapter | **Shopify.** | Only candidate with attribution data, built-in distribution, *and* existing working code. See §1a. |
| ✅ 4 | Fate of 369 Art Collective | **Keep live as tenant #1, radically scoped down.** | It is the test tenant, not the MVP. See §1b for the spec. |
| ✅ 5 | Free tier? | **No. Paid from day one, 14-day trial.** | B2B payout software with a free tier attracts the highest-support, lowest-value users. People with this pain have budget. |
| ✅ 6 | Multi-currency at launch? | **Store currency on every amount; support USD only in Phase 1.** | Schema cost is near-zero now and brutal later. The feature can wait. |
| ✅ 7 | Custom formula scripting for tenants? | **Never. Structured rules only.** | Arbitrary tenant-authored code is a security and support catastrophe. See §10. |
| ✅ 8 | Name / brand | **Decide before the App Store listing, not before the build.** | Don't let naming block engineering. |

### §1a. Why Shopify first — the alternatives considered

| Candidate | Case for | Why not first |
|---|---|---|
| **Stripe direct** | Broadest reach — any business taking payments | **Attribution is absent.** A charge knows the amount but not which contributor is owed; the merchant would tag every charge by hand, destroying the automation pitch. Strong as adapter #3. |
| **CSV / statement import** | Universal, no platform dependency, unlocks music + publishing + stock simultaneously | Zero distribution — nobody discovers a CSV importer. Purely manual, so "it just runs" evaporates. Correctly adapter #2. |
| **WooCommerce** | Large install base, no app-review gatekeeper | Ship a PHP plugin *and* a hosted service — double the surface area. Weaker attribution data, far less marketplace discovery. |
| **Printify / Printful as source** | Already integrated | They know what the *merchant* paid them, not what the *customer* paid the merchant. Wrong side of the transaction — a cost source, not a revenue source. |
| **Etsy** | Multi-artist shops exist | Most sellers are solo; wrong buyer shape, restrictive API. |
| **Gumroad / Lemon Squeezy** | Clean APIs | Multi-contributor splits are rare there, and both have some native splitting. |

Shopify is the only candidate holding all three of: **attribution data already present**
(vendor, tags, metafields, SKU patterns — four ways to solve the hard part),
**distribution built in** (intent-driven App Store search you don't pay for), and
**existing working code**.

Accepted tradeoff: platform dependency and app-review gatekeeping. Mitigated by making
adapter #2 a CSV importer, which proves the seam and gets you off single-platform risk
early.

### §1b. 369 Art Collective as tenant #1 — scoped spec

**369 is not the MVP. The engine is the MVP. 369 is the test tenant.** Conflating them
is how attention leaks back into the business this repositioning exists to leave behind.

**Must have:**
- Live storefront genuinely taking orders, fulfilling through Printify so **COGS is real**
- **3–5 contributors on deliberately different deal structures** — one % of net, one
  flat-per-unit, one tiered, one with a work-specific override
- Enough catalog to plausibly sell, and no more

**Must not have:** recruitment or growth mechanics, marketing spend, anything on the
§14 cut list, or any ambition to be big.

The mismatched contract terms are the point. They are not good business — they are a
**live fixture that exercises every branch of the §6 rules engine against real money.**
One artist on one flat rate proves nothing; five artists on five deals proves the spec.
You can be contributor #1 yourself: fewer humans to coordinate.

**Known limit — do not over-rely on this tenant.** A small storefront produces too few
refunds and chargebacks to be statistically meaningful (a handful a year). 369 proves
the **happy path end-to-end with real money**. The adversarial path (§8) is properly
exercised only by tenant #2–3 with real volume. Two consequences:

1. Get a design partner onto the platform **earlier than §9 implies**.
2. Build a **test harness that injects synthetic refunds and chargebacks** so
   development is never blocked waiting on reality. Synthetic for coverage, real for
   confidence — you need both.

---

## §2. What it is and who buys it

### The primitive

> Revenue arrives as discrete transactions. Multiple contributors are owed a variable
> cut of each one. Compute the split, prove it, pay it, report it for tax.

### Phase 1 buyer

Shopify store owners paying multiple creators:
- POD apparel brands with 5–20 guest designers
- Creator / streamer merch operations
- Band and tour merch
- Print shops and galleries licensing from a stable of artists
- Agencies running merch for several clients

### Their month today

Export orders to CSV → identify which designer made each line item → look up actual
POD cost per variant → subtract shipping → apply that person's specific deal (10% of
retail, or 50% of net, or flat $5/unit, or different by product) → build a spreadsheet
→ pay each person individually via PayPal or Wise → field disputes with no way to
prove the number → reconstruct it all in January for 1099s.

3–8 hours monthly of error-prone work. **The deeper sell is not the hours — it's that
contributors cannot verify the number today**, so every one of these relationships
carries a permanent low-grade trust problem.

---

## §3. Domain model — get the vocabulary right now

The current schema is saturated with art-specific nouns (`artists`, `artworks`,
`royalty`). That vocabulary is a retrofit cost in every non-art vertical, and renaming
tables across 142 routes later is miserable. **Name it generically from day one.**

| Canonical | 369 today | Music | Publishing | Real estate |
|---|---|---|---|---|
| `tenant` | (none — single tenant) | label | press | brokerage |
| `contributor` | artist | artist/producer/writer | author/illustrator | agent |
| `work` | artwork | track/release | title | listing |
| `revenue_event` | order line | statement row | sales row | closed deal |
| `split_rule` | royalty tier | contract terms | contract terms | commission plan |
| `allocation` | sale | earning | earning | commission |
| `payout` | payout | payout | payout | disbursement |

**Core tables:**

```
tenant              — the paying customer (a merchant/label/press)
tenant_user         — humans who administer a tenant
contributor         — a person owed money, scoped to tenant
contributor_identity— tax/payout identity (Stripe acct, W-9 status)
work                — the thing that earns (product, track, title) — optional
revenue_event       — canonical normalized transaction (see §7)
cost_component      — COGS, shipping, fees, discounts on a revenue_event
split_rule          — effective-dated, versioned rule (see §6)
allocation          — "contributor X is owed Y from event Z under rule version V"
ledger_entry        — immutable append-only +/- ; balance is DERIVED
adjustment          — refund clawback, manual correction, bonus
payout_batch        — a run
payout              — one contributor's disbursement in a batch
audit_log           — who changed what, when (you already have `adminActions`)
```

---

## §4. The seams — the only two places verticals differ

```
   ┌──────────────────────────────────────────────────────┐
   │  SEAM 1 — INGESTION ADAPTER  (varies per vertical)   │
   │  Shopify webhook · Stripe event · CSV statement ·    │
   │  QuickBooks · WooCommerce · manual entry             │
   └──────────────────────────┬───────────────────────────┘
                              ↓  normalizes to RevenueEvent
   ┌──────────────────────────────────────────────────────┐
   │  THE ENGINE  —  IDENTICAL FOR EVERY VERTICAL         │
   │  attribution → cost resolution → rule evaluation →   │
   │  allocation → ledger → statement → payout → tax      │
   └──────────────────────────┬───────────────────────────┘
                              ↓
   ┌──────────────────────────────────────────────────────┐
   │  SEAM 2 — PAYOUT RAIL  (rarely varies)               │
   │  Stripe Connect · (later: PayPal, Wise, ACH file)    │
   └──────────────────────────────────────────────────────┘
```

**~70% of the value sits in the middle box, and it is vertical-independent.** That is
the entire hedge. If POD underperforms, a new vertical is an adapter plus a landing
page — weeks, not a rewrite.

**Evidence this is achievable:** `server/lib/order-processor.ts` is already only
coupled to Shopify in three places — two type interfaces, the `parseSKU()` regex, and
the cost lookup. Everything downstream (`calculateRoyalty`, sale records, Connect
transfers) is already source-agnostic. The seam is half-built by accident.

---

## §5. The fourteen decisions that are expensive to retrofit

This is the core of "build it beautifully up front." Each of these is cheap now and
painful-to-impossible later.

**1. Multi-tenancy on line one.** `tenant_id` on every table, Postgres row-level
security, no query without tenant scope. Retrofitting tenancy is the single most
expensive refactor in SaaS.

**2. Money as integer minor units.** Store `bigint` cents, never decimal/float. The
current schema has **38 decimal money columns** and the code does `parseFloat` +
`.toFixed(2)` arithmetic, which silently loses cents at scale. Migrating stored values
later means touching every row and every calculation.

**3. Currency code on every amount.** Even while USD-only.

**4. Immutable ledger; never store balances.** Append-only `ledger_entry`; derive
balances by query. Your current `artists.monthlySales` is a stored column that drives
royalty tiers — a drift bug waiting to happen. Notably your own `influencers` table
comment says *"calculated via queries, not stored to prevent drift"* — you already
know this pattern. Apply it universally.

**5. Effective-dated rules.** Rules change mid-relationship. A rate that changed on
March 1 must not silently rewrite February's history. If effective dating isn't in the
schema from the start, you can never correctly recompute or explain the past.

**6. Every allocation stores its inputs and its rule version.** When a contributor
disputes a payout from eight months ago, you must reconstruct exactly why it was that
number — the price, the costs, the rule, the rule's version. Store the snapshot, not
just the result. **This is what makes the product defensible and is the #1 reason a
merchant would trust you over their spreadsheet.**

**7. Reversals as first-class.** See §8 — this is the big one.

**8. Idempotency on every ingested event.** You already do this correctly for Shopify
line items via the unique index on `(shopify_order_id, shopify_line_item_id)`.
Generalize it: `(tenant_id, source, source_event_id)` unique.

**9. Split rules as data, not code.** A rules table plus an evaluator. Hardcoded
30/35/45 tiers in `royalty-calculator.ts` cannot serve a second customer, let alone a
second vertical.

**10. Multi-party splits from the start.** One revenue event may owe 3+ people
(artist + producer + label). A schema that assumes one contributor per line item is a
rewrite when the first music or co-authored deal arrives.

**11. Generic vocabulary.** §3. Renaming across 142 routes later is a week you'll
resent.

**12. Payout state machine with failure states.** Payouts fail, accounts freeze,
batches partially complete. Model `pending → processing → paid → failed → retrying`
explicitly rather than a boolean.

**13. Minimum payout thresholds and holds.** Industry-standard, and trivially cheap
if modeled up front.

**14. Tax identity and data-deletion posture.** W-9/W-8BEN collection status per
contributor (lean on Stripe Connect for most of it), plus tenant offboarding =
export + hard delete. GDPR/CCPA obligations attach to contributor PII.

---

## §6. Split rules engine

Rules must be **data**, evaluated in a defined order, with an explainable trace.

**Rule shape:**
```
split_rule
  tenant_id
  version              int, immutable once used
  effective_from       timestamptz
  effective_to         timestamptz | null
  scope                tenant-wide | contributor | work | product_type
  basis                gross | net | unit
  method               percent | flat_per_unit | flat_per_event | tiered
  value                numeric
  tier_table           jsonb | null    (for volume tiers)
  priority             int             (specificity wins)
  cost_deductions      which cost_components subtract before "net"
```

**Must support out of the box:**
- % of gross revenue
- % of net (after configurable cost components)
- flat amount per unit / per event
- tiered by volume or cumulative earnings
- per-work and per-product overrides
- multi-party splits summing to ≤100% with a defined remainder owner
- effective-dated changes
- recoupable advances (music/publishing — a negative opening balance that earnings
  pay down before cash is released). *Ship in Phase 3, but model the ledger so it's
  possible in Phase 1.*

**Evaluation must emit a human-readable trace** — "$24.99 gross − $4.04 COGS −
$6.29 shipping = $14.66 net × 30% (rule v3, effective 2026-01-01) = $4.40." That trace
is the product.

---

## §7. Ingestion adapters

Every adapter normalizes to one canonical shape:

```ts
interface RevenueEvent {
  tenantId: string
  source: 'shopify' | 'stripe' | 'csv' | 'manual' | ...
  sourceEventId: string        // idempotency key
  occurredAt: Date
  grossAmountMinor: bigint
  currency: string
  quantity: number
  workRef?: string             // resolved to a work
  contributorRefs: Array<{ ref: string; role?: string }>
  costs: Array<{ type: string; amountMinor: bigint }>
  metadata: Record<string, unknown>
}
```

Attribution (which contributor?) must be **configurable per tenant**, not a hardcoded
regex like today's `parseSKU()`. Support: product metafield, product tag, vendor field,
SKU pattern, or manual mapping table. Ship all five — they're cheap and they remove the
#1 onboarding blocker.

### Vertical coverage matrix

| Vertical | Adapter | New work beyond core | Fit |
|---|---|---|---|
| POD merch (art, apparel, creator, band) | Shopify webhook | none | ★★★★★ |
| Stripe Connect marketplaces | Stripe events | none | ★★★★☆ |
| Multi-instructor courses / memberships | Stripe / Teachable | light | ★★★★☆ |
| Photography & stock licensing | CSV / API | light | ★★★★☆ |
| Music (indie labels, distributors) | CSV statement parsing | recoupment, publishing vs master | ★★★☆☆ |
| Book publishing (small presses) | CSV (KDP, IngramSpark) | recoupment | ★★★☆☆ |
| Agency contractor profit-share | QuickBooks / Xero | invoice-based events | ★★★☆☆ |
| Franchise royalty collection | manual / POS | inverted flow (money up) | ★★☆☆☆ |
| Real estate commission splits | CRM / transaction mgmt | caps, compliance | ★★☆☆☆ |

**Self-test for any vertical you think of later:** *does revenue arrive as discrete
transactions with an identifiable contributor?* Yes → the engine fits. If revenue is a
lump sum allocated by negotiation → it doesn't.

---

## §8. Refunds, reversals and clawbacks — the thing everyone gets wrong

**Current state: there is no refund handling in the payout path at all.** If an order
refunds after a contributor is paid, nothing happens today. (This section once noted
that the only refund logic in the repo was for AI credits at `routes.ts:4573`; Phase 0
step 2 removed the AI credit system, so there is now no refund logic anywhere.)

This is the #1 killer of payout systems in production and the most expensive thing on
this list to retrofit, because fixing it changes the ledger model itself.

**Required from Phase 1:**

- Refund/chargeback arrives as a **negative `RevenueEvent`** through the same adapter
  and the same idempotency guard.
- It generates a **reversing allocation** against the original, referencing it.
- Reversal lands as a negative `ledger_entry`. Balances go negative — that must be legal
  in the model.
- **Configurable clawback policy per tenant:**
  - `recoup` — offset against the contributor's future earnings (most common)
  - `absorb` — the tenant eats it
  - `reserve` — hold a % of every payout against future refunds, release after N days
- **Payout holding period** — don't pay out until the refund window has largely closed
  (default 14–30 days). This alone prevents most clawback pain and is nearly free to
  build if modeled up front.
- Chargebacks arrive weeks later and must reconcile against an already-closed period.
  Periods must therefore be **re-openable or adjustable-forward**, never immutable-final.

---

## §9. Phasing — platform-first, two parallel tracks

The critical planning insight is that **the build is effort-bound and compresses
enormously with modern tooling, while the feedback loops are wall-clock-bound and do
not compress at all.** Conventional month-based estimates conflate the two and are
therefore wrong in both directions. Plan them separately.

### Track A — Long-lead items. Start day one; these wait on other people.

These are the actual critical path. Nothing about them gets faster by coding faster.

| Item | Wall-clock | Start |
|---|---|---|
| Shopify Partner account + app scaffold + review | 1–3 weeks per review cycle, usually iterates | Day 1 |
| Stripe Connect platform application & verification | days–weeks | Day 1 |
| App Store competitive research (§15.2) | one afternoon | Day 1 |
| Design-partner conversations — 5–10 POD brands | weeks of human response time | Day 1 |
| **Real refund/chargeback data** | **30–120 days, irreducible** | Day 1, via tenant #1 |

Design-partner outreach here is **not** a services business — you're not selling
reconciliation work. You're asking 5–10 brands to show you their actual deal
structures and their current spreadsheet. That's the input to the rules engine (§6),
and guessing at it is the most likely way to build the wrong abstraction.

### Track B — Build. Effort-bound; goes as fast as you go.

**Phase 0 — Fix what's broken. ✅ COMPLETE.**
- ~~Fix the **hardcoded cost placeholders**~~ — done. Costs now resolve through
  `server/lib/cost-resolver.ts` and are **snapshotted onto the order row** at event
  time. A line whose cost cannot be resolved is **held for review**, never costed
  from an assumption.
- ~~Collapse the **three conflicting royalty definitions**~~ — done, and there were
  **five**, not three (see the correction below). One basis now:
  **net after COGS, shipping and processing fees**, in `server/lib/royalty.ts`.
- ~~Subtract payment processing fees from net~~ — done. 2.9% + 30¢, computed once
  per order and apportioned across lines by largest-remainder.
- ~~Archive the cut list~~ — done, `archive/pre-repositioning`.

**Correction to this section, found during step 5.** The defect was recorded here as
living at `order-processor.ts:163-164`. That file was **dead code — nothing imported
it.** The Shopify webhook actually called `server/lib/financials.ts`, which paid a
flat **36.9% of (price − 40%-of-price-as-assumed-COGS)** with shipping hardcoded to
zero. So the royalty that would have been paid was worse than the one documented,
and fixing only the documented file would have changed nothing. Both files are gone.

Two further live defects surfaced in the same pass and were fixed:

- The webhook called the order processor **twice per delivery**, racing two royalty
  calculations against each other.
- `orders.shopify_order_id` was **UNIQUE** while the processor wrote one row per
  *line item*, so any order containing two artworks silently failed to record its
  second line. Uniqueness is now on `(shopify_order_id, shopify_line_item_id)`,
  which doubles as the webhook idempotency key.

**Phase 1 — Engine core. ✅ COMPLETE — engine, HTTP API, and contributor portal UI.**
The middle box in §4, with all fourteen §5 decisions honored. Multi-tenant from the
first migration — never single-tenant "for now." Canonical `RevenueEvent`, rules
engine, immutable ledger, reversal handling.

Built so far (`shared/engine-schema.ts`, `server/engine/*`): the 15-table engine
schema, the canonical event and its validation, the §6 rules evaluator with the
explanation trace, the append-only ledger with derived balances and payout holds,
§8 reversals with recoup/absorb/reserve policies, and the transactional ingestion
path. Verified by 125 unit tests and 30 end-to-end checks against real Postgres.

Per ratified decision #9 the engine is a **new schema alongside** the marketplace
tables, not a retrofit of them — 369 migrates onto it in Phase 2 as tenant #1.

Payout execution is built too: batch selection respecting holds, minimums and
reserves; the explicit `pending → processing → paid | failed → retrying` state
machine; and transfer execution behind a `TransferExecutor` seam with a fixture
implementation, so the money path is provable without Stripe credentials. A failed
transfer never debits the ledger, and the provider idempotency key is derived from
the payout row so a retry after an ambiguous failure cannot pay twice.

Contributor login and statements are built. Identity is `(tenant, email)` rather than
email alone — the same freelancer legitimately works for several tenants, and email-only
lookup would either collide or authenticate someone into the wrong tenant's earnings.
Statements are **assembled from stored rows, never recomputed**: a statement answers
"what did this contributor actually earn", which diverges from "what would this earn
under today's rules" the moment a rate changes.

The HTTP API and the contributor portal UI are built too, closing Phase 1. The portal
lives at `/portal/:tenantSlug` and renders the stored derivation rather than
recalculating it — the trace, the rule key and version, and the hold date sit on the
line itself. It was verified by driving a real browser against real Postgres, not by
type-checking. Money crosses the wire as strings and is parsed with `BigInt`; nothing
in the client calls `Number()` on an amount.

**Phase 2 — First adapter + payouts live.** Shopify ingestion, a real `TransferExecutor`
against Stripe Connect, and **369 Art Collective goes live on it as tenant #1.** (The
portal and contributor statements listed here originally were pulled forward into
Phase 1 and are done.)

**Phase 3 — Self-serve.** Shopify OAuth/embedded app, tenant onboarding, Stripe
Billing, split-rule builder UI, 1099 export, App Store listing.

**Phase 4 — Second adapter.** CSV statement import — the highest-leverage choice,
because it unlocks music, publishing, and stock licensing simultaneously and is the
format every non-Shopify vertical already lives in. Its real purpose is to **prove the
seam holds** before you bet a vertical on it.

**Phase 5 — Vertical expansion.** Driven by inbound demand, not speculation.

### The one thing that genuinely cannot be compressed

**Adversarial financial events.** A chargeback takes 30–120 days to arrive. A refund
that lands after a payout has cleared is the exact scenario §8 exists to handle, and
you cannot manufacture it — you can only wait for it in a live system with real
customers and real money.

This argues for keeping 369 Art Collective **actually selling** rather than treating it
as an inert fixture — start it now so the clock is running while you build everything
else. But see §1b: a small storefront yields too few disputes to be sufficient on its
own. Real confidence in the §8 reversal path requires a **design-partner tenant with
volume**, which is why that outreach belongs in Track A rather than later. Pair it with
a synthetic refund/chargeback injector so development never blocks on waiting.

---

## §10. Bad ideas and traps — you asked, so here they are

**Traps specific to your situation:**

1. **Cloning per vertical.** N codebases, N maintenance burdens, zero compounding. This
   is the mistake this entire blueprint exists to avoid.
2. **Building all adapters before one customer pays.** Build the *seam* generic;
   implement exactly one adapter. Generic architecture is cheap. Generic *feature
   surface* is what kills solo products.
3. **Rebuilding the marketplace inside the SaaS.** The temptation to let merchants
   "discover contributors" will return. It is the original mistake wearing a new hat.
4. **Gold-plating because there's no deadline.** With time and no cash pressure, the
   §5 list will feel like a floor rather than a ceiling. It is a ceiling. Everything
   past it should be pulled by a paying customer, not pushed by enthusiasm — see §13.
5. **Letting tenants write formula code.** Sandboxing arbitrary code is a security
   problem you cannot afford. Structured rules cover ~95% of real deals; the rest get a
   manual `adjustment`.
6. **Holding funds.** Money transmission licensing. Do not.
7. **A free tier.** Highest support load, lowest value, for software whose users have
   budget.
8. **Real-time everything.** Money is fine in batches. Nightly reconciliation is simpler,
   cheaper, and easier to audit than streaming.
9. **Supporting every POD provider at once.** Printify first. Printful second, only when
   a paying customer asks.
10. **Building your own auth and billing.** Use hosted auth and Stripe Billing.
11. **Over-promising tax features.** "1099 export" is honest. "Tax compliance" invites
    liability you can't carry.
12. **Keeping the 369 vocabulary** because renaming feels cosmetic. It isn't; it's a
    week of pain deferred to the worst possible moment.

**Things that will surprise you (from how these systems fail in practice):**

- Contributors dispute numbers far more than merchants expect. The explanation trace
  (§5.6) is what ends those disputes.
- COGS data is dirtier than anyone plans for — POD providers change prices without
  notice, so costs must be **snapshotted at event time**, never looked up live at
  payout time.
- Merchants will ask to backfill 12 months of history on day one of onboarding. Design
  import to be re-runnable and idempotent, or onboarding becomes a support nightmare.
- Someone will need to pay a contributor who has no Stripe account and won't make one.
  Model a `manual` payout method that records the obligation without executing it.

---

## §10a. Open question — whose Stripe Connect platform?

**Unresolved as of 2026-07-31. Flagged rather than assumed, because getting it wrong
is the difference between needing a compliance budget and not.**

§1.1 says tenants connect their own Stripe and we never custody funds. §11 says we
"inherit responsibility for platform-level ToS". Those point at two different
architectures:

**A. Tenant-as-platform.** Each tenant enables Connect on their own Stripe.
Contributors are Express accounts under *the tenant*. We connect via Connect OAuth and
call Stripe on the tenant's behalf. Funds never touch us, and each tenant carries their
own platform obligations. Strongest fit with §1.1; the tenant does the Connect
application, not us.

**B. Us-as-platform.** We are the Connect platform; tenants and contributors are
accounts beneath us. Simpler onboarding, but it puts us far closer to the flow of funds
and therefore to money transmission — the exact risk §1.1 exists to eliminate.

**What is NOT ambiguous, and is actionable now:** 369 Art Collective pays its own
artists, so 369 needs Connect enabled on its own Stripe **under either architecture**.
That application can start immediately without settling this.

The platform-level question only becomes binding at Phase 3 (self-serve tenant
onboarding). Settle it before then, ideally with a payments-literate lawyer, and record
the answer here.

---

## §10b. Known gap in the §6 rule shape — recoupment

**Surfaced 2026-07-31 while building the engine. Not a bug; a limit worth naming.**

Ratified decision #10 committed to building the §6 rule shape as written, on the basis
that a wrong guess about *which* structures matter is a config change. That holds for
the near verticals — POD, courses, stock licensing — where every structure in §6 is
expressible as rows.

It does **not** hold for **recoupment**, which §7's coverage matrix already lists as
"new work beyond core" for both music and book publishing. An advance paid up front and
recovered from future royalties before any cash flows is not a percentage, a flat
amount, or a tier. It needs a *recoupable balance* that sits between the allocation and
the payout — a concept the current shape has no room for.

This is precisely the signal decision #10 said to surface rather than bend the rule
table around. Consequences:

- It is **not** a reason to change anything now. No design partner has asked for it.
- It **is** a reason not to promise music or publishing before it exists.
- When it is built, it is a new table plus a payout-time step, not a rewrite of the
  rules engine. The ledger already permits the negative balances it depends on.

Related structures in the same family, unbuilt for the same reason: commission **caps**
(real estate — agent keeps 100% after a threshold) and **publishing vs master** splits
(music — two rights streams on one event, possibly expressible via `role`).

---

## §10c. Open idea — an AI analyst over the tenant's own numbers

**Raised by the user 2026-08-01, explicitly as "we don't need to do this at this
moment." Recorded so it is not lost, not scheduled.**

The idea: a paid add-on that reads a tenant's real numbers — margins, payouts, fees,
refund rates — and tells them whether anything looks wrong. Explicitly scoped by the
user as **read-only**: *"I did not want them to be able to change anything in the
architecture."*

**The observation underneath it is the valuable part**, and it came from the user
noticing their own behaviour: *"I'm probably going to wander myself and then take
screenshots and paste them into some outside AI and ask if it looks right."* A user
screenshotting your dashboard into someone else's model is a feature request with a
receipt. It also says what the job is — not "chat with my data", but **"is this
right?"**, asked by someone who cannot tell by looking.

### Why this system is unusually well suited to it

Most products that bolt on an AI analyst have to feed it raw rows and hope. This one
already stores, for every single allocation, the **explanation and the derivation
trace** — what the rule was, which version, what was deducted, in what order. That was
built for contributor trust (§5 #6), but it happens to be far better model input than
any table of numbers: the model can check *reasoning*, not just spot outliers. Nothing
needs to be built to produce it.

### The three things that would have to be true

1. **It must never recommend a payment.** "This margin is unusual, look at it" is a
   flag. "Pay this person less" is advice about someone's money, given by a system
   whose entire value proposition is that its numbers are defensible. The first is a
   feature; the second undermines the product it is attached to. This is the boundary,
   and it is firmer than the read-only/write boundary the user named — a read-only
   feature can still cause a wrong payout by being believed.
2. **Deterministic checks come first, and may be most of the value.** "Margin below
   X", "fee above Y% of gross", "this contributor's effective rate moved", "refund rate
   doubled this month" are rules, not inference. They are cheap, explainable, testable,
   and cannot hallucinate. The honest sequencing is: build the anomaly checks, see what
   they miss, and let AI explain and prioritise rather than detect. Selling AI that
   wraps a `WHERE` clause is a thing this project should not do.
3. **Tenant financial data leaving for a third-party model is a contract question**,
   not a technical one — it needs to be disclosed, probably opt-in per tenant, and
   settled before it is sold. Note §11's posture: not holding funds is what keeps this
   out of money transmission, but sending a tenant's revenue data to a model vendor is
   a separate promise to get right.

**Pricing instinct is sound** — this is a natural upsell, and it is the kind that does
not cannibalise the core product because it is genuinely additive rather than a
capability withheld from the base tier.

**Do not start this before the product can charge anybody** (`WHATS-LEFT.md` step 4).
An add-on to a product with no billing is an add-on to nothing.

---

## §11. Legal and compliance posture

- **Not a money transmitter** — tenants' own Stripe accounts, funds never in our
  control. This is the single most important structural choice (§1.1).
- **Stripe Connect platform obligations** — KYC/onboarding is handled by Stripe when
  using Express accounts; you inherit responsibility for platform-level ToS.
- **1099-NEC / 1099-K** — Stripe Connect can issue these for Express accounts. Position
  as "Stripe issues the 1099; we give you the data." Never claim tax advice.
- **Contributor PII** — GDPR/CCPA. Export and delete per contributor and per tenant.
- **Contractual clarity** — your ToS must state you compute and instruct, and the
  tenant is responsible for the accuracy of rules and the underlying obligation.
- **The current codebase's recruitment-residual and paid-tier structure should not
  carry forward.** Beyond the FTC pattern-matching concern, it has no place in a B2B
  tool.

---

## §12. Pricing — SETTLED 2026-08-01

Ratified by the user after working through the alternatives. The **model** is
settled; the **numbers** are placeholders until design-partner conversations happen,
and were agreed as such.

| Tier | Price | Bound |
|---|---|---|
| Starter | $49/mo | up to 10 people paid per month |
| Growth | $99/mo | up to 50 people paid per month |
| Scale | $199/mo | up to 200 people paid per month |
| Custom | talk | above that, or multi-store |

14-day trial, no free tier (decision #5). **200 customers at $99 ≈ $238k ARR** — hold
that against what the marketplace needed (hundreds of thousands of art buyers, bought
against Society6's ad budget). Two hundred is a number you can picture reaching.

### The four rules that make this shape work

Each was argued and chosen; changing any one changes the model rather than tuning it.

1. **Billed on people PAID in the period, not people on the books.** A gallery with
   60 contributors who paid 8 this month is an 8-person month. Fairer, and it means a
   quiet month costs less without building variable pricing to achieve it.

2. **⚠️ THE PLAN IS CHOSEN, NOT METERED.** The customer picks a tier and that is
   their bill. The count is a guide rail shown on screen, never a meter that moves
   them. This is load-bearing: a bill that floats with *our* count reintroduces
   exactly the unpredictability that killed the per-payout model, and it manufactures
   the dispute — "I didn't pay 60 people, your number is wrong" — that flat pricing
   exists to avoid. **Never silently increase a bill from a usage count.**

3. **⚠️ BILLING NEVER BLOCKS A PAYOUT, AND NEVER BLOCKS ADDING PEOPLE.** Going over
   the tier mid-cycle pays everyone anyway and notifies. Three reasons, in order of
   weight: the people harmed by a block are the *contributors*, who are not the
   customer and cannot fix it; the failure would land on payout day, the one day the
   product must not fail; and it punishes a customer for growing. Capping *adding*
   people is equally out — their records would go wrong and sales would pile into
   review, corrupting data to protect $50. The plan moves up at RENEWAL, after notice
   already given, which keeps rule 2 intact.

4. **No percentage-of-payout-volume, ever.** It looks attractive and aligns
   incentives nicely, and it makes you look like a payments company to Stripe and to
   regulators. It also scales in the wrong direction — a publisher moving $200k/mo
   will never accept 1%, and that is exactly the customer worth having. Flat SaaS
   pricing keeps the §11 posture clean.

**Deliberately no $29 sub-5 tier at launch**, considered and deferred. Under ~5
contributors the manual process is a twenty-minute job, not a five-hour one — not
enough pain to sustain a purchase, and the cheapest tier reliably carries the highest
support load and churn. The genuine counter, specific to this product: the
contributor portal sells *legitimacy* as much as time saved, which a three-artist
operation may want regardless. Left open because the asymmetry favours waiting —
**adding a cheaper tier later reads as generous; removing one reads as a price rise.**

**No event caps.** A second limit makes "am I over?" unanswerable without support.
One number the customer can hold in their head.

### Not a contradiction of ratified decision #1

Decision #1 (never hold funds) governs **tenant → contributor** money, which is what
would make this money transmission. Charging a subscription is ordinary SaaS revenue
through our own Stripe account and is a completely separate surface from Connect. A
future session should not "discover" billing and think it breaches decision #1.

---

## §13. Kill criteria — decide these now, while you're unbiased

Without cash pressure, the risk shifts from *running out of money* to *building
something excellent that nobody wanted, and not noticing for a year.* These criteria
are learning-gated rather than revenue-gated, and they exist to make that failure mode
visible early. Write them down before you're emotionally invested.

- **After the App Store research (this week):** if two or more well-funded incumbents
  already do splits *and* execute payouts well → stop building horizontally. Go deep on
  one vertical they won't serve (music recoupment is the obvious candidate).
- **After 10 design-partner conversations:** if they don't immediately recognize the
  pain, or they describe it as "annoying but fine" → wrong buyer. The pain must be
  described unprompted, with feeling.
- **60 days after App Store listing:** <10 installs → the distribution assumption is
  wrong. Pivot to direct outbound before building more features.
- **90 days after listing:** trials that don't convert to paid → the value or the
  pricing is wrong. Talk to every churned trial before writing more code.
- **Any time:** Shopify or a major POD provider ships this natively → same response as
  criterion one, go vertical-deep.

**The failure mode to watch for in yourself:** with time and no financial pressure, the
temptation is to keep building because building is the fun part. The §5 list is
deliberately the *minimum* worth doing up front. Everything beyond it should be pulled
by a customer, not pushed by enthusiasm.

---

## §14. What survives from the current codebase

| Keep and generalize | Archive |
|---|---|
| `order-processor.ts` → ingestion + attribution | influencer gamification (challenges, badges, leaderboards) |
| `royalty-calculator.ts` → rules engine | artist-recruits-artist residuals |
| `stripe-connect.ts`, `payout-service.ts`, `payout-processor.ts` | AI studio + credits |
| `printify-service.ts` → cost resolution | featured-artist paid rotation |
| `artist-earnings.tsx`, `artist-payouts.tsx` → contributor portal | CreatorStack (stubbed; placeholder testimonials) |
| `admin-payouts.tsx`, `AdminFinancialDashboard.tsx` → tenant console | subscription tiers for artists |
| `adminActions` → audit log | performance-based royalty tiers |
| webhook idempotency pattern | `parseSKU()` hardcoded regex |

Roughly 40% of the codebase goes dormant. Archive to a branch rather than deleting —
it costs nothing and it's reversible.

---

## §15. Immediate next actions

**Everything in Track A starts now, because it's the real critical path.**

1. **You:** react to the ⬜ decisions in §1. Decision 1 (never hold funds) gates the
   most downstream design.
2. **You, this week:** an afternoon in the Shopify App Store searching "royalty,"
   "artist payouts," "commission split," "creator payouts." Find out who's there and
   whether they actually move money or only track affiliate commissions. Single fact
   most likely to kill or confirm the plan — and it's kill criterion #1.
3. **You, this week:** open the Shopify Partner account and start the Stripe Connect
   platform application. Both have review queues you don't control; the clock should be
   running while Track B is built.
4. **You, ongoing:** line up 5–10 design partners. Not to sell them anything — to see
   their real deal structures and their current spreadsheets, which are the input to §6.
5. **You:** get 369 Art Collective actually selling again, however modestly. It is the
   only source of the adversarial financial events described at the end of §9, and
   that clock is the longest one in the plan.
6. **Me, on your go-ahead:** Phase 0 — fix the cost placeholders, unify the royalty
   definition, subtract processing fees, archive the cut list. Then straight into the
   Phase 1 engine core.
