# Who else does this

The first real market data this project has had. Written 2026-08-03.

> ## ⚠️ UNVERIFIED
>
> This came from an AI-generated summary the user pasted in, not from reading the
> listings. **Treat every number as a claim, not a fact.** The pricing figures in
> particular are load-bearing enough that acting on them without checking would be
> a mistake.
>
> **Verify before use:** open each app's Shopify App Store listing and read its
> own pricing page. Five minutes. Then delete this box and note the date it was
> checked.

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

### Reported pricing

| Tier | Price | Bound |
|---|---|---|
| Basic | $19/mo | up to 3 collaborators |
| Essential | $39/mo | up to 10 |
| Premium | $59/mo | up to 50 |
| Plus | $79/mo | unlimited |

14-day trial. Gateway fees separate.

### What that means against our §12 placeholders

| People | CollabPay | Us | Multiple |
|---|---|---|---|
| ~10 | $39 | **$49** | 1.3× |
| ~50 | $59 | **$99** | 1.7× |
| 200 / unlimited | $79 | **$199** | 2.5× |

**We are more expensive at every tier and the gap widens with size.** Their
unlimited tier undercuts our 200-person tier by $120/month.

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

- **A refund or chargeback that lands AFTER the contributor was paid.** Recoup
  from future earnings, absorb it, or hold a reserve. This is the single hardest
  thing in our engine and the one most likely to be genuinely unmatched.
- **Advances and recoupment.** Built here; a publishing or music requirement.
- **Sales that did not come from Shopify.** The CSV importer.
- **Year-end payment reporting.**
- **An immutable record of who changed what.**
- **A stored derivation for every payment** — not "here is your total" but
  "here is the sale, the costs, the rule and its version, and the arithmetic".

**If that list survives contact with the real listings, it is the listing copy
and the price justification in one.** If it does not, the pricing conversation
gets harder and should be had properly.

---

## The one research task this does not replace

Track A item 3 asks for something this summary cannot give: **what the one-star
reviews say.** Pricing tables describe what a product claims; angry reviews
describe where it actually fails. That is what should set our price and our
listing copy, and it is an afternoon's work.

Specifically worth extracting from CollabPay's negative reviews:

- Does anything go wrong with refunds?
- Do creators dispute the numbers, and can the merchant answer them?
- Does it break at any particular scale?
- What do people say when they leave for something else?
