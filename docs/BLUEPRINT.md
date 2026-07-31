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

**The constraint that shapes everything below:** the builder is full-time available
but needs income soon. A 9-month zero-revenue build is not survivable. Therefore the
sequencing in §9 deliberately front-loads cash and treats the platform as something
that emerges from paid work, not something built on spec before the first dollar.

**The one-line architectural thesis:**

> Every vertical differs only in *how revenue arrives* and *what it's called*.
> The split rules, ledger, statements, payouts, and tax reporting are identical.
> Build that middle once, behind two thin seams, and new verticals cost weeks.

---

## §1. Open decisions — my recommendation, your call

React to these rather than answering from scratch. Each has a default I'd ship.

| # | Decision | My recommendation | Why |
|---|---|---|---|
| ⬜ 1 | Does the platform hold funds? | **No. Orchestrate only.** Each tenant connects their own Stripe; we instruct their account to pay their contributors. We never custody money. | Holding funds = money transmission = state licensing, bonding, audits. Not a solo path. This single choice is the difference between shipping this year and needing a compliance budget. |
| ⬜ 2 | Do contributors get a login? | **Yes, Phase 1.** | It's the trust problem that makes merchants switch, it's the thing incumbents don't do, and you already built it (`artist-earnings.tsx`, `artist-payouts.tsx`). Adding a second user class to a live multi-tenant schema later is a genuine retrofit. |
| ⬜ 3 | First revenue source adapter | **Shopify.** | You have it working, and the App Store is the only distribution channel in reach that doesn't cost money. |
| ⬜ 4 | Fate of 369 Art Collective | **Keep live as tenant #1.** | You cannot credibly sell payout software having never made a payout. It's also your only source of real transaction data and your first case study. |
| ⬜ 5 | Free tier? | **No. Paid from day one, 14-day trial.** | B2B payout software with a free tier attracts the highest-support, lowest-value users. People with this pain have budget. |
| ⬜ 6 | Multi-currency at launch? | **Store currency on every amount; support USD only in Phase 1.** | The schema cost is near-zero now and brutal later. The feature can wait. |
| ⬜ 7 | Custom formula scripting for tenants? | **Never. Structured rules only.** | Arbitrary tenant-authored code is a security and support catastrophe. See §10. |
| ⬜ 8 | Name / brand | **Decide before the App Store listing, not before the build.** | Don't let naming block engineering. |

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

**Current state: there is no refund handling in the payout path at all.** The only
refund logic in the repo is for AI credits (`routes.ts:4573`). If an order refunds
after a contributor is paid, nothing happens today.

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

## §9. Phasing — revised for the income constraint

You need money before a SaaS can plausibly pay. So the plan is **sell the work, then
productize what you're already doing** — the lowest-risk path from unemployed to
software revenue, and it doubles as customer development.

### Phase 0 — Fix what's broken (weeks 1–2)
Necessary under every scenario, and it's what makes the system honest.
- Fix the **hardcoded cost placeholders** (`order-processor.ts:163-164`) — real
  Printify costs via API. *Today every royalty is computed from invented numbers.*
- Collapse the **three conflicting royalty definitions** into one canonical basis.
- Subtract payment processing fees from net.
- Archive the cut list (influencer gamification, AI studio, recruitment residuals,
  featured rotation) to a dormant branch.

### Phase 1 — Cash now, in parallel with build (weeks 2–10)
Pick the fastest path to a paid invoice. My ranking:

1. **Reconciliation-as-a-service.** Find 3–5 POD brands paying multiple designers.
   Offer to run their monthly artist payouts *for* them — $300–800/month each. You do it
   semi-manually using your own tooling. This is the best option by a distance: it pays
   now, it *is* customer development, those clients become tenants #2–6, and every
   manual step you hate becomes a prioritized feature.
2. **Trade/commercial art sourcing** — outbound to STR operators and interior
   designers, using the storefront that already exists. Higher AOV, longer cycle.
3. **Contract dev work** — unglamorous, protects runway, zero strategic value.

Target: **$2–4k/month recurring by week 10.**

### Phase 2 — Engine core, single tenant (weeks 6–16, overlapping)
Build the middle box in §4 with all fourteen §5 decisions honored. Ingest Shopify.
Pay via Connect. Contributor login. **369 Art Collective runs on it as tenant #1**, and
your service clients get migrated onto it one at a time — replacing your manual labor
with software you're already being paid for.

### Phase 3 — Multi-tenant + self-serve (months 4–7)
Shopify OAuth and embedded app, tenant onboarding, Stripe Billing for subscriptions,
the split-rule builder UI, statements, 1099 export. App Store listing.

### Phase 4 — Second adapter (months 7–9)
Ship **one** additional adapter to prove the seam. CSV statement import is the highest-
leverage choice: it unlocks music, publishing, and stock licensing simultaneously, and
it's the format every non-Shopify vertical already lives in.

### Phase 5 — Vertical expansion
Driven by inbound demand, not speculation. Landing page + rule templates + adapter.

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
4. **Perfecting the engine while runway burns.** Your constraint is income, and the
   §5 list is calibrated to be the *minimum* worth doing up front — resist extending it.
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

## §12. Pricing (Phase 3 onward)

| Tier | Price | Bounds |
|---|---|---|
| Starter | $49/mo | up to 5 contributors, 500 events/mo |
| Growth | $99/mo | up to 25 contributors, 5k events/mo |
| Scale | $199/mo | up to 100 contributors, 25k events/mo |
| Custom | talk | above that, or multi-store |

14-day trial, no free tier. **200 customers at $99 ≈ $238k ARR** — hold that against
what the marketplace needed (hundreds of thousands of art buyers, bought against
Society6's ad budget). Two hundred is a number you can picture reaching.

Do **not** price on percentage-of-payout-volume. It looks attractive, it aligns
incentives nicely, and it makes you look like a payments company to Stripe and to
regulators. Flat SaaS pricing keeps the §11 posture clean.

---

## §13. Kill criteria — decide these now, while you're unbiased

Write these down before you're emotionally invested:

- **Week 10:** if reconciliation-as-a-service has produced $0 despite 50+ real
  conversations → the pain isn't acute enough to pay for. Stop and reassess.
- **Month 7:** if the App Store listing produces <10 installs in 60 days → distribution
  assumption is wrong; pivot to direct outbound or a different vertical.
- **Month 12:** if MRR < $2k → this is a services business, not a software business.
  That's a legitimate outcome, not a failure — but stop investing in the platform.
- **Any time:** if a well-funded incumbent ships this natively in Shopify → stop
  building horizontally, go deep on one vertical they won't serve (music recoupment,
  for instance).

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

1. **You:** react to the ⬜ decisions in §1.
2. **You, this week, before any code:** an afternoon in the Shopify App Store searching
   "royalty," "artist payouts," "commission split," "creator payouts." Find out who's
   already there and whether they actually move money or only track affiliate
   commissions. This is the single fact most likely to kill or confirm the whole plan.
3. **You, weeks 1–2:** start the reconciliation-as-a-service outreach. It's the income
   and the customer development at once, and it does not depend on any code being ready.
4. **Me, on your go-ahead:** Phase 0 — fix the cost placeholders, unify the royalty
   definition, subtract processing fees, archive the cut list.
