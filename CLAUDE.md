# Keel CRM v2 — conventions

Read `KEEL_CRM_PLAN.md` for the full build plan. Work phase by phase; do not start a phase until the previous one's acceptance criteria pass.

## Repo structure

```
src/
  lib/        supabase.ts, matching.ts, format.ts (phone/E.164, money, dates),
              settings.ts (team rules + my settings, tier logic types), tiering.ts (tier engine),
              calls.ts, propertyMatch.ts, readNotes.ts (form answers from free text),
              lha.ts (LHA area, size rules and rent-vs-LHA check; rates in src/data/lha-rates.ts),
              whatsapp.ts (wa.me links and message wording for sending properties),
              geo.ts (placing postcodes via postcodes.io, cached per device; a client's areas as districts),
              progress.ts (deals: each property a client is going for; stage follows deals, next steps, stuck),
              requests.ts (providers' rules, request messages to providers, follow-ups; never phone, surname or health),
              money.ts (Finances: receivables per placement (letting fees and incentives), fees worked out from the rent
                        (£, % of a month's rent, weeks of rent; a week is pcm × 12 ÷ 52), due dates from sign up or from the
                        first month's rent, overdue, potential fees from deals, by month, calendar and .ics file;
                        the app says "Finances", files and the activity kind keep the name "money"),
              invoice.ts (invoice wording, numbering, VAT split, WhatsApp and email text; client first name only to providers),
              officers.ts (housing officers gathered from clients' details, joined on email, phone, name; copy formats),
              clipboard.ts (copy with a fallback for older phones),
              help.ts (words behind the "?" help buttons)
  components/ ui primitives on tokens (Button, StageBadge, Card, Field, Toast, Icon,
              Visuals: avatars, page headers, stat tiles, SVG charts, UpdateNote for "run this migration")
  features/   dashboard/ bin/ pipeline/ (with the Housing officers box) calls/ applicants/ properties/ settings/ map/ (Leaflet, lazy-loaded) progress/ requests/ (request sheet, Awaiting providers) money/ (the Finances page at /finances: Owed, Potential, Calendar, Paid; invoice page at /finances/invoice/:id;
              client card, Home summary)
  types/      extraction.ts (shared contract, imported by netlify functions)
netlify/functions/ extract.ts, lib/prompt.ts, lib/claude.ts
supabase/migrations/
```

## Conventions

- TypeScript strict; no `any` in `matching.ts` or the extraction contract.
- Share extraction types via `src/types/extraction.ts`, imported by the Netlify function.
- British English in all UI copy; no em dashes in user-facing text.
- Every DB write that changes state creates an `activities` row.
- Commit per phase with `phase-N:` prefix; work since the phases finished reads `Area: what changed`.
- Styling: Tailwind utilities + CSS custom-property tokens from `src/styles/tokens.css`. No component libraries.
  Palette: creamy greys with one green accent (`--accent`); brick red only for delete and errors.
  Use the semantic tokens (`--note-*` for cautions, `--chip-*` for tags, `--strong/good/possible-*`, `--tier-N-*`), not stage colours.
- Rules that change behaviour (tiers, urgency, premium rent, call follow-ups) live in Settings (`lib/settings.ts`), not constants.
  Tiers are data (`tierLogic`: any number of tiers, conditions on client answers); never assume 3 tiers, use `tierNumbers()`/`tierLabel()`.
  Only the owner (`profiles.role`, migration 0007) can change team settings; RLS enforces it.
  Team settings are shared (key `app`); personal ones (`PERSONAL_KEYS`) are per person (key `user:<id>`).
- Two or more people use Keel: show who did things (`calls.created_by`, `activities.actor`, `usePeople().whoOf`),
  and give new features a `<Help topic=... />` with its words in `lib/help.ts`.
- Buttons say what they do ("Confirm and update Lubna", not "Submit"). Sentence case everywhere.
- Stage moves are monotonic by default; regressions need an explicit user toggle.

## House rules Ridwan has set (keep to these)

- Keel works in London and the home counties only; area lists show those first, the rest of England behind one option.
- Matching: anything over £1,300 pcm is always offered to clients on PIP or in full-time work (`premiumRent`). Clients on
  UC alone (no PIP or LCWRA, not working) are never matched above £1,100 (`ucOnlyRentCap`), whatever budget they gave.
  Studios and en-suite rooms count as 1 bed for LHA. "Central" means the zone 1 districts (`CENTRAL_DISTRICTS`).
- Short lists, not endless ones: each property shows only its best few clients (`bestFew`), one line each. No kanban.
- Nothing scrolls sideways, on a phone especially.
- Properties go to clients, and requests go to providers, as WhatsApp links (wa.me) the person sends by hand; every
  send is logged. Providers are greeted "Salam {name}".
- The page for fees, incentives, potential income and invoices is called "Finances" (Ridwan renamed it from "Receivables",
  which had replaced "Money"); /receivables and /money still land there. Never call it "Money".
- Invoices to providers or landlords name the client by first name only; a council incentive claim carries the full name.
- Two people use Keel: Ridwan (owner) and a co-worker. Ridwan invites people from the Supabase dashboard; Claude never
  creates accounts or enters passwords.
- Contacts was removed on request; do not bring it back unasked. Housing officers live on each client (officer_*); the
  Pipeline's Housing officers box gathers them for copying into emails. The Bin no longer creates or matches contacts.
- Switching a provider off withdraws its available properties (under offer and let stay); switching it back on brings back
  only those (`provider_off` / `provider_on` property activities, `withdrawnBySwitchOff` in requests.ts). Lists pasted
  while it is off come in withdrawn.
- Calls are kept quiet on request: not in the top bar (the /calls page stays, linked from a client's Next step card),
  not on Home, no green "Log call" button. Home shows next steps due instead. Do not make calls prominent again unasked.
- Finances leads with the ghost total: everything owed plus a fee for every client going for a property (sent to accepted),
  each client and property once (`ghostTotal` in money.ts). "Potential" alone is a viewing booked or further.

## Env vars

| Var | Where |
|---|---|
| `VITE_SUPABASE_URL` | client (.env.local + Netlify) |
| `VITE_SUPABASE_ANON_KEY` | client (.env.local + Netlify) |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify function env ONLY |
| `ANTHROPIC_API_KEY` | Netlify function env ONLY |
| `OWNER_EMAIL` | Netlify function env |

Never commit `.env.local`. Never expose the service role key or Anthropic key to the client.

## Commands

- `npm run dev` — local dev server
- `npm run build` — type-check + production build (must pass before any commit)
- `npx tsx scripts/test-<name>.ts` — checks for the pure logic in `src/lib` (one script per area; run them all before a commit)

## Shipping

- The local branch is `master`; GitHub's is `main`. Ship with `git push origin HEAD:main`, which deploys keelcrm.netlify.app by itself.
- Ridwan is not a developer: say what changed in plain words, and give any step he must do himself as numbered clicks.

## Database changes

- One new file per change in `supabase/migrations/` (next number up). Never edit an old one. Make it safe to run twice
  (`if not exists`, `on conflict do nothing`).
- Ridwan runs each file by hand in the Supabase SQL Editor, so the app may be ahead of the database. Every feature must
  keep working before its migration has been run: hooks return a `ready` flag (`missingTable()` / `isMissingColumn()` in
  `lib/hooks.ts`) and the page shows a note naming the file to run.
- Run order matters: 0009 (deals) before 0010 (providers, requests), then 0011 (sharing default), then 0012 (receivables),
  then 0013 (finances: fees from the rent, first-rent dates, invoice numbers).

## Checking the screen without signing in

Sign-in is invite-only and Claude must not enter passwords, so the real app cannot be opened in a preview. Use the harness:
it answers every Supabase request from sample rows in memory.

1. Copy `.harness/harness.html` to the repo root and `.harness/__harness.tsx` to `src/`. (Both are git-ignored. If
   `.harness/` is missing, it has to be rebuilt: an entry file that stubs `window.fetch` for the Supabase URL, stores a
   fake session with `access_token: 'harness'`, then renders `<App />`. No `.env.local` is needed: without one the
   app uses `placeholder.supabase.co`, which the stub answers.) Extra query options: `&missing=receivables` makes a
   table look missing, `&nocols=1` makes the 0013 columns look missing, `&theme=dark`.
2. Start the preview (`keel-v2` in `.claude/launch.json`) and open `http://localhost:5173/harness.html?path=/pipeline`
   (any route after `path=`). A plain reload loads the real app, so always go back through `harness.html`.
3. New table or column? Add sample rows to `db` in the harness copy, and save the improved copy back to `.harness/`.
4. Afterwards: remove the `sb-…-auth-token` entry from the preview's localStorage, stop the preview, and delete the two
   copies. `npm run build` type-checks everything in `src/`, so a left-over harness can fail the build.
5. Never commit the harness: its sample rows may look like real clients.

Check pages at phone width (375px) as well as desktop. Nothing may scroll sideways: below `lg` the page links sit on
their own row under the top bar, and the Pipeline is a row list, not a wide table. `&big=1` loads a busy account (about
255 clients, long names) for layout checks; Google Fonts cannot load here, so measure with local copies of the real fonts.

Phones (index.css): the page clips sideways overflow, never rubber-bands sideways, and every typing box is 16px on touch
screens (an iPhone zooms in on smaller ones and stays zoomed, which is what let the page be dragged out of shape).
Page containers are `p-4 sm:p-6`; a fixed width (`w-[220px]`) needs `max-w-full` and a wrapping parent. Keel opens
full screen from the home screen (manifest `display: standalone`); icons are in `public/` (apple-touch-icon 180, 192,
512 and a maskable 512). In the home-screen app, sign in with a password: an email link opens in Safari instead.

## Pitfalls

- Never put code containing backslashes in a bash heredoc: `\n` turns into a line break and `\b` into a stray control
  byte. Use the Edit and Write tools, or write a script file and run it.
- Dates must read the same everywhere: use `shortDate` / `shortDay` / `longDay` / `weekdayName` / `fullDate` / `clockTime`
  in `lib/format.ts`, never `toLocaleDateString` (browsers disagree on "Sep" and "Sept").
- Messages to providers carry a client's first name, household and benefits only: never phone, surname or anything
  medical. Sending details needs `applicants.share_with_landlords`.
- Keel's public website must never mention council incentives. Tracking them inside the CRM is fine.
