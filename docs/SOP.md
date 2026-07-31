# How This System Works — Owner's Guide

Written for the person who owns this business, not the person who writes the code.
No technical background assumed. If you hit a word you don't know, check the
Glossary at the end.

Last updated: 2026-07-31.

---

## 1. What you actually own

You own a **machine that splits money and pays people.**

A sale happens somewhere. The machine works out who is owed what, writes it down
permanently, waits a safe period, and sends the money. It can explain every single
number it produced, forever.

That's it. That's the product.

**Why that's worth money:** thousands of businesses do this in spreadsheets today.
Record labels splitting royalties between an artist and a producer. Publishers
splitting between an author and an illustrator. Print shops splitting with
designers. Agencies splitting with contractors. They all do the same maths by hand,
every month, and they all get it wrong sometimes.

**369 Art Collective is your first customer, not your business.** It exists to prove
the machine works with real money and real refunds. The machine is what you sell.

---

## 2. How money flows — a real example

Follow one real sale all the way through. These are the actual numbers the system
produced during testing.

### Step 1 — A sale happens

A customer buys a canvas print for **$99.00**.

### Step 2 — The machine works out the true cost

It asks the printer what this specific item actually costs, and records:

| What | Amount |
|---|---|
| Customer paid | $99.00 |
| Printing | −$15.00 |
| Shipping | −$8.00 |
| Card processing fee | −$3.12 |
| **Real profit** | **$72.88** |

**This is the part your old system got wrong.** It guessed $15 printing on
*everything* — whether the item really cost $4 or $45. Cheap items underpaid the
artist by about 3x; expensive items overpaid.

### Step 3 — It applies your rules

You've set a rule: *this artist earns 30% of profit.*

> 30% of $72.88 = **$21.86**

If two people are owed — say an artist and a producer — it splits between them and
warns you if the percentages add up to more than 100%.

### Step 4 — It writes it down permanently

The $21.86 goes into a permanent record, along with the *reason*:

> Sale $99.00, less printing $15.00, less shipping $8.00, less fees $3.12 = profit
> $72.88. 30% of profit = $21.86. (Rule: artist-standard, version 1)

**That sentence is the product.** Two years from now, if the artist asks "why was I
paid $21.86?", the answer is right there — including which version of your rate rules
applied at the time.

### Step 5 — It waits

The money is **earned** but **not yet payable**. By default it waits **14 days** —
your refund window. If the customer refunds on day 10, nothing has left yet and
there's nothing to chase.

### Step 6 — It pays

After the wait, the artist is included in the next payout run. The machine:

- skips anyone who hasn't connected a bank account
- skips anyone under your minimum (default $10) and rolls them into next time
- sends the money
- records the payment against their balance

Their balance goes back to zero. Done.

---

## 3. What happens when things go wrong

This is the part most payout systems get wrong, and it's where your money is at risk.

### A customer refunds after you've already paid the artist

Say a chargeback arrives 40 days later. That $21.86 is gone — the artist has spent
it. Nobody can magic it back.

The machine records the truth: the artist's balance goes to **−$21.86**. Their next
earnings pay it back automatically. It also flags it for you, because a real loss
just happened and you should know.

**You choose how this is handled**, per business:

| Setting | What it does | Who normally uses it |
|---|---|---|
| **Recoup** (default) | Artist's balance goes negative; future earnings repay it | Most businesses |
| **Absorb** | You eat the loss; the artist is untouched | Where you want zero friction |
| **Reserve** | You hold back a small % of every payout as a buffer | High-refund businesses |

### Something doesn't add up

If the machine can't work out a real cost, or can't tell who a sale belongs to, it
does **not** guess. It records the sale, marks it **"needs review"**, and pays
nobody for it.

This is deliberate. **A payment that's held can be fixed. A wrong payment that's
already gone cannot.** You'll see these in the admin view and can resolve them.

### A payment fails

Bank accounts get frozen, details go stale. When a transfer fails, the machine
records it as failed and **leaves the money in the artist's balance**. Nothing is
lost. You retry it, or it rolls into the next run.

It also cannot accidentally pay someone twice — every payment carries a unique
stamp, so if a payment succeeded but the confirmation got lost, retrying is safe.

---

## 4. Your regular jobs

### Every week or two

- **Check the "needs review" list.** These are sales nobody has been paid for. Usually
  an unrecognised product or a missing cost. Fix the underlying data and they clear.

### Every month (or whatever cycle you choose)

- **Run a payout batch.** The machine picks who's eligible, respects the waiting
  period and your minimum, and pays them.
- **Check for failed payments.** Usually a bank detail problem on the artist's end.

### When adding a new artist

1. Add them as a contributor
2. Set which rate rule applies to them (or let the default apply)
3. They connect their own bank details through Stripe — **you never see or store
   their bank information**

### When changing someone's rate

Change it and set the date it starts from. **Old sales keep their old rate.** If you
raise someone from 30% to 40% on 1 March, February's sales are still calculated at
30%. This is not a limitation — it's the point. Rewriting history silently is how
payout systems lose people's trust.

---

## 5. The safety rules built in, and why

These are deliberate design choices. If someone proposes changing one, that's a
serious decision, not a tweak.

**1. You never hold anyone's money.**
Money goes from the business's own account straight to the artist. It never sits
with you. This is the single most important choice in the whole system — holding
other people's money makes you a *money transmitter*, which means licences in every
state, bonding, and audits. This choice is the difference between launching this
year and needing a compliance department.

**2. Nothing is ever deleted or edited.**
Corrections get added on top, like a proper accounting ledger. You can always see
what happened and in what order.

**3. Balances are always calculated, never stored.**
The machine adds up the record every time you ask. It never keeps a "current
balance" number that could drift out of sync with reality. Your old system stored
one, and that's a bug waiting to happen.

**4. Every payment records its own explanation.**
Not regenerated later from current rules — captured at the moment it was decided.
This is what makes a two-year-old dispute answerable.

**5. When in doubt, pay nobody.**
Every uncertainty results in a hold, never a guess.

**6. Money is never stored as a decimal.**
Everything is whole cents internally. Decimals lose fractions of a penny in ways
that quietly compound across thousands of transactions.

---

## 6. What is NOT done yet

Be honest with yourself about this list.

| Not done | What it means |
|---|---|
| **No real money has ever moved** | Everything is proven with test data. The maths is right; the live payment connection is untested. |
| **Printing costs are placeholders** | The cost numbers are educated guesses, not real Printify prices. **Must be fixed before any real payout.** Needs your Printify account — about 10 minutes on your own computer. |
| **Not connected to Shopify live** | Real store sales don't flow in automatically yet. |
| **Not connected to Stripe live** | Real payments can't be sent yet. Needs your Stripe Connect application approved. |
| **No admin screens** | You can't yet see sales, set rates, or trigger payouts yourself — those need a developer today. |
| **Advances not supported** | Paying someone up front and earning it back isn't built. Needed for music and book publishing. Don't sell to those industries yet. |

---

## 7. The things waiting on you

None of these go faster by building faster. They all wait on other people.

1. **Shopify Partner account** — free signup, separate from your store account. Takes
   1–3 weeks to get an app reviewed, and it usually takes a couple of rounds.
2. **Stripe Connect** — your existing Stripe account is the starting point, but
   "Connect" is an extra capability you apply for and get verified. Days to weeks.
3. **Real Printify costs** — 10 minutes, your computer, your login.
4. **Talking to 5–10 other businesses** — the most valuable one. Ask what their
   actual payment deals look like and what their spreadsheet does. That tells us
   whether the machine handles real-world deals or needs adjusting.
5. **369 selling again** — the clock on real refund data only starts when real
   customers buy things. Chargebacks take 30–120 days to appear and can't be rushed.

**A standing rule about passwords and keys:** never paste one into a chat with me.
Ever. A key in a transcript is a leaked key. They belong in a settings file on your
own computer. If a task ever seems to need one in conversation, the task is wrong.

---

## 8. Glossary

**Allocation** — a decision that someone is owed a specific amount from a specific
sale.

**Chargeback** — a customer disputes a charge with their bank, often months later.
Money is taken back whether you agree or not.

**Clawback** — recovering money already paid out, after a refund or chargeback.

**Contributor** — anyone owed money. An artist, a producer, a writer. Generic on
purpose, so the system works beyond art.

**Hold / holding period** — the wait between earning and being payable, so refunds
land before money leaves.

**Ledger** — the permanent record of every amount in and out. Never edited.

**Minor units** — whole cents. $21.86 is stored as 2186.

**Payout batch** — one run that pays everyone eligible at once.

**Reversal** — the entry that undoes an earlier allocation after a refund. It doesn't
delete the original; it sits alongside it.

**Split rule** — your setting for who gets what. Data you change, not code.

**Tenant** — one business using the system. 369 is tenant #1. Each tenant's data is
completely walled off from every other.

**Work** — the thing that earns. An artwork, a track, a book title.

---

## 9. If you remember five things

1. **You own a money-splitting machine.** 369 is its first customer, not the business.
2. **It explains every number it produces, forever.** That's what people pay for.
3. **When unsure, it pays nobody** — held payments are fixable, wrong ones aren't.
4. **You never hold anyone's money**, which keeps you out of financial licensing.
5. **The printing costs are still fake.** Fix that before anyone gets paid for real.
