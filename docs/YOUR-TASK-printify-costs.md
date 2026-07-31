# Your task: capture the real Printify costs

**Time:** about 10 minutes.
**Where:** your own computer, where your Printify login lives.
**Why it matters:** this is the one thing standing between "the maths is proven"
and "we can pay a real person correctly."

---

## The problem in one paragraph

The system currently has *made-up* printing and shipping costs in it. They look
plausible — around $4 for a small poster, $45 for a large metal print — but nobody
verified them against your actual Printify account, and the internal product IDs
are placeholders rather than real ones. The royalty maths is proven correct; the
prices it multiplies are guesses. Paying an artist from a guessed cost is exactly
the bug we spent Phase 0 removing, so the system currently **refuses to pay anyone**
unless you explicitly tell it to trust the fake numbers.

I can't fix this from here. This sandbox is locked down and can't reach Printify's
servers, and your API key must never be pasted into a chat — a key in a transcript
is a leaked key, permanently.

---

## What to do

### 1. Get the project on your computer

**You need Node.js first.** If you don't have it, get the LTS version from
[nodejs.org](https://nodejs.org). You'll know it's missing if `npm` says
"command not found" later.

**IMPORTANT: the work is on a branch, not `main`.** Opening `main` shows the old
code and none of this will be there.

#### In VS Code

1. `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`) → **Git: Clone**
2. Paste `https://github.com/damozman/369ACP26.git`
3. Choose a folder, then **Open** when prompted
4. Look at the **bottom-left corner** — it shows the branch, probably `main`.
   Click it and choose **`claude/business-idea-feedback-7uwumw`**
5. Open a terminal (**Terminal → New Terminal**) and run `npm install`

#### Or from a terminal

```bash
git clone https://github.com/damozman/369ACP26.git
cd 369ACP26
git checkout claude/business-idea-feedback-7uwumw
npm install
```

### 2. Put your Printify key in the settings file

In VS Code, right-click in the file list → **New File** → name it exactly
**`.env.local`** (the leading dot matters). Add this line:

```
PRINTIFY_API_TOKEN=your_actual_token_here
```

Get the token from Printify: **My Profile → Connections → API tokens → Generate**.

That file is already set to never be uploaded anywhere. **Do not send it to me.**

### 3. Run one command

```bash
npm run printify:costs > printify-costs.txt
```

It reads every product in your Printify shop and writes out what each one really
costs to print and ship.

### 4. Send me `printify-costs.txt`

That file contains **product names, sizes, internal IDs, and prices**. No password,
no key, nothing secret. Safe to paste into our chat or attach.

---

## What I'll do with it

Replace the invented numbers with your real ones, re-run the tests to confirm the
maths still holds, and remove the safety catch that currently stops payouts.

After that, the system can calculate a genuinely correct payment. It still won't
*send* one until Stripe is connected — that's separate.

---

## If something goes wrong

**"PRINTIFY_API_TOKEN is not set"**
The `.env.local` file isn't being found. Check it's in the main project folder
(next to `package.json`), and that the line has no spaces around the `=`.

**"No products found"**
Your Printify shop has no products yet. The costs live on actual products rather
than on the general catalogue, so there needs to be at least one. Even one is
enough to start.

**"No Printify shops found"**
The token is valid but isn't connected to a shop. Check you generated it from the
right Printify account.

**Anything else**
Send me the error message. It won't contain your key.

---

## One thing worth knowing

If your Printify prices change later — and they do — these numbers go stale. Costs
are recorded permanently on each sale at the moment it happens, so **old payments
are never affected**. But future ones would use out-of-date figures.

Re-run the same command whenever you think prices have moved, and send me the new
file. Takes a minute.
