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

**Check "Needs attention" in your console.** Two kinds of thing land there, and
they need different answers.

**A sale nobody could be matched to.** The system didn't recognise who it belonged
to, so it paid nobody. Click **Resolve**, choose the person, and press **Assign and
pay**.

Two things happen that are worth knowing:

- It pays **the rate that applied on the day of the sale**, not today's rate. A
  three-month-old sale resolved now pays what it would have paid then. How long it
  sat waiting never changes what somebody earns.
- It **remembers the reference**, so the next sale from that source matches on its
  own and you only fix it once.

**A refund that couldn't be recovered.** Money had already been paid out when the
chargeback landed. There is nothing to fix — the money is gone. You can **Dismiss**
it with a note, which clears the flag and leaves the loss on the record to recoup
from their future earnings. The note is required, because a dismissal with no
reason is indistinguishable later from a mistake.

If you'd rather absorb it entirely, that's a **write-off**: their balance returns
to zero and the original loss stays visible in the history. Nothing is ever deleted.

### Every month (or whatever cycle you choose)

- **Run a payout batch.** The machine picks who's eligible, respects the waiting
  period and your minimum, and pays them.
- **Check for failed payments.** Usually a bank detail problem on the artist's end.
- **Glance at the Tax tab.** Not for the totals — for the "missing paperwork"
  number. Chasing one person in March is a conversation; chasing nine in January
  is a scramble. See section 4a.

### Once a year, in January

Open the **Tax tab**, pick last year, and send the spreadsheet to your accountant.
Section 4a explains what it is and — just as importantly — what it isn't.

### When adding a new artist

1. Add them as a contributor
2. Set which rate rule applies to them (or let the default apply)
3. They connect their own bank details through Stripe — **you never see or store
   their bank information**

### Adding someone

In your console, **People → Add someone**. The field that matters most is the
**reference** — that's how an incoming sale is matched to them, usually the code in
your product SKUs. If it doesn't match, their sales land in "Needs attention"
instead of being paid, because the system will not guess.

Setting a password is optional and separate from paying them. It only controls
whether they can sign in and see their own earnings.

They connect their own bank details through Stripe. **You never see or store their
bank information.**

### How an artist connects their bank

They do this themselves, from their own portal — you are not involved, and there is
nothing for you to type in.

1. They sign in at your portal address and see a **Set up payments** button.
2. That takes them to Stripe, where they enter their name, address, tax details and
   bank account. **This happens on Stripe's site, not yours.** You never see it, and
   it is never stored in your database.
3. They come back and the card shows where they stand.

There are three things it can say, and the difference matters:

- **Not set up** — they haven't started. Nothing will be paid to them.
- **In progress** — Stripe still wants something, and the card says what. Usually an
  ID document or a missing tax number. **They cannot be paid yet**, even though from
  their side it may feel finished.
- **Ready** — Stripe has cleared them. Payouts will include them.

**Why "in progress" exists rather than just done-or-not.** Finishing the form and
being cleared to receive money are two different events. Stripe's checks can take
days, can ask for more, and can be reversed later if something changes. So the system
asks Stripe rather than assuming. The alternative — treating a finished form as
"ready" — means a payout run fails partway through, which is much worse than a
payment that hasn't started.

The same applies in reverse: if Stripe later suspends someone, that shows up without
them needing to sign in. You are never paying against a stale answer.

**What you do about it:** essentially nothing. If someone is stuck, tell them to sign
in and read the card — it names what Stripe is waiting for. You cannot fix it for
them, and that is deliberate.

### Adding a work

**Works → Add work.** A "work" is whatever a sale gets attributed to — a print, a
track, a book, a design. Same field that matters most: the **reference**, which is
how an incoming sale finds it.

Then say who earns from it. Somebody with no work attached to them earns nothing;
a work with nobody on it sends every sale of it to "Needs attention". The screen
flags both cases in amber so you can see them at a glance.

**You can archive a work but not delete one.** Deleting would break the link behind
payments already made — the history would still show the payment but could no longer
say what it was for. Archiving hides it from the list and keeps everything
explicable.

### Changing your settings

**Settings.** Three things live here:

- **How long to wait before money can be paid out.** Covers the window where a
  customer can still refund.
- **The minimum someone must have earned** before a payment is worth sending.
  Anyone under it rolls over to the next run — nothing is lost.
- **What happens when a customer refunds after you've already paid.**

⚠️ **The hold period is not retroactive, and this surprises people.** Money that has
already been earned keeps the release date it was given. If you shorten the wait from
30 days to 7, money already sitting in the window does *not* become available — only
new sales get the shorter wait. The same in reverse: lengthening it cannot pull back
money already released.

That is deliberate. An artist has already been shown a date; moving it under them is
exactly the kind of thing that makes people stop trusting a payment system. The
screen warns you as you change it.

The minimum payout and the refund policy *do* apply on the very next payout run.

### When a sale is held because a fee is missing

Some payment methods — PayPal especially — never tell the system what their
transaction fee was. Rather than guess, the system stops the sale and asks.

On **Needs attention**, open the item and use **Record a cost**. Take the number from
your payment provider's statement, type it in, then assign the sale as normal.

**Record the cost before assigning, not after.** The fee is deducted before anyone's
share is worked out, so recording it afterwards is too late — once someone has been
paid, the numbers behind that payment are frozen and the system will refuse to change
them. You can correct a cost as many times as you like before that point.

If you skip this and just assign the sale, nothing breaks — but *your business*
absorbs the fee rather than it coming off the top. That is a legitimate choice, just
make it deliberately.

### Changing someone's rate

In your console, **Rates → Change**. It saves as a new version.

**Old sales keep their old rate.** If you raise someone from 30% to 40% today,
last month's sales are still calculated at 30%, and nobody gets re-paid. This is
not a limitation — it's the point. Rewriting history silently is how payout systems
lose people's trust.

If you genuinely want to top someone up for past work, that's a separate manual
adjustment, not a rate change.

### Importing sales from a spreadsheet

**Import** in your console. This is for sales that don't arrive automatically —
a royalty statement from a distributor, a marketplace report, anything that comes
to you as a file rather than through a connected store.

It works in three steps, and the middle one is the important one:

1. **Choose the file.** It reads the column names and shows you the first few rows.
2. **Say what each column is.** It guesses the obvious ones; check them. Only the
   amount, the date, and either a work or a person are required.
3. **Check what it would do.** You get counts, a total, and a row-by-row list
   *before* anything is recorded. Then you import.

**Six things worth knowing before you use it:**

- **Nothing is recorded until you press Import.** Checking is free, and you can
  check as many times as you like while you get the columns right. If you change a
  column after checking, the check disappears — you'd otherwise be approving one
  set of numbers and importing another.

- **It asks how your dates are written, and you must get this right.** `01/02/2026`
  is 1 February in Britain and 2 January in America, and nothing in the file says
  which. Getting it wrong puts sales in the wrong month, and at year end, the wrong
  tax year. The system refuses to guess.

- **Importing the same file twice does nothing the second time.** That's the whole
  point of the statement name. Use the same name and every row is recognised and
  skipped. **Use a different name for the same file and it will be counted twice** —
  so if you're re-importing something, keep the name.

- **It watches for that mistake anyway.** If rows look like sales you already have —
  same work, same day, same amount — it says so before you import. That's your
  safety net if the name got changed. It doesn't block you, because businesses
  genuinely do sell the same thing twice in a day.

- **Rows it can't read are left out and listed, not guessed at.** A blank amount, an
  unreadable date, a negative line. Fix them in the spreadsheet and import again
  under the same name — everything that already went in gets skipped.

- **Sales for a work or person you haven't set up still get recorded.** They wait in
  **Needs attention** until you say who they belong to, and are then paid at the
  rate that applied on the day of the sale, not today's. Nothing is lost.

**On refunds:** the importer won't take negative rows. A return has to be recorded
against the sale it undoes, so the clawback follows that sale's own rate and your
refund policy. A negative line in a spreadsheet has no way of pointing at the
original. Remove those rows and refund the original sale instead.

---

## 4a. The Tax tab — what you paid people last year

Once a year your accountant needs to know what you paid each person. That is what
this tab is for.

**It shows what you PAID, not what people EARNED, and those are different
numbers.** Every other screen in your console shows earnings. Tax reporting works
on money that actually changed hands. So a sale earned on 20 December and paid on
5 January counts in the *new* year, not the old one. If the figure here doesn't
match what you expected, this is almost always why.

**Pick a year, press Download CSV, send it to your accountant.** That's the whole
job. The file opens in Excel or Google Sheets.

### What it does NOT do

**It does not file anything, and it never will.** The people you pay are paid out
of *your* Stripe account, so Stripe issues the tax forms, under your account. This
tab gives you your own record of what you paid — the number your accountant files
from, and the number you check Stripe's own figures against. If the two ever
disagree, you now have something to disagree *with*, which is the point.

**It doesn't hold anybody's social security number.** Stripe collects those when
someone connects their bank, and Stripe keeps them. This system deliberately has
nowhere to put one. Storing them would make your database far more dangerous to
lose, and would gain you nothing, because the people who actually file the forms
already have them.

### The number to actually look at

Not the total. **"Missing paperwork."**

That's how many people you paid whose tax details aren't on file. You cannot file
for them as things stand. The fix is asking them to finish connecting their bank
in their portal, which is where Stripe collects the details — so it's a message to
send, not something you can fix from your side.

Check it occasionally through the year rather than in January. Chasing one person
in March is a conversation. Chasing nine in January is a scramble.

### Three things that surprise people

**Everyone is listed, including people under $600.** The federal threshold is
$600, and people below it are marked "Under $600" rather than hidden. Several
states have lower thresholds, the federal number has moved before, and which rows
matter is your accountant's call, not the software's. It's easier to ignore a row
than to discover a missing one in April.

**A refund clawed back this year does not shrink last year's figure.** If you paid
someone in November and a customer refunded in February, last year's number stays
as it was — they genuinely received that money. The clawback reduces *this* year.
Changing a year you've already filed against is a corrected form, which is a paper
process and your accountant's decision, not something the software should do
quietly behind you.

**The year is counted in UTC.** A payout run late in the evening on 31 December
US time falls into the next tax year. The exact window is printed at the bottom of
the screen so the number can always be explained. If you want to avoid thinking
about it at all, don't run a payout batch on New Year's Eve.

### People outside the US

Somebody who has filed a W-8BEN shows as **"Not a US person"**. They're not a 1099
at all — that's a different form — but they're still listed, with what you paid
them, because your accountant needs to know. Ask them what to do with those.

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

**7. Nothing that identifies a signed-in person gets written to the logs.**
When someone signs in, the system hands their browser a pass. Anyone holding a
copy of that pass *is* that person — no password needed. The system used to write
those passes into its own activity log on every single page load, which meant
anyone who could read the log could walk in as any artist, or as you. That was
found and removed on 1 Aug 2026, along with a built-in administrator password
that was written into the source code and printed at every startup. Both are
closed. The rule going forward: the log records *that* something happened, never
the keys involved.

One practical consequence: when this is deployed for real, the first
administrator password has to be supplied as a setting at deploy time. The system
will refuse to create an administrator account without one rather than fall back
to a default that everybody knows.

---

## 6. What is NOT done yet

Be honest with yourself about this list.

| Not done | What it means |
|---|---|
| **No real money has ever moved** | Everything is proven with test data. The maths is right; the live payment connection is untested. |
| **Printing costs are placeholders** | The cost numbers are educated guesses, not real Printify prices. **Must be fixed before any real payout.** Needs your Printify account — about 10 minutes on your own computer. |
| **Shopify: built, not switched on** | The whole path is written and tested — a sale arrives, gets split, lands in your books. It is running against practice data because a live store needs a Partner account. When that comes through it is a settings change, not a build. |
| **Stripe: built, not switched on** | Same story. The system can send a payment, refuses honestly when it can't, and never double-pays. It needs your Connect approval before it points at a real bank. |
| **Bank connection: built, not switched on** | An artist can connect their bank from their own portal, and the system checks with Stripe whether they're actually cleared to be paid. Like everything else on this list, it needs your Connect approval before it points at real banks. |
| **Tax paperwork is yours to file** | The Tax tab gives you the figures and the spreadsheet. It does not send anything to the IRS, and it doesn't hold anybody's social security number — Stripe does. See section 4a. |
| **Advances not supported** | Paying someone up front and earning it back isn't built. Needed for music and book publishing. Don't sell to those industries yet. |

---

## 6a. Seeing it for yourself

Two screens, both live:

- **`/manage/369`** — your console. Sales, who's owed what, what needs attention,
  the rates, and paying people.
- **`/portal/369`** — what an artist sees. Their earnings, the full breakdown of
  every payment, and their payout history.

To load them with realistic sample data, run `npm run seed:demo`. That creates a
business partway through a month: money already paid last cycle, money ready to pay
now, money still inside the refund window, one refund that landed after payout, one
sale nobody could be paid for, and one artist who hasn't connected a bank account.
Every one of those is a state you'll meet in real life.

The sign-ins are printed when the command finishes.

**Note:** pressing "Pay everyone listed" in the demo will fail on purpose, saying
*"No transfer provider configured."* That's the system refusing to pretend it sent
money when no payment provider is connected yet. Nobody's balance is touched.

---

## 6b. What the first real cost capture proved (2026-07-31)

**Context first, so nobody misreads this as an emergency.** The storefront has been
dormant for about a year and never went into production. The product and supplier
below are stale data. The value here is that it **proved the maths works against
real numbers** — not that there is a fire to put out.

With that said, the one product still in the account —
*Divine Blessing of Sophia's Light*, 12″×16″ canvas — would **lose money on every
US sale** at these figures:

| | |
|---|---|
| Sells for | $59.99 |
| Printing | −$36.60 |
| Shipping to a US customer | −$32.39 |
| Card fee | −$2.04 |
| **Result** | **−$11.04 per sale** |

### Why

Print provider **69** appears to print in Europe. Shipping to Greece or Moldova
costs $13.49; to the US it costs $32.39. If your customers are mostly American,
you are paying trans-Atlantic freight on every order. The $36.60 print cost is
also roughly 50% above typical for that size.

### If and when the storefront is revisited

Customers would be **mostly US**, so a European provider is the wrong fit. Options,
best first:

1. **Pick a US print provider.** Production around $25 and US shipping around $8
   would turn a $11 loss into roughly $23 profit at the same $59.99 price. Printify
   has many suppliers; they are worth comparing properly at that point.
2. **Raise the price** — with the current provider this canvas needs **$93–108** to
   pay an artist 30% and keep about $15.
3. **Charge shipping separately** rather than absorbing it.
4. **Drop the product.**

None of this is urgent. Supplier choice is an open question for whenever that
business is picked back up.

### What the system did about it

Exactly what it should. It records the real loss, and the artist's share **floors
at zero** rather than paying them a percentage of money you never made. Nobody is
overpaid and the loss stays visible.

**The real lesson.** This is why the system refuses to pay from unverified costs.
The invented numbers it shipped with said this canvas cost $12.00 to print and
$7.50 to ship. Reality was $36.60 and $32.39 — off by 3x and 4x. A system that
paid artists a percentage of a guessed cost would have drained the business
quietly, on every order, with nobody noticing until the bank balance did.

That is the whole argument for the engine in one example.

---

## 6c. Card fees — where the choice actually lives

When someone buys something, the card company takes a cut before the money reaches
you. Roughly 2.9% plus 30¢, though it varies. On a $118 order that is about $4.

**Whether an artist shares that cost is part of their deal, not a store setting.**

This is worth being clear about, because it is easy to think of it as one global
switch and it isn't. Each artist's rate already lists which costs come off before
their share is worked out — printing, shipping, card fees — and you can set that
differently for different people, and change it from a date forward without
touching what you already paid them.

So:

- **Want artists to share the card fee?** Leave "card fees" in the list of costs
  their rate deducts.
- **Want to absorb it yourself?** Take it out of that list. Their share is then
  worked out on the full sale price.

Either way **the fee is still recorded**, so your own margin reporting stays
honest. That is the part a global "absorb" switch would have quietly broken — it
would have stopped recording the fee at all, and your books would have shown you
keeping about $4 more per order than you really did.

### The one thing that IS a store setting

Shopify doesn't tell us the fee in the sale notification. It has to be looked up
separately, and for **PayPal and most non-Shopify payment methods it isn't
available at all**.

When we can't find it, there is no right answer, so you choose:

- **Hold the sale** (the default). It's recorded, nobody is paid from it yet, and
  it shows up in "Needs attention". Safe, occasionally annoying.
- **Carry on without it.** The sale pays out with no fee deducted — you absorb it
  for that order. Quiet, but two identical sales can pay slightly differently
  depending on how the customer happened to pay.

**What the system will never do is guess a fee.** Same principle as the printing
costs above: a held payment can be fixed, a wrong payment that has already left
cannot.

If most of your sales go through Shopify Payments, holds will be rare either way.

---

## 6d. Emails the system sends

Nobody has to check a screen to find out they have been paid.

**To your artists**

- **"You have been paid."** Sent when a payment actually goes out — never when
  one fails. It names your business (so it does not look like spam from a
  stranger), says the amount, and links to their full breakdown.

**To you**

- **Your trial is ending**, a few days before.
- **A subscription payment failed** — which does *not* switch anything off.
- **Sales are waiting for you**, as one daily summary rather than one email per
  stuck sale.
- **Somebody signed up**, if you have set an address for it.

**Three things worth knowing:**

1. **An email problem can never stop a payment.** Emails go out after the money
   has moved. If the mail service is down, everyone still gets paid.
2. **Nobody is ever told twice.** Being told twice that you have been paid reads
   like being paid twice — so the system records every message it sends and will
   not repeat one, however many times a payout run is retried.
3. **The numbers in an email match the screen exactly.** Same formatting, same
   dates, down to the comma.

**Two of these are on a timer.** "Your trial is ending" and "sales are waiting for
you" are true because time passed, not because anybody clicked anything, so the
system checks for them by itself through the day. Two details:

- **The trial warning arrives in the last three days**, not on day one. You get
  one warning per trial, so sending it early would spend it telling you about
  something two weeks away.
- **The stuck-sales note is one summary a day at most**, however many sales are
  waiting. Fifty separate emails after a bad import would be filtered, and these
  are exactly the ones somebody has to see.

**Not switched on yet.** Sending needs an email account connected (Resend), the
same way payouts need Stripe. Until then, the timed checks do not run at all —
deliberately. If they ran with no way to send, they would tick every reminder off
as "done" without anything arriving, and connecting Resend later would not bring
those messages back. The emails that follow an action, like a payout, still record
that they would have sent something.

---

## 6e. When somebody forgets their password

There is a **"Forgotten your password?"** link on both sign-in screens — yours and
your artists'. They enter their email, get a link, and set a new password
themselves. **You never have to reset anything for anyone.**

Three things worth knowing, because they will generate questions:

- **The link lasts an hour and works once.** Someone who clicks it twice, or comes
  back the next morning, needs a fresh one. That is deliberate — a reset link is as
  good as a password, and one sitting in an inbox for a week is a way in.
- **The screen always says "if that address has an account, a link is on its way"**,
  even when it isn't. It never confirms whether an email is registered. That stops a
  stranger from using the form to work out who you pay.
- **If someone gets a reset email they didn't ask for, nothing has happened.** The
  email says so. A link that has not been clicked has changed nothing.

Needs the email connection switched on to actually deliver, same as everything else.

---

## 6f. The Changes tab

Every change anybody makes is written down, and the **Changes** tab shows it:
who did it, what they did, and when. Turning off a rate, editing your settings,
assigning a held sale, dismissing one, writing off a balance, downloading the
year-end report, resetting a password.

**Nothing on it can be edited or deleted**, including by you. That is the point —
a record you can change is not a record.

Two things to know:

- **Times are shown in UTC**, and say so. That matches your artists' statements
  and every email the system sends, so the three never disagree.
- **"Unknown" means the change was made without a signed-in person attached** —
  usually something set up before the system knew who was doing it. It does not
  mean something suspicious happened.

Use it when somebody disagrees about a number. "Your rate changed on the 14th,
here's who changed it" ends a conversation that would otherwise go in circles.

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
