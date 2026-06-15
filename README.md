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
- [x] Phase 1 — Schema (migration, RLS, bin bucket, seed) — _run `supabase/0001_init.sql` in the dashboard; see [supabase/README.md](supabase/README.md)_
- [x] Phase 2 — The Bin (capture → OCR → extract → match → review → confirm). Uses **client-side Tesseract.js OCR** (free, no API key). Claude vision is a drop-in upgrade later via the same `Extraction` contract.
- [x] Phase 3 — Pipeline (kanban, drag to advance), applicant pages (Keel Line timeline with screenshot provenance), properties (rent vs LHA), contacts (referral counts), global ⌘K search
- [x] Phase 4 — Fees dashboard (net-of-split totals, mark invoiced/paid → advances stage), dark mode toggle (persisted, no-flash), lazy-loaded OCR chunk, V-to-Bin shortcut, mobile-friendly tables

**All phases complete.** Remaining optional work: deploy to Netlify, run a Lighthouse a11y pass, and tune the extractor against real screenshot formats.
