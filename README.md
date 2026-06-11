# Keel CRM v2

CRM for Keel Lettings Ltd — DSS/Universal Credit placements across London. Headline feature: **The Bin** — paste a screenshot, Claude extracts and classifies it, matches it to existing records, and proposes what should happen; you confirm with one tap.

Full build plan: [KEEL_CRM_PLAN.md](KEEL_CRM_PLAN.md) · Conventions: [CLAUDE.md](CLAUDE.md)

## Stack

React 18 + Vite + TypeScript · Tailwind 4 + CSS tokens · Supabase (Postgres, Auth, Storage, RLS) · Netlify Functions · Claude API · TanStack Query · React Router

## Run locally

```sh
cp .env.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev
```

Design system reference renders at `/dev/tokens`.

## Build status

- [x] Phase 0 — Scaffold (tokens, auth gate, /dev/tokens)
- [ ] Phase 1 — Schema (migration, RLS, bin bucket, seed)
- [ ] Phase 2 — The Bin (capture → extract → review → confirm)
- [ ] Phase 3 — Pipeline & records
- [ ] Phase 4 — Fees & polish
