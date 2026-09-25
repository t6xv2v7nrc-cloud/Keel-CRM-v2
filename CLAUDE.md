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
              help.ts (words behind the "?" help buttons)
  components/ ui primitives on tokens (Button, Badge, Card, Field, Toast, KeelLine,
              Icon, Visuals: avatars, page headers, stat tiles, SVG charts)
  features/   dashboard/ bin/ pipeline/ calls/ applicants/ properties/ settings/
  types/      extraction.ts (shared contract, imported by netlify functions)
netlify/functions/ extract.ts, lib/prompt.ts, lib/claude.ts
supabase/migrations/
```

## Conventions

- TypeScript strict; no `any` in `matching.ts` or the extraction contract.
- Share extraction types via `src/types/extraction.ts`, imported by the Netlify function.
- British English in all UI copy; no em dashes in user-facing text.
- Every DB write that changes state creates an `activities` row.
- Commit per phase with `phase-N:` prefix.
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
