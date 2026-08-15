# Who else does this

The first real market data this project has had. Written 2026-08-03.
**Partially verified 2026-08-06** — see the two boxes below.

> ## ⚠️ STILL UNVERIFIED: EVERY PRICE EXCEPT CollabPay's
>
> The pricing tables came from an AI-generated summary the user pasted in, not
> from reading the listings. **Treat every number as a claim, not a fact** —
> except CollabPay's, which was verified 2026-08-15 from screenshots of their
> own pricing page and turned out to be exactly right.
>
> Puppet Vendors, UpPromote, Refersion and the rest are still summary-derived.
> **Verify before use:** open each app's listing and read its own pricing page.
> Then correct the tables here and note the date.

> ## ✅ VERIFIED 2026-08-06 — CollabPay's own marketing material
>
> The user supplied CollabPay's published flow infographic. What it establishes,
> first-hand rather than by summary:
>
> 1. **They do not hold funds either.** Their own words: *"CollabPay does not
>    handle payments directly, rather it instructs payments via PayPal or Stripe.
>    Payouts occur directly from you to your collaborators."* That is the same
>    architecture as ratified decision #1. **It is therefore NOT a
>    differentiator** — it is table stakes in this category, and any positioning
>    that leans on "we never touch your money" is describing the competition too.
> 2. **They cover Shopify, WooCommerce AND Squarespace.** We cover Shopify plus
>    CSV import. Broader native channel coverage than ours on the storefront
>    side; ours is broader off-storefront, since a record label or a press with
>    no online store at all can still be a customer.
> 3. **They read costs, tags, discount codes and affiliate referrals** off the
>    order (their step 07). Closer to our cost-resolution work than the text
>    summary suggested. "We subtract real costs before splitting" is not by
>    itself a distinguishing claim.
>
> **What this does NOT tell us**, and what the "what nobody appears to do" list
> below still hangs on: refunds landing after a payout, advances and
> recoupment, a stored derivation per payment, and year-end reporting. A flow
> diagram showing eleven happy-path steps is silent about the unhappy ones.

---

## The one that matters: CollabPay

**This is the direct competitor.** Not adjacent — the same job.

Reported to do: connect to Shopify orders, assign a percentage or flat royalty
per product per creator, split on **gross or net**, apply **shipping and discount
deduction rules**, pay out via Stripe or PayPal, handle tax settings, and give
each creator **a dashboard showing their earnings live**.

That last one is worth sitting with. The contributor portal has been described
throughout this project as the differentiator. If CollabPay ships a creator
dashboard, the differentiator is not "we show the artist something" — it is
*what* we show them, which is the full derivation of every number.

### Verified pricing (2026-08-15, from their own pricing page)

The summary was **exactly right on every number**. Recorded so the next reader
knows the figures below are first-hand, not inferred.

| Tier | Monthly | Annual | Collaborators |
|---|---|---|---|
| Basic | $19 | $190 | 3 |
| Essential | $39 | $390 | 10 |
| Premium ← *"Most popular"* | $59 | $590 | 50 |
| Plus | $79 | $790 | unlimited |

14-day free trial on all plans. Annual is 10× monthly — "two months free", the
same discount shape we independently chose (`ANNUAL_MONTHS_CHARGED = 10n`). All
prices USD. Gateway fees separate.

### The thing the summary missed: they gate features, we don't

This is the finding that actually matters, and no summary would have surfaced it.

| Feature | Basic $19 | Essential $39 | Premium $59 | Plus $79 |
|---|---|---|---|---|
| Collaborators | 3 | 10 | 50 | unlimited |
| Unlimited payouts/month | ✅ | ✅ | ✅ | ✅ |
| White label | ❌ | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ | ✅ |
| Advanced payouts | ❌ | ❌ | ✅ | ✅ |
| Integrate with multiple platforms | ❌ | ❌ | ✅ | ✅ |

**Basic and Essential are the same product with different seat counts.**
Everything beyond "split it and pay them" starts at $59.

We have no feature gating at all — every plan is the whole engine, bounded only
by people paid in a month. That was never a positioning decision; it fell out of
`plans.ts` having one limit and no flags. It is now a differentiator worth
stating: their $39 customer cannot reach an API or run more than one platform.

### What that means against our §12 placeholders

The old comparison in this file put our $49 against their $39 and called it
1.3×. That compared unlike things. Two comparisons, both honest:

**At feature parity** — against Premium, their cheapest tier with API access,
white label and multi-platform:

| People | CollabPay | Us | |
|---|---|---|---|
| ~10 | $59 (Premium) | **$49** (Starter) | **we undercut by $10** |
| ~50 | $59 (Premium) | **$99** (Growth) | 1.7× |
| 200 | $79 (Plus) | **$199** (Scale) | 2.5× |

**At the price a small prospect actually sees** — if they don't need the gated
features, they compare our $49 to their $39, and we are 1.3× dearer.

So the shape of the problem has changed:

- **At the small end we are no longer clearly more expensive.** A 10-person shop
  that wants an API pays them $59 and us $49.
- **At the top end the gap is worse than it looked**, because their $79 Plus is
  unlimited *and* fully featured. $79 against our $199 is the real fight.

This does **not** automatically mean our numbers are wrong. It means they now
need defending against a visible cheaper anchor, which is a different sales
problem than pricing into a vacuum. Two things genuinely soften it:

1. **Puppet Vendors is reported at $49 / $119 / $249** for 25 / 100 / 400
   vendors, which puts the category range at roughly $19–$249. Our $49/$99/$199
   is mid-market, not an outlier.
2. **We count people PAID IN A MONTH; they count collaborators on the books.**
   A gallery with 60 contributors who paid 8 this month pays us for 8 and pays
   CollabPay for 60. That is a real advantage and it is currently unstated on
   our pricing page. It should not be.

**The pricing decision is explicitly deferred** (user, 2026-08-03: *"wait for
now, I'll do some research"*). §12's four rules are unaffected — the *model* is
ratified, only the numbers are placeholders.

---

## The category splits in two, and the split matters

This is the most useful structural thing in the data.

| Cluster | Apps | The job |
|---|---|---|
| **Affiliate / commission** | Shopify Collabs, UpPromote, Refersion | Paying people for **driving sales** |
| **Royalty / profit split** | CollabPay, Puppet Vendors | Paying people for **making the thing** |

**We are unambiguously the second.** Three consequences:

1. **Shopify Collabs is free** (2.9% per payout, no subscription). It is Shopify's
   own app. Anything that positions us in cluster one puts us against free,
   for customers who do not want what we built.
2. **Cluster one prices on percentage of driven sales** — UpPromote reportedly
   $29.99 + 2%, Refersion $39 + 3%. That is normal *for affiliate tools*, where
   the app is credited with causing the sale. It is not a precedent for us, and
   §12 rule 4 (no percentage-of-volume, ever) is unaffected. If anything this
   sharpens the reason: percentage pricing is the affiliate world's convention,
   and adopting it would signal we are one of them.
3. **Naming must avoid cluster one's vocabulary.** See below.

---

## What this means for naming

Ratified decision #8 defers naming to the App Store listing, which is now. This
data narrows it usefully:

- **Avoid "commission" and "affiliate".** They read as cluster one. An earlier
  suggestion in conversation floated "commission" as a keyword — that was wrong
  and is retracted here.
- **Lean "royalty", "split", "payout".** Cluster two's words.
- **Avoid anything "Collab"-shaped.** CollabPay owns that ground in this store.
- **Do not make the name Shopify-flavoured.** The CSV importer means a record
  label or a small press can be onboarded with no store at all, and a
  Shopify-sounding name forecloses the vertical-agnostic thesis the whole
  product rests on.

Working shape: a brandable half plus a keyword half, e.g.
`Brand: Royalty Splits & Creator Payouts`. The brand half is expensive to change
and should be decided on judgement; the keyword half is free to change and
should be decided by the App Store research (Track A item 3), which is designed
to produce exactly the words real buyers type.

---

## What nobody in the list appears to do

Stated as a hypothesis to test, not a finding — absence from a summary is not
evidence of absence from the product.

**Two candidates were struck off on 2026-08-06** by CollabPay's own material: not
holding funds, and reading real costs off the order. Both are things they do too.
What is left is the list below, and it is now a shorter and more honest list.

- **A refund or chargeback that lands AFTER the contributor was paid.** Recoup
  from future earnings, absorb it, or hold a reserve. This is the single hardest
  thing in our engine and the one most likely to be genuinely unmatched.
- **Advances and recoupment.** Built here; a publishing or music requirement.
- **Sales that did not come from Shopify, WooCommerce or Squarespace.** The CSV
  importer. Note this is narrower than it looked: CollabPay covers three
  storefronts natively. Our edge is the customer with *no storefront* — a label,
  a press, a licensor working from a distributor's statement.
- **Year-end payment reporting.**
- **An immutable record of who changed what.**
- **A stored derivation for every payment** — not "here is your total" but
  "here is the sale, the costs, the rule and its version, and the arithmetic".

**If that list survives contact with the real listings, it is the listing copy
and the price justification in one.** If it does not, the pricing conversation
gets harder and should be had properly.

---

## ✅ The negative reviews — READ 2026-08-06. The best material we have

Supplied by the user from CollabPay's own listing. **This is verified, first-hand,
and it changes the positioning more than the pricing table did.**

### The numbers

25 reviews: 21×5★, 1×4★, 1×3★, 1×2★, 1×1★.

**That distribution averages 4.6, but the listing displays 3.5.** The discrepancy
is unexplained and is noted rather than resolved — possibly a different
aggregation window, possibly recency weighting. **Do not quote either figure as
fact.** What matters here is not the average: it is that **84% are five-star, so
this is not a broken product.** It is a working product with a narrow, expensive
failure mode and thin support. Positioning against it as "bad software" would be
wrong and would not survive a prospect actually trying it.

### The three negatives, in full

| Rating | Who | Tenure | The complaint |
|---|---|---|---|
| 1★ | Geometry Wholesale (US) | **13 days** | 50+ collaborators, **highest tier**. Same issue reported repeatedly, a different support person each time, never resolved. Told their support emails "got lost". |
| 3★ | Matik Design (Australia) | 27 days | Setup "quite tricky", UI needs work. **PayPal payouts are not automatic** — you must contact PayPal and be approved, and this is not stated up front. Stripe "extremely complicated to set up". Currency conversion wrong. |
| 2★ | Science Collective (Canada) | 9 months | CAD shop paying a USD collaborator. **The app calculated in CAD and paid out in USD without converting — resulting in overpayment.** Support did not help, then ignored follow-ups, then replied defensively once the review appeared. |

### Four things this establishes

**1. The top complaint is support, not features.** Two of the three are primarily
about nobody answering. That is an operational weakness, and it is the one kind of
advantage a small operation can actually take — *by answering email*. It costs no
engineering and cannot be copied by shipping a feature. It is also the easiest
thing in the world to lose the moment we have twenty customers, so if it becomes
part of the pitch it has to be resourced, not just promised.

**2. Currency is their recurring product defect, and in Canada it caused
OVERPAYMENT.** Two independent reviewers, different countries, months apart. This
is the exact failure our standing rule names as unrecoverable: *not paying is
recoverable, overpaying is not*. The merchant sent real money they cannot get
back, and support went quiet.

**We checked ourselves against this on the same day and we do not have it.** There
is no currency conversion anywhere in the engine: balances are grouped by
`(contributor, currency)`, advances are filtered to the matching currency, the
rules engine refuses to mix via `assertSameCurrency`, and a payout carries the
ledger row's own currency straight through to Stripe. It cannot compute in one
currency and pay in another because it never converts at all.

⚠️ **That is not the same as "we support multi-currency", and the distinction must
not blur in marketing copy.** Ratified decision #6 is USD-only for Phase 1, and we
have two real gaps of our own — a single minimum-payout threshold applied across
every currency, and no currency symbol for anything but USD. Both are recorded in
`docs/WHATS-LEFT.md`. Neither can overpay anybody. **The honest claim is
"structurally incapable of paying the wrong currency", not "handles your
currency".** Claiming the second would earn us the same review.

**3. Connecting the payout rails is where customers get stuck.** PayPal mass
payouts need separate approval nobody warns them about; Stripe setup is "extremely
complicated". This is precisely what `server/engine/payout-account.ts` exists for —
hosted Account Links, status read back from Stripe rather than assumed. **It should
be demonstrated, not described**, and the listing should state plainly what a
contributor has to do and how long it takes.

**4. The 1★ was their highest-paying customer and churned in 13 days.** 50+
collaborators on the top plan — the same profile that would pay us our top tier.
Whatever the underlying issue was, it was fatal inside two weeks at the exact size
where this software stops being a convenience.

### What the reviews do NOT settle

- **Refunds after payout.** Nobody mentions one. Still our strongest hypothesis
  and still untested — no evidence either way.
- **Whether contributors dispute the numbers.** No review touches it, so the
  stored-derivation argument remains unproven as a felt pain rather than a
  theoretical one.
- **Scale limits.** The 1★ is suggestive at 50+ collaborators but the actual
  issue is never named.

### What this is worth to the listing copy

Three claims that are now evidence-backed rather than guessed, and each is
defensible because it is narrow:

1. Payments are computed and paid in the currency they were earned in, and the
   system never converts — so it cannot pay the wrong amount in the wrong money.
2. Every payment shows the sale, the costs, the rule and its version, and the
   arithmetic — so a contributor asking "why is this number this?" is answered on
   screen instead of by email.
3. Setting up the payout account is a hosted flow, and the status comes from
   Stripe rather than from having finished a form.

**None of those is "we are cheaper" and none is "they are bad."** That is
deliberate: 21 of 25 customers are happy, and a pitch that contradicts a
prospect's own trial is worse than no pitch.

---

## Research status

**Track A item 3 is now done for CollabPay.** Reviews read (2026-08-06), pricing
verified from their own page (2026-08-15). The summary's numbers were right; what
it missed was the feature gating, which changed the comparison more than any
number did.

**Still open:** every other vendor's pricing — Puppet Vendors, UpPromote,
Refersion — is still an unverified AI summary. Puppet Vendors matters most,
because the claim that our $49/$99/$199 sits mid-market rather than high rests
on their reported $49/$119/$249. If that is wrong, the mid-market argument goes
with it.

**Still deferred:** the pricing decision itself (user, 2026-08-03: *"wait for
now, I'll do some research"*). The research now says our top tier is the exposed
one — $199 against a fully-featured unlimited $79 — and our entry tier is
stronger than we thought.
