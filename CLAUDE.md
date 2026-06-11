# Keel CRM v2 — conventions

Read `KEEL_CRM_PLAN.md` for the full build plan. Work phase by phase; do not start a phase until the previous one's acceptance criteria pass.

## Repo structure

```
src/
  lib/        supabase.ts, matching.ts, format.ts (phone/E.164, money, dates)
  components/ ui primitives on tokens (Button, Badge, Card, Field, Toast, KeelLine)
  features/   bin/ pipeline/ applicants/ properties/ contacts/ fees/
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
- Styling: Tailwind utilities + CSS custom-property tokens from `src/styles/tokens.css` (§7 of the plan). No component libraries.
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
