# CLAUDE.md

Standing context for this repository. Read before acting.

Written 2026-09-13, immediately after `main` was restored to the complete
marketplace. If you are a new session, everything you need is in this file —
there is no prior conversation to recover, and you should not try.

## What this repository is

**369 Art Collective** — a print-on-demand art marketplace, complete and
working. Artists apply, an admin approves them, artists upload artwork, an admin
approves it, products are created in Shopify via Printify, orders come back by
webhook, tiered royalties are calculated, and artists are paid through Stripe
Connect.

Built roughly November 2025 – May 2026. **38 database tables, 142 API endpoints,
43 screens.** Currently idle — it is not deployed and no money is moving through
it.

## ⚠️ What happened to this repository on 2026-09-13 — read before touching `main`

Between July and September 2026 a second product was built *alongside* this
marketplace in this same repository: a vertical-agnostic revenue-split and payout
engine. During that work ~40% of the marketplace was deleted — the AI art studio,
influencer gamification, CreatorStack, paid featured placement, and
artist-recruits-artist payments.

**That was reversed here, deliberately, at the owner's instruction.** The payout
engine now lives in its own repository, and this one was restored to the complete
marketplace. The owner's words: *"I want it to be complete."*

| Where | What |
|---|---|
| `main` | **The complete marketplace.** All 38 tables, all features. This is the good version. |
| `claude/business-idea-feedback-7uwumw` | The cut-down version plus the entire payout-engine build. Kept for reference — **do not merge it into `main`.** |
| `archive/pre-repositioning` | A 31 July snapshot: complete marketplace plus the planning docs. |
| `replit-agent` | Old Replit work from May. Harmless history. |

**Two other repositories exist and are NOT part of this one:**

- **`damozman/payout-engine`** — the revenue-split product, fully separate. No
  shared code, no submodules, no imports in either direction. Do not port it back
  here, and do not build against it.
- **`damozman/369-Art-Collective-Backup-Archive`** — an archived, untouched copy
  from 31 March 2026. It is a backup. Leave it alone.

**⚠️ DO NOT "restore" the cut features from the other branch, and do not re-apply
the deletions.** `main` is already the complete version. If something looks
missing, check `main` before concluding anything.

## Security — fixed 2026-09-13. Do not regress

Six places were writing credentials to the server log or carrying them in tracked
source. All are fixed on `main`. The rules they leave behind:

1. **Session identifiers and cookie values are NEVER loggable.** A session cookie
   is a bearer credential: whoever holds it *is* that user until it expires, with
   no password involved. Log presence (`!!req.headers.cookie`), never the value.
2. **Response bodies are never logged by default.** The old code truncated them to
   79 characters, which caps how *much* leaks, not *what* — a Stripe Connect
   onboarding link is single-use and sits in the first 40 characters of its
   response.
3. **No password in tracked source.** `server/bootstrap.ts` requires
   `BOOTSTRAP_ADMIN_PASSWORD` in production and creates nothing without it. The
   development convenience account is unchanged and is now genuinely gated to
   non-production.
4. **Prefer `secureLog` (`server/lib/secure-logger.ts`) over `console.log`
   anywhere near auth.** It already redacts `sessionID`, `cookie` and `token` by
   name — and every one of the six leaks was a raw `console.log` routed straight
   around it. A safe utility does not help if the unsafe one is easier to reach.

**Not covered by that sweep**, stated honestly: secrets reaching third-party log
sinks, the client bundle, and the ~70 obsolete `server/scripts/**` one-offs, which
are not on any request path.

## ⚠️ Known defects — real, verified on this branch, do NOT be surprised by them

These are genuine and still present. They were fixed on the other branch as part
of the payout-engine work, and those fixes did **not** come back with the
restore — that was the accepted cost of having the features whole.

1. **Royalty is computed two different ways, and they disagree.**
   - `server/lib/order-processor.ts` — `profit = productPrice - printifyCost -
     shippingCost`, then `calculateRoyalty(profit, ...)`. A percentage of **net
     profit**.
   - `shared/financial-utils.ts` — `artistRoyalty = retailPrice * (pct/100)`. A
     percentage of **retail**.

   So "45% royalty" means two different dollar amounts depending which file you
   read, and the admin financial dashboard can disagree with what was actually
   paid. **Neither path subtracts Stripe processing fees**, so true platform
   margin is thinner than reported. Any real work here should pick one definition
   and apply it in one place.

2. **⚠️ The Printify cost is a hardcoded placeholder.** `order-processor.ts` has
   `const printifyCost = 15.00 * lineItem.quantity;` with a comment admitting it
   should come from the API. Every royalty calculated through this path is based
   on an invented cost. **This blocks real payouts** and is the first thing to fix
   if this marketplace is ever restarted commercially.

3. **`artists.monthlySales` is a stored balance** used to drive tier calculation.
   Stored balances drift from the transactions they summarise. Deriving it by
   summing sales is the correct shape.

4. **There is no refund, chargeback, or clawback handling at all.** A refund after
   an artist has been paid has no path through this system. (This is the single
   hardest problem in the space, and solving it properly is most of why the payout
   engine exists.)

## Where the code lives

Only ~240 of 1,129 tracked files are source. **Most of the repository is
`attached_assets/`, and ~650 files are images.** Searching blind is slow and
returns stale results.

| Path | What |
|---|---|
| `shared/schema.ts` | 38 Drizzle tables — the data model, start here |
| `server/routes.ts` | 142 endpoints (~6,100 lines; read by range, not whole) |
| `server/storage.ts` | data access layer (large) |
| `server/lib/` | services — payouts, Stripe, Printify, Shopify, royalties |
| `client/src/pages/` | 43 screens |
| `config/` | pricing JSON |

**Do not search these** unless the task is explicitly about them:

- `attached_assets/**` — mostly screenshots and generated images
- `attached_assets/backups/**` — **stale duplicates.** A dozen dated copies of
  `247-art.css` / `247-art.js` / `247-art-product.liquid`. Reading one instead of
  the live theme file is a real and repeated failure mode. Live theme files are in
  `attached_assets/theme/`.
- `server/*.bak`, `server/storage.ts.FINAL_RESCUE.bak` — dead copies
- `server/scripts/**` — ~70 one-off operational scripts, mostly obsolete
- `docs/legacy/**`, `docs/PROJECT_SUMMARY.md` — describe a much earlier version
  and contradict current reality

Prefer `Grep` with a `glob` filter over broad searches, and read large files by
line range.

## Stack and commands

TypeScript throughout. React + Vite + Wouter + TanStack Query + shadcn/Tailwind on
the client; Express on the server; Drizzle ORM against Postgres; Stripe + Stripe
Connect; Shopify Admin API; Printify.

```bash
npm install
npm run dev       # Express + Vite, reads .env.local
npm run build     # vite build — passes as of 2026-09-13
npx tsc --noEmit  # clean as of 2026-09-13
npm run db:push   # drizzle-kit push
```

**Credentials required** for the payout path: `DATABASE_URL`,
`PRINTIFY_API_TOKEN`, `SHOPIFY_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`.
`BOOTSTRAP_ADMIN_PASSWORD` is required in production to seed the first admin.

### Handling credentials — standing rule

**Never ask the user to paste a secret into chat, and never accept one there.** A
key in a transcript persists indefinitely and is effectively leaked. Secrets
belong in `.env.local` (gitignored) or the host's secret configuration. If a task
appears to need a key in conversation, the task is wrong.

## Traps that have already bitten in this codebase

- **`npm run build` and `tsc` passing is not evidence the app works.** Load the
  pages. This caught ten separate defects across this codebase and the payout
  engine that all passed clean.
- **`server/vite.ts` calls `process.exit(1)`** from the vite logger's error
  handler, and vite forwards *client-side* console errors to it — so a benign
  React warning kills the dev server the moment a page renders. Comment it out
  while working on the UI; **do not commit that**.
- **A commit deleted 19 unrelated routes from `client/src/App.tsx`** as collateral
  while removing two. Nothing caught it: every page component was still imported,
  so `tsc` and `vite build` both passed while every `/artist/*` and `/admin/*` URL
  served the 404 page.

## How to communicate with the user

The user is the business owner, not a developer. They asked directly to stop
being given implementation detail they cannot use.

- **Debrief in plain language.** What changed, what it means for the business,
  what it protects against. No file names or jargon unless they ask.
- **End every response with a clear DECISIONS NEEDED list** — one line per
  decision plus a short description of each path. Never bury a question in a
  paragraph.
- **Ask questions the moment they arise**, not only at the end.
- **Be brief.** Long technical passages waste their time and tell them nothing.
- Technical depth still belongs *in the repo* — comments, docs, commit messages.
  The rigour does not drop; only the chat register changes.

## Working agreements

- **Decisions live in the repo, not in chat.** Sessions do not share memory.
  Anything concluded in conversation must be written here before the session ends,
  or it is lost and the next session will contradict it.
- **Update this file when the status changes.**
- Do not open pull requests unless the user explicitly asks.
- Prefer honest pushback over agreement. The user has asked for it directly.
