# What's built, and what isn't

An honest map of the distance between here and a product someone pays for.

Written for the owner. Kept current as things land — if this file says something is
missing and it isn't, fix the file.

Last updated: 2026-07-31 (step 1 of the build order below is done).

---

## The short version

**The engine is done.** Money comes in, gets split correctly, gets recorded
permanently, survives refunds, and goes out — with an explanation attached to every
number. That is the hard part, and the part that is expensive to fix later.

**The product around it is roughly 60% there.** What's left is mostly plumbing and
screens rather than new architecture. The decisions that were costly to get wrong
have been made and tested.

**One thing worth naming plainly:** there is currently no way to charge a customer.
That's easy to leave until last and then discover is the thing standing between
working software and a business.

---

## ✅ Built and verified

- The revenue engine — events, split rules, immutable ledger, refunds and clawbacks
- Payout batches with a proper state machine, holds, minimums and retries
- The **contributor portal** at `/portal/:tenantSlug` — an artist signs in and sees
  every payment with its full derivation
- The **owner console** at `/manage/:tenantSlug` — dashboard, people, review queue,
  rates, payout preview and run
- Rate editing with versioning (past payments never change)
- Adding and editing people
- Resolving stuck items — assign, dismiss, write off
- Demo data (`npm run seed:demo`)
- **The Shopify sales connection** — signed webhooks, one event per line item,
  discounts and tax handled correctly, refunds and cancellations reversed,
  re-deliveries ignored. Runs against practice data; needs a Partner account to
  point at a real store.
- **The Stripe payment connection** — transfers instructed against the business's
  own Stripe account, retries that cannot double-pay, failures written in plain
  language. Refuses to move money when nothing is configured.
- **Store credentials encrypted at rest**, so a database backup is not a set of
  live keys to somebody's shop.

266 unit tests, 141 end-to-end checks against a real database, every screen driven
in a real browser, and the webhook endpoint exercised over real HTTP.

---

## ❌ Not built

### Group 1 — Blocks selling this to anybody

| Missing | What it means | Waits on |
|---|---|---|
| ~~Shopify connection~~ | **Built.** Sales arrive, split and land in the ledger. Pointing it at a real store needs the Partner account — a settings change, not a build. | Partner approval only |
| ~~Stripe transfers~~ | **Built.** The real provider exists and refuses honestly when unconfigured. Pointing it at real money needs Connect. | Connect verification only |
| **Connect-a-store screen** | The connection is stored and used correctly, but there's no screen to create one — it's inserted by hand today. Small, and only worth doing once the Partner account exists. | Partner approval |
| **Artist bank onboarding** | No way for a contributor to connect their account. Currently set by hand in the database. | Connect verification |
| **Customer billing** | **No way to charge a business for using this.** | Nothing — buildable now |
| **Customer signup** | No way for a business to create an account. You'd add them yourself. | Nothing — buildable now |

Note the pattern: the first four wait on other people, the last two don't.

### Group 2 — Completes "run it without a developer"

| Missing | What it means |
|---|---|
| **Artwork screen** | The API exists; there's no tab. You can add people but not their works. |
| **Business settings screen** | Refund window, minimum payout and clawback policy live in the database only. |
| **Password reset** | For both the portal and the console. |
| **Audit log viewer** | Every change is recorded; nothing displays it. |

### Group 3 — Needed before real customers, not before a demo

| Missing | What it means |
|---|---|
| **Email** | Nobody is told they've been paid, or that something needs review. |
| **1099 export** | US tax reporting for contributors. Stripe issues the forms; we supply the data. |
| **Multi-currency** | USD only by decision. Fine until a non-US customer appears. |

### Group 4 — Opens new markets

| Missing | What it unlocks |
|---|---|
| **CSV import** | Music, publishing and stock licensing all at once — they already live in spreadsheets. |
| **Advances / recoupment** | Music and book publishing specifically. A known gap in the rule shape — see blueprint §10b. **Don't sell to those industries until it exists.** |

---

## The order to build it

Chosen so each step is useful on its own and nothing waits unnecessarily.

**1. Shopify and Stripe, built against fixtures. ✅ DONE.**
Both are written and tested without credentials, exactly as the cost resolver and
payout executor already were. When the Partner account and Connect verification come
through, it is a swap rather than a build. The approvals now wait on *themselves*
rather than on us — which was the whole point of doing this first.

A question came out of it — who absorbs card fees — and the answer turned out to be
that it was already answered. Whether a fee reduces someone's share is part of
**their rate**, per person and effective-dated, not a store-wide switch. Recorded in
`docs/SOP.md` §6c.

What *is* a store setting is narrower: what to do when the fee cannot be read at all,
which happens with PayPal and most non-Shopify payment methods. Hold the sale
(default) or carry on without it. Fees that *can* be read are always recorded, so
margin reporting stays honest either way. Nothing is ever guessed.

**2. Artist bank onboarding.**
Without it, nobody can be paid even once Stripe is connected. Naturally follows
Stripe.

**3. Artwork and settings screens.**
Finishes the job of making the system operable by you rather than by a developer.
Small, and each is independently useful.

**4. Customer billing and signup.**
Turns working software into a business. Deliberately after the above, because there
is no point charging for something not yet fully operable — but not left to the very
end either.

**5. Email, 1099, audit viewer.**
Polish that real customers will expect and a demo won't miss.

**6. CSV import, then advances.**
New markets. Only worth doing when there's demand pointing at them — and advances
specifically should wait for a real publishing or music conversation, so the shape
is drawn from a real deal rather than guessed at.

---

## What genuinely can't be rushed

Three things, none of which go faster by building faster:

1. **Shopify Partner review** — 1–3 weeks per cycle, usually more than one cycle.
2. **Stripe Connect verification** — days to weeks.
3. **Real chargeback data** — 30–120 days after real sales start. The refund
   handling is built and tested, but it has never met a real dispute.

Everything else is effort, and effort is under your control.
