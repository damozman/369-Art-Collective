# Track A — the five things that wait on other people

Written 2026-08-02, for you to work through. Plain language, no code.

Track A is everything that does **not** go faster if we build faster. Each item below
is a queue somebody else controls. The build list is finished, so this is now the only
thing on the critical path — which means the useful thing to optimise is *starting*
each one, not finishing it.

**Read this before starting any of them:** every item has a "what they will ask you
for" section. Most of the wall-clock in these processes is not the reviewer's time, it
is the round trip when you submit something incomplete and wait a week to find out.
Gathering the answers first is the single biggest lever you have.

---

## The five items, at a glance

| # | Item | Their clock | Your effort | What it unblocks here |
|---|---|---|---|---|
| 1 | Shopify Partner account + app | Account: minutes. App review: 1–3 weeks per cycle, usually 2+ cycles | A day, spread out | Pointing the built Shopify connection at a real store |
| 2 | Stripe Connect | Days to weeks | An afternoon | Money actually moving; contributor bank onboarding |
| 3 | App Store competitive research | None — nobody is reviewing you | One afternoon | Pricing confidence, listing copy, knowing who you're against |
| 4 | Design-partner conversations | Weeks of human response time | Ongoing | The rule shapes we are currently guessing at |
| 5 | 369 selling again | Yours | Ongoing | Real orders, real refunds, real chargeback data |

Items 1 and 2 can be started the same evening and then run in parallel while you do
3 and 4. Nothing about them is sequential.

---

## 1. Shopify Partner account and app

### What it is

Two separate things that get confused. **A Partner account** is free, instant, and is
just a login that lets you create apps. **An app listing on the Shopify App Store** is
a reviewed, published product — that is the part with a queue.

You do not need the listing to test. A **custom / unlisted app** installed on your own
store works immediately and is how we will prove the connection against 369's real
orders. The listing is for selling to strangers.

### The order to do it in

1. **Create the Partner account** — `partners.shopify.com`, free. Minutes.
2. **Create a development store** or connect 369's real store.
3. **Create an app in the Partner dashboard.** Get its API key and secret.
4. **Install it on 369's store** as a custom app. Now sales flow.
5. **Only later**, submit for App Store review, when you want strangers to install it.

Steps 1–4 need nothing from Shopify's review team. Do those first and get real order
data flowing months before you ever submit a listing.

### What they will ask you for (the listing, step 5)

- A business name and a support email that is monitored.
- A privacy policy URL and a terms URL that actually exist and load.
- An app icon and 3–5 screenshots of the app doing its job.
- A demo store, or a video, showing the whole install-to-value flow.
- **Justification for every permission you request.** Reviewers reject apps that ask
  for more than they use. Ours is narrow, which helps.
- GDPR webhook endpoints — **✅ BUILT 2026-08-03.** All three are live and tested,
  including the part review actually probes: a deliberately bad signature gets a
  401 rather than a 200. Two of the three answer "we hold no customer data",
  which is true — we never store a buyer's name, email or address.

### What our code actually needs from Shopify

Worth knowing so you can answer the permissions question without guessing:

- **Permission `read_orders`.** That is it for revenue. It covers the order and its
  transactions, which is where the real card fee comes from.
- **Note the 60-day limit.** `read_orders` only reaches orders from the last 60 days.
  Reading older history needs `read_all_orders`, which Shopify grants case by case.
  We do not need it for live sales — only if you ever want to import 369's back
  catalogue of orders, and the spreadsheet importer already covers that case.
- **Four webhooks**: order paid, order cancelled, refund created, and app uninstalled.
  The last one exists so an uninstalled app stops showing as "connected".
- One URL to point them at: the app's webhook address on our server.

### What is already built

Everything except the screen to enter the credentials. Signed webhooks, one earnings
event per line item, discounts and tax handled, refunds reversed, re-deliveries
ignored. It runs against practice data today. The connection is currently created by
hand in the database — the **connect-a-store screen** is the last piece, and it is
deliberately unbuilt until the Partner account exists so it is built against the real
thing rather than a guess.

### Expect

The Partner account and a working custom app: **one evening.** The App Store listing:
**1–3 weeks per review cycle, and plan for at least two cycles.** First-round rejection
is normal and is usually about listing copy, screenshots or a missing policy page —
not about the software.

---

## 2. Stripe Connect

### What it is

The part of Stripe that lets one business pay many individuals. It is what makes
"connect your bank" possible without you ever seeing anyone's bank details.

### The one question to settle while you are in there

**This is the most important sentence in this document.**

Our design says the business's own Stripe account pays its own people, and money never
passes through an account we control. That is deliberate — holding other people's money
would make this a regulated money transmitter, which is a different company with a
compliance budget.

What we have **never been able to verify** is whether Stripe lets us create those
contributor accounts *under the customer's Stripe account* on their behalf. The code is
written that way. Sandboxes cannot reach Stripe, so it has never run live.

**Ask Stripe directly, in the application or in support:**

> "I'm building a SaaS product where each of my customers has their own Stripe account
> with Connect enabled, and pays their own contractors through it. My software creates
> Express connected accounts and initiates transfers on my customer's behalf using
> their credentials. Funds never touch an account I control. Is that supported, and
> what do I need to be — a Connect platform myself, or a Connect app?"

If the answer is yes, nothing changes. If the answer is no, the fallback is that *we*
become the platform and each customer sits beneath us — which moves us closer to the
flow of funds and is a real conversation about company structure, not a code change.

**Do not promise a customer that "connect your bank" works until this is answered.**

### What is not ambiguous, and can start tonight

369 pays its own artists. **369 needs Connect enabled on its own Stripe account under
either answer.** That application can start immediately and settles nothing else — so
it is pure upside. Start with that.

### What they will ask you for

- Legal business name, EIN or SSN, and business address.
- What the business does, in a sentence, and your website.
- **How money flows**: who pays whom, for what, and when. Have a clear answer —
  "artists upload work, it sells on our Shopify store, we pay them a royalty on each
  sale after costs" is exactly right.
- Expected monthly volume and average payment size. Estimates are fine.
- A bank account for the business.
- Sometimes: your terms of service, and how you handle disputes.

### What our code needs, once approved

Two settings, no code change:

- Our Stripe secret key, in the server's configuration.
- The connected account id on the business's record.

Contributor accounts are created as **Express** accounts with the transfers capability.
Stripe hosts the onboarding, collects the bank details and the tax identity, and does
the identity verification. We never see any of it — which is also why there is no tax
ID number anywhere in our system, and no column for one.

### Expect

**Days to weeks.** Straightforward businesses clear quickly. Anything Stripe considers
higher-risk gets a manual review. The verification of *individual contributor* accounts
is separate and happens per person, later, and can take days each — which is why the
system reads "ready to be paid" back from Stripe rather than assuming a finished form
means a working bank account.

---

## 3. App Store competitive research

### What it is

One afternoon of looking at what already exists in the Shopify App Store, so the
listing and the pricing are informed rather than invented.

Nobody is reviewing you. There is no queue. This is the cheapest item on the list and
the one most likely to change a decision, which is a good ratio.

### What to actually do

Search the Shopify App Store for: `royalty`, `commission`, `payout`, `split payment`,
`affiliate`, `vendor payout`, `consignment`, `multi vendor`.

For each app that looks close, write down:

- **What it charges, and on what basis.** Flat tier, per user, or a percentage of
  volume. If several charge a percentage, that is a signal about what buyers accept —
  though our position that percentage pricing is wrong is settled and is not up for
  revisiting on the basis of what competitors do.
- **Its review count and rating.** Review count is the only public proxy for how many
  customers an app has. An app with 12 reviews in four years is a market signal.
- **What the one-star reviews complain about.** This is the single most valuable input
  in the whole exercise. People describe the exact failure that made them leave.
- **Whether it does the hard part.** Most "commission" apps split a number and stop.
  Ask: does it handle a refund after the person was already paid? Does it show the
  contributor a statement they can check? Those are the two things we built that are
  genuinely expensive, and if nobody else does them, that is the listing copy.

### What to come away with

Three things, written down somewhere:

1. A price you believe, or a reason to change the $49/$99/$199 placeholders.
2. One sentence saying what we do that the closest competitor does not.
3. A list of the words real buyers use for this problem — which are the words the
   listing has to use, not ours.

### Expect

**An afternoon.** Do this one first if you want the fastest useful result, because
items 1 and 2 involve waiting and this one does not.

---

## 4. Design-partner conversations

### What it is

Five to ten conversations with businesses that pay people a share of revenue, to see
**their actual deal structures and their current spreadsheet.**

This is not selling and it is not a services business. You are not offering to do their
reconciliation. You are asking to see how they currently do it.

### Why this one genuinely matters

We made a deliberate bet: the split-rule system was built to a shape we designed rather
than to structures a real customer showed us. That bet is defensible because rules are
stored as data, so a wrong guess about *which* structures matter is a configuration
change rather than a rewrite.

What we cannot fix cheaply is a wrong guess about the **shape**. If a real deal cannot
be expressed at all without changing the shape, that is the signal we agreed to watch
for. These conversations are the only way to get it.

### Who to talk to

- 5–10 print-on-demand or merch brands that pay artists or designers.
- **And at least two outside that vertical** — a small record label, a small press, a
  stock-photo or font seller. The whole thesis is that this is not an art product, and
  a sample made entirely of art businesses cannot test that.

### What to ask

Five questions. Not a demo — a demo teaches you nothing at this stage.

1. **"How do you work out what each person is owed?"** Let them describe it. Do not
   suggest anything.
2. **"Can I see the spreadsheet?"** The single highest-value ask in the list. A real
   spreadsheet contains every structure they actually use, including the ones they
   forgot to mention.
3. **"What happens when a customer refunds something you've already paid out on?"**
   Almost everyone's answer is "we eat it" or "we haven't thought about it". That
   answer tells you whether the refund handling is a selling point or a shrug.
4. **"How long does it take you each month, and what goes wrong?"**
5. **"Do the people you pay ever ask how a number was calculated? What do you send
   them?"** This tests whether the contributor portal — the thing we think is the
   differentiator — is actually one.

### Specifically test the two things we know are missing

- **Advances and recoupment** is now built, but built to a shape *we* drew rather than
  a real contract. If you speak to a label or a press, ask to see an actual advance
  clause: how much is recouped from each payment, what happens if the person never
  earns it back, and whether more than one advance is ever open at once. That last one
  we had to make a judgement call on with no data.
- **Multi-currency.** We are USD-only by decision. The first non-US business you talk
  to tells you how soon that bites.

### Expect

**Weeks of human response time**, and a low reply rate. Ten conversations is a good
outcome, not a small one. This is the item where starting early matters most, because
the clock is other people's inboxes.

---

## 5. 369 selling again

### What it is

The existing art business making real sales again — which is the only source of real
orders, real refunds and, eventually, real chargeback data.

### Why it is on this list

Refund and chargeback handling is built and tested, but it has never met a real
dispute. That data cannot be manufactured and cannot be hurried: **30 to 120 days after
real sales start.** It is the longest clock in the whole plan, and it does not start
ticking until something sells.

### An important scoping note

369 selling again does **not** mean migrating 369 onto the new engine. Those are
separate, and the separation is deliberate — the marketplace and the engine share no
tables, so 369 can keep selling on the old system while the new product is judged on
its own. The decision to keep them apart until you have evaluated the generic product
cleanly still stands.

So: 369 sells on what it has today. When you are satisfied the new product is right,
369 moves across as its first customer. The order matters and it is not the obvious one.

### Expect

Yours to control, which makes it the only item here with no queue in front of it.

---

## What none of this changes

You are not on a timeline, and none of the above should be reordered to reach revenue
sooner. Order them by what makes the product correct and operable.

If you want a suggested order anyway, it is: **item 3 tonight** (an afternoon, no
waiting, most likely to change a decision), **items 1 and 2 started in the same
sitting** (both are queues, so start them and stop thinking about them), then **item 4
continuously**, and **item 5 whenever you are ready**.

---

## Questions this document cannot answer

Three, all needing you or somebody outside:

1. **Whether Stripe permits creating contributor accounts under the customer's own
   Stripe.** Item 2. Everything about the payout architecture assumes yes.
2. ~~Whether the listing needs the GDPR webhooks before or after first
   submission.~~ **Moot — they are built.** You will need to paste three URLs
   into the Partner dashboard when you create the app:
   `/api/engine/webhooks/shopify/customers/data_request`,
   `/api/engine/webhooks/shopify/customers/redact`, and
   `/api/engine/webhooks/shopify/shop/redact`.
3. **Whether an accountant agrees with how the year-end payment report decides which
   year a payment falls in.** Not strictly Track A, but it is the other thing in the
   product resting on a judgement nobody qualified has checked.
