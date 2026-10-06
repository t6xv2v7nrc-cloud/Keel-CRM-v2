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
              money.ts (receivables per placement: letting fees and incentives, due dates from sign up, overdue;
                        the app says "Receivables", files and the activity kind keep the name "money"),
              help.ts (words behind the "?" help buttons)
  components/ ui primitives on tokens (Button, Badge, Card, Field, Toast, KeelLine,
              Icon, Visuals: avatars, page headers, stat tiles, SVG charts)
  features/   dashboard/ bin/ pipeline/ calls/ applicants/ properties/ settings/ map/ (Leaflet, lazy-loaded) progress/ requests/ (request sheet, Awaiting providers) money/ (the Receivables page at /receivables, client card, Home summary)
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
- Run order matters: 0009 (deals) before 0010 (providers, requests), then 0011 (sharing default), then 0012 (receivables).

## Checking the screen without signing in

Sign-in is invite-only and Claude must not enter passwords, so the real app cannot be opened in a preview. Use the harness:
it answers every Supabase request from sample rows in memory.

1. Copy `.harness/harness.html` to the repo root and `.harness/__harness.tsx` to `src/`. (Both are git-ignored. If
   `.harness/` is missing, it has to be rebuilt: an entry file that stubs `window.fetch` for the Supabase URL, stores a
   fake session with `access_token: 'harness'`, then renders `<App />`.)
2. Start the preview (`keel-v2` in `.claude/launch.json`) and open `http://localhost:5173/harness.html?path=/pipeline`
   (any route after `path=`). A plain reload loads the real app, so always go back through `harness.html`.
3. New table or column? Add sample rows to `db` in the harness copy, and save the improved copy back to `.harness/`.
4. Afterwards: remove the `sb-…-auth-token` entry from the preview's localStorage, stop the preview, and delete the two
   copies. `npm run build` type-checks everything in `src/`, so a left-over harness can fail the build.
5. Never commit the harness: its sample rows may look like real clients.

Check pages at phone width (375px) as well as desktop. Nothing may scroll sideways: below `lg` the page links sit on
their own row under the top bar, and the Pipeline is a row list, not a wide table.

## Pitfalls

- Never put code containing backslashes in a bash heredoc: `\n` turns into a line break and `\b` into a stray control
  byte. Use the Edit and Write tools, or write a script file and run it.
- Dates must read the same everywhere: use `shortDay` / `clockTime` in `lib/format.ts`, not `toLocaleDateString`.
- Messages to providers carry a client's first name, household and benefits only: never phone, surname or anything
  medical. Sending details needs `applicants.share_with_landlords`.
- Keel's public website must never mention council incentives. Tracking them inside the CRM is fine.
