# What's built, and what isn't

An honest map of the distance between here and a product someone pays for.

Written for the owner. Kept current as things land — if this file says something is
missing and it isn't, fix the file.

Last updated: 2026-08-02 (steps 1-4 done; step 5 done except the audit viewer).

---

## The short version

**The engine is done.** Money comes in, gets split correctly, gets recorded
permanently, survives refunds, and goes out — with an explanation attached to every
number. That is the hard part, and the part that is expensive to fix later.

**The product around it is roughly 60% there.** What's left is mostly plumbing and
screens rather than new architecture. The decisions that were costly to get wrong
have been made and tested.

**There is now a way to charge a customer.** Signup, trials, plans and subscription
billing are built and tested. What they are not is *switched on* — that needs our own
Stripe key, which is a settings change rather than a build.

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
- **Artist bank onboarding** — a contributor connects their own bank through
  Stripe from their portal. You never see or store their details, and "ready to be
  paid" is read back from Stripe rather than assumed from a finished form.
- **The works screen** — what you sell, and who earns from each. Archiving rather
  than deleting, so past payments stay explicable.
- **The settings screen** — hold period, minimum payout, and what happens when a
  customer refunds after you've paid.
- **Password reset** — for artists and for you. A link by email, good for an hour
  and usable once. Nobody has to ask you to reset anything by hand.
- **The Changes tab** — who changed what, and when, in plain English. Rate
  switch-offs, settings, held sales resolved, plan changes, report downloads.
- **Recording a cost the sales channel never sent** — a payment fee that PayPal
  didn't report can be typed in from the statement before the sale is assigned,
  instead of the business silently swallowing it.
- **Pricing, signup and billing** — a business creates its own account at
  `/pricing`, runs a 14-day trial with no card, and subscribes monthly or yearly.
- **The daily job** — the two reminders that are due because time passed rather
  than because somebody clicked something.
- **Year-end payment reporting** — what you paid each person in a calendar year,
  on screen and as a spreadsheet, with the people whose tax details are missing
  called out.

406 unit tests, 269 end-to-end checks against a real database, every screen driven
in a real browser, and the webhook endpoint exercised over real HTTP.

---

## ❌ Not built

### Group 1 — Blocks selling this to anybody

| Missing | What it means | Waits on |
|---|---|---|
| ~~Shopify connection~~ | **Built.** Sales arrive, split and land in the ledger. Pointing it at a real store needs the Partner account — a settings change, not a build. | Partner approval only |
| ~~Stripe transfers~~ | **Built.** The real provider exists and refuses honestly when unconfigured. Pointing it at real money needs Connect. | Connect verification only |
| **Connect-a-store screen** | The connection is stored and used correctly, but there's no screen to create one — it's inserted by hand today. Small, and only worth doing once the Partner account exists. | Partner approval |
| ~~Artist bank onboarding~~ | **Built.** An artist connects their own bank from their portal; readiness is read back from Stripe. Needs Connect before it points at real banks. | Connect verification only |
| ~~Customer billing~~ | **Built.** Plans, trials, and a subscription charged through Stripe. Needs our own Stripe key to go live. | Nothing — a settings change |
| ~~Customer signup~~ | **Built.** A business signs itself up at `/pricing` and lands on a 14-day trial. | Nothing |

Everything left in this group waits on somebody else.

### Group 2 — Completes "run it without a developer"

| Missing | What it means |
|---|---|
| ~~Works screen~~ | **Built.** Add, edit and archive pieces, and say who earns from each. |
| ~~Business settings screen~~ | **Built.** Hold period, minimum payout and refund policy, all editable. |
| ~~Password reset~~ | **Built.** Both sign-ins. Link expires in an hour and works once. |
| ~~Audit log viewer~~ | **Built.** A Changes tab: who changed what, and when. |

### Group 3 — Needed before real customers, not before a demo

| Missing | What it means |
|---|---|
| ~~Email~~ | **Built.** Artists are told when they are paid; you are told about trials, failed payments and stuck sales. Needs a Resend key to send. |
| ~~1099 export~~ | **Built.** What you paid each person in a year, on screen and as a spreadsheet. Stripe still issues the forms. |
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

**2. Artist bank onboarding. ✅ DONE.**
An artist signs in to their portal and connects their own bank through Stripe. You
never see or store their bank details — Stripe holds them, which is the whole point
of using Connect.

One decision inside it is worth knowing about: **"ready to be paid" is read back
from Stripe, never inferred from the artist finishing the form.** Finishing the form
and being cleared to receive money are different events — verification can take days
and can be revoked later. Assuming they are the same is how a payout run fails
halfway through, which is the expensive kind of failure. The status is re-checked, so
a later suspension shows up without anyone having to sign in again.

**3. Works and settings screens. ✅ DONE.**
Finishes the job of making the system operable by you rather than by a developer.
Both are now tabs in the console, and a third thing came with them.

Called "works", not "artwork", and that is not pedantry. A *work* is whatever a
sale gets attributed to — a painting, a track, a book, a course, a design. The
engine's table is `works` and its rows carry no medium, so the same screen serves
a record label and a print shop without a fork. Wherever these notes have said
"artwork" they were describing the first vertical, not the product; the shipped
code has never used the term outside example comments.

The **works screen** is the attribution map — where "a sale arrived" becomes "and
these people are owed something for it". Works can be archived but never deleted, so
a payment made two years ago can still say what it was for.

The **settings screen** covers the hold period, the minimum payout, and what happens
when a customer refunds after you have already paid. One thing it says on screen
rather than burying: **changing the hold period is not retroactive.** Money already
earned keeps the release date it was given, so shortening the window does not free it
up early. That is deliberate — a date somebody has already been shown should not move
under them — but it surprises people, so the screen warns as you change it.

The third thing: **you can now type in a cost the sales channel never reported.**
Some payment methods, PayPal especially, never say what their fee was. The system
refuses to guess, so those sales stop for review. Until now the only way past that
was to pay the artist with no fee deducted at all — the business quietly swallowed
it, and every screen still looked correct. Now the fee is entered from the provider's
statement before the sale is assigned. It can be corrected freely right up until
somebody is paid from it, and not afterwards.

**A cross-tenant bug was found and fixed while building this.** Attaching a person to
a work never checked that the person belonged to your business — the database's own
constraints were satisfied either way. Naming another business's person would have
put a stranger in line to be paid out of your sales. It was reachable only by
hand-crafting a request rather than through any screen, and nothing had been paid,
but it is exactly the class of bug a multi-tenant system must not have. There are now
two end-to-end checks holding it shut.

**4. Customer billing and signup. ✅ DONE.**
A business signs itself up at `/pricing`, picks a plan, and gets 14 days free without
a card. Monthly or yearly — yearly is ten months' price for twelve.

Four things inside it are worth knowing, because they are decisions rather than
mechanics:

- **Plans are counted on people you actually pay in a month**, not people on your
  books. A quiet month costs less.
- **Going over your plan never blocks a payout.** Everyone gets paid, you get told,
  and the plan moves up at renewal — after notice, never as a surprise charge.
- **A failed card does not switch the product off.** Suspending a business over $49
  would stop *artists* getting paid, and they had no part in it.
- **When a trial ends without a card, the account goes read-only** rather than being
  locked. Every record stays visible; payouts stop until they choose a plan.

It also tells a customer when they are paying for *more* than they use. That costs
money, and it is the reason the rest of it is believable.

**5. Email ✅ DONE. The daily job ✅ DONE. Year-end tax reporting ✅ DONE. The
audit viewer remains.**

An artist gets an email when they are paid, naming the business and linking to
the full breakdown. You get told when a trial is about to end, when a payment
fails, when sales are stuck waiting for you, and when somebody signs up.

Three things it does deliberately:

- **A mail problem can never break a payout.** Emails go out after the money has
  moved, and a failure is recorded rather than raised. Nobody's payment fails
  because a mail server was briefly unreachable.
- **Nobody is ever told twice.** Being told twice that you have been paid reads
  as being paid twice, which is the worst kind of support call.
- **The numbers in an email match the screen exactly.** Same formatting, same
  dates. A statement that disagrees with an email looks like a discrepancy worth
  disputing.

Two of the emails needed care rather than code. The trial-ending one says
plainly that **nothing is deleted** — the account goes read-only, and a customer
who assumes their records are gone does not come back. The failed-payment one
says **nothing has been switched off**, because that is true, and an owner who
panics that their artists have stopped being paid is panicking about something
that is not happening.

**The daily job ✅ DONE.** The trial and stuck-sales emails now fire on a timer
rather than needing somebody to trigger them.

Two things about it are decisions rather than mechanics:

- **The trial warning goes out in the last three days, not on day one.** Each
  trial gets exactly one warning, so sending it early would spend it saying
  "your trial ends in 14 days" and then say nothing in the week that matters.
- **It is safe to run over and over.** The job re-runs every hour and on every
  restart, and sends nothing new when there is nothing new. That is what
  removes the usual failure of scheduled work — the day the machine happened to
  be restarting at 3am, and nobody found out it was skipped.

It runs inside the app automatically. It refuses to run at all when email is
not configured, deliberately: it would otherwise mark every reminder as sent
without sending it, and those reminders could never be recovered.

`npm run job:daily` runs it by hand, and lets an external scheduler drive it
instead if the app is ever hosted somewhere that sleeps between requests.

**Year-end tax reporting ✅ DONE.** A Tax tab in the console showing what you
actually paid each person during a calendar year, and a spreadsheet to send your
accountant.

Four things about it are decisions rather than mechanics:

- **It shows what you PAID, not what people EARNED.** Every other screen in the
  console shows earnings. Tax reporting works on money that actually changed
  hands, so somebody who earned in December and was paid in January belongs to
  the following year. The screen says so, because an owner who reads it as the
  familiar number will think it is broken.
- **It does not file anything, and never claims to.** The money moves through
  your Stripe account, so Stripe issues the forms. What this gives you is your
  own record — the number your accountant files from, and the number you check
  Stripe's reporting against.
- **Tax ID numbers are deliberately not stored anywhere in this system.** Stripe
  collects and keeps them. Holding social security numbers would make this a far
  more sensitive system to run, for no gain, because the people who file already
  have them.
- **Nobody is filtered out.** People under the $600 federal threshold are listed
  and marked rather than hidden — several states are lower, the federal figure
  has moved before, and it is your accountant's call, not the software's.

What it leads with is the actionable part: **how many people you paid whose tax
details aren't on file.** Those are the ones that cannot be filed for, and the
fix is asking them to finish connecting their bank.

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
