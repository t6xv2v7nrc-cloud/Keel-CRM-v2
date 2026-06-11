# Keel CRM v2 — Build Plan for Claude Code

A ground-up rebuild of Keel Pipeline for Keel Lettings Ltd. The headline feature is **The Bin**: paste a screenshot anywhere in the app, Claude reads it (OCR + understanding in one step), classifies what it is, matches it to existing records, and proposes exactly what should happen — you confirm with one tap. Every record keeps a visible trail of *what happened where*.

How to use this file: drop it in the repo root, open Claude Code, and say *"Read KEEL_CRM_PLAN.md and execute Phase 0, then stop for review."* Work phase by phase. Each phase has acceptance criteria — don't move on until they pass.

---

## 1. Context (read this before writing any code)

Keel Lettings is a one-person London lettings agency specialising in DSS / Universal Credit placements. The operator works fast, mostly on mobile and WhatsApp. Information arrives as **screenshots**: WhatsApp messages from housing officers, referral forms, property details from landlords, fee confirmations from councils.

Domain vocabulary the system must understand:

- **Applicant** — a person referred for housing (e.g. via a housing officer or the website). Key facts: name, phone, household size, benefit type (UC / HB), borough referring, budget / LHA band.
- **Housing officer** — council or charity contact who refers applicants (e.g. officers at Haringey, Harrow, RBKC, Hounslow, Norwich). Belongs to an organisation and borough.
- **Property** — usually studios/1-beds/HMO rooms, tracked by borough, rent pcm vs LHA rate, void/let status.
- **Placement** — an applicant matched into a property: move-in date, rent, council incentive, **fee** (with possible partner splits, e.g. 50/50 with a partner agency).
- **LHA** — Local Housing Allowance, the benefit rate cap per borough/BRMA and bedroom category. Rent vs LHA gap matters on every deal.

Pipeline stages: `lead → referred → viewing → offer → placed → fee_invoiced → fee_paid` (terminal alt: `lost`).

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│  React + Vite SPA (Netlify)                         │
│  paste/drag screenshot → upload to Supabase Storage │
│        │                                            │
│        ▼                                            │
│  Netlify Function /api/extract  (holds secrets)     │
│        │  signed read of image (service role)       │
│        ▼                                            │
│  Claude API (Messages, vision + forced tool use)    │
│        │  returns strict JSON extraction            │
│        ▼                                            │
│  Matching engine (SQL: pg_trgm + phone/postcode)    │
│        │  proposed actions + confidence             │
│        ▼                                            │
│  Review card → user confirms → upsert + activity    │
└─────────────────────────────────────────────────────┘
```

**Key decision — no Tesseract.** Claude's vision does OCR, layout understanding, classification and field extraction in a single call. Tesseract would give raw text that still needs parsing; Claude gives structured entities directly, handles WhatsApp screenshots, cropped forms and photos of paper, and can reason ("this is a referral, the phone number belongs to the applicant, not the officer").

**Human-in-the-loop, always.** Extraction never writes to core tables directly. It writes to `inbox_items`; the user confirms a review card; only then do upserts happen. Every confirmed write creates `activities` rows linking back to the source screenshot — that is the "I know what happens where" guarantee.

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Continuity with existing Keel Pipeline skills |
| Styling | Tailwind CSS + CSS custom-property tokens | Tokens defined once in §7, used everywhere |
| Data/Auth | Supabase (Postgres, Auth, Storage, RLS) | Already in use; pg_trgm for fuzzy matching |
| Server | Netlify Functions (TypeScript) | Keeps `ANTHROPIC_API_KEY` + service role off the client |
| AI | Claude API — `claude-sonnet-4-6`, Messages API with forced tool use | Strong vision + structured output at sensible cost. Verify current model strings at https://docs.claude.com/en/api/overview before coding |
| State | TanStack Query | Cache + optimistic confirm flow |
| Routing | React Router | Simple, known |

No Redux, no ORM, no component library — hand-rolled components on the token system.

## 4. Data model (Supabase migration)

Create as `supabase/migrations/0001_init.sql`. Enable extensions `pg_trgm` and `pgcrypto`.

```sql
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create type contact_type as enum ('housing_officer','partner','landlord','other');
create type applicant_stage as enum
  ('lead','referred','viewing','offer','placed','fee_invoiced','fee_paid','lost');
create type property_status as enum ('void','under_offer','let','withdrawn');
create type inbox_status as enum
  ('queued','extracting','review','confirmed','discarded','failed');
create type fee_status as enum ('pending','invoiced','paid');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  type contact_type not null default 'other',
  full_name text not null,
  organisation text,
  borough text,
  email text,
  phone text,            -- E.164 normalised (+44...)
  notes text,
  created_at timestamptz not null default now()
);

create table applicants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,            -- E.164
  email text,
  date_of_birth date,
  adults int default 1,
  children int default 0,
  benefit_type text,                 -- 'UC' | 'HB' | other
  referring_borough text,
  source text,                       -- 'officer' | 'website' | 'chatgpt' | 'whatsapp' | ...
  referred_by uuid references contacts(id),
  stage applicant_stage not null default 'lead',
  budget_pcm numeric,
  lha_band text,                     -- e.g. 'shared', '1bed'
  requirements text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  address_line text not null,
  postcode text,
  borough text,
  property_type text,                -- 'studio' | '1bed' | 'hmo_room' | ...
  rent_pcm numeric,
  lha_rate_pcm numeric,
  landlord_id uuid references contacts(id),
  status property_status not null default 'void',
  available_from date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table placements (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id),
  property_id uuid references properties(id),
  council text,
  officer_id uuid references contacts(id),
  move_in_date date,
  rent_pcm numeric,
  incentive_amount numeric,
  fee_amount numeric,
  fee_splits jsonb default '[]'::jsonb,  -- [{"partner":"KPL","pct":50}]
  fee_status fee_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  image_path text,                   -- storage path in private 'bin' bucket
  source_hint text,                  -- optional user note typed at paste time
  status inbox_status not null default 'queued',
  detected_type text,                -- from extraction
  raw_text text,                     -- transcription from extraction
  extraction jsonb,                  -- full structured extraction (§5 contract)
  matches jsonb,                     -- matching engine output (§6)
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,         -- 'applicant' | 'property' | 'placement' | 'contact'
  entity_id uuid not null,
  kind text not null,                -- 'created' | 'updated' | 'stage_change' | 'note' | 'extraction'
  body text not null,                -- human-readable: "Stage referred → viewing (from screenshot)"
  inbox_item_id uuid references inbox_items(id),
  created_at timestamptz not null default now()
);

create index activities_entity_idx on activities(entity_type, entity_id, created_at desc);
create index applicants_name_trgm on applicants using gin (full_name gin_trgm_ops);
create index contacts_name_trgm on contacts using gin (full_name gin_trgm_ops);
```

RLS: enable on every table; policy = authenticated user with the owner email may select/insert/update (single-operator system, Supabase email auth). The `bin` storage bucket is **private**; client uploads via authenticated session, server reads via service role.

## 5. The Bin — intake pipeline

### 5.1 Capture (client)

- **Paste-anywhere:** a global `paste` listener on the app shell. If clipboard contains an image, open the Bin overlay with the image staged. Also support drag-drop onto the Bin page and a file picker (mobile: camera roll).
- Optional one-line `source_hint` field ("from Debby, Harrow") shown at staging — passed to extraction as context.
- On submit: compress client-side to max 1600px JPEG, upload to `bin/{uuid}.jpg`, insert `inbox_items` row (`status='queued'`), call `/api/extract` with the row id, flip status to `extracting`.

### 5.2 Extraction (Netlify Function `/api/extract`)

Server-side only. Steps:

1. Service-role fetch of the image from storage → base64.
2. Call Claude Messages API: model `claude-sonnet-4-6`, `max_tokens: 2000`, image block + text block, **forced tool use** (`tool_choice: {type:"tool", name:"record_extraction"}`) so output is guaranteed JSON matching the schema below.
3. Write result to `inbox_items.extraction`, `raw_text`, `detected_type`; run the matching engine (§6); write `matches`; set `status='review'`. On API error: `status='failed'`, store `error`.

**Extraction tool schema (the contract):**

```json
{
  "name": "record_extraction",
  "input_schema": {
    "type": "object",
    "required": ["doc_type", "transcription", "summary", "confidence"],
    "properties": {
      "doc_type": { "enum": ["applicant_referral","property_details","officer_message",
        "fee_confirmation","viewing_arrangement","landlord_offer","tenancy_doc","unknown"] },
      "transcription": { "type": "string" },
      "summary": { "type": "string", "description": "One sentence: what this is and what it implies" },
      "confidence": { "type": "number" },
      "applicant": { "type": "object", "properties": {
        "full_name": {"type":"string"}, "phone": {"type":"string"},
        "date_of_birth": {"type":"string"}, "adults": {"type":"integer"},
        "children": {"type":"integer"}, "benefit_type": {"type":"string"},
        "referring_borough": {"type":"string"}, "budget_pcm": {"type":"number"},
        "requirements": {"type":"string"} } },
      "property": { "type": "object", "properties": {
        "address_line": {"type":"string"}, "postcode": {"type":"string"},
        "borough": {"type":"string"}, "property_type": {"type":"string"},
        "rent_pcm": {"type":"number"}, "available_from": {"type":"string"} } },
      "contact": { "type": "object", "properties": {
        "full_name": {"type":"string"}, "organisation": {"type":"string"},
        "borough": {"type":"string"}, "role": {"type":"string"},
        "phone": {"type":"string"}, "email": {"type":"string"} } },
      "money": { "type": "object", "properties": {
        "fee_amount": {"type":"number"}, "incentive_amount": {"type":"number"},
        "rent_pcm": {"type":"number"} } },
      "dates": { "type": "array", "items": { "type":"object", "properties": {
        "label": {"type":"string"}, "date": {"type":"string"} } } },
      "suggested_actions": { "type": "array", "items": { "enum": [
        "create_applicant","update_applicant","advance_stage","create_property",
        "update_property","create_contact","create_placement","update_placement",
        "record_fee","log_note_only"] } }
    }
  }
}
```

**System prompt for the extraction call** (keep in `netlify/functions/lib/prompt.ts`):

> You extract structured data from screenshots for a London lettings agency specialising in DSS/Universal Credit placements. Screenshots are typically WhatsApp messages from council housing officers, referral forms, property particulars, or fee/incentive confirmations. Transcribe the legible text faithfully, then populate only the fields you can actually see or directly infer — never invent values. Normalise UK phone numbers to E.164 (+44...). Dates → ISO 8601; interpret ambiguous dates as DD/MM (UK). Money → numbers without currency symbols. Distinguish carefully between the applicant (person being housed) and the contact (officer/landlord sending the message). London borough names should be canonical (e.g. "RBKC" → "Kensington and Chelsea" is NOT required — keep "RBKC" as written but set borough fields consistently). If the user supplied a source hint, weigh it. Set confidence below 0.6 if the image is partial or ambiguous, and prefer doc_type "unknown" over guessing.

### 5.3 Review & confirm (client)

The review card is the heart of the app. Layout: screenshot on the left (zoomable), extracted fields on the right, every field **editable** before confirm. Below the fields, the matching engine's proposal (§6) rendered as plain English with radio choices, e.g.:

> Looks like **existing applicant "L. Hassan"** (phone match, 0.94). → ◉ Update her record ○ Create new applicant ○ Just log a note

Buttons: **Confirm** (executes chosen actions in one transaction, writes `activities`, sets `status='confirmed'`), **Discard**. After confirm, show toast linking to the affected record(s).

## 6. Matching & routing — "what happens where"

Implemented as a pure TypeScript module (`src/lib/matching.ts`) called by the function after extraction, re-runnable client-side when the user edits fields.

Matching order per entity:

1. **Phone** (E.164 exact) → strong match (score 0.95).
2. **Postcode + house number** for properties → strong match.
3. **Name fuzzy** via Postgres RPC using `similarity(full_name, $1) > 0.45`, scored by trigram similarity; boost +0.15 if borough also matches.
4. Below 0.45 → no match → propose create.

Routing rules (deterministic, by `doc_type`):

| doc_type | Default proposal |
|---|---|
| applicant_referral | Create/update applicant; set `stage='referred'`; link `referred_by` to matched/created contact |
| property_details | Create/update property; status `void` unless stated |
| officer_message | Log note on matched applicant/contact; offer stage advance if message implies it ("viewing booked" → `viewing`) |
| viewing_arrangement | Advance matched applicant to `viewing`; create activity with date |
| fee_confirmation | Update/create placement; set `fee_amount`; `fee_status='invoiced'` or `'paid'` as stated |
| landlord_offer | Property → `under_offer`; applicant → `offer` if both matched |
| unknown | Log note only (user picks target) |

**Stage moves are monotonic by default** (never silently move backwards); regressions require an explicit toggle on the review card. Every executed action writes one `activities` row with a human sentence and the `inbox_item_id` — the timeline on each record therefore answers "what happened, when, from which screenshot."

## 7. Design system — "Keel" identity

Identity concept: a keel is the spine that keeps a vessel true. The UI is calm paper-and-navy civic software with **one brass spine** running through it — not the cream-serif-terracotta template, not a black dashboard with neon.

### 7.1 Colour tokens (WCAG-verified)

All ratios computed and verified; AA minimum 4.5:1 for text.

**Light (default)**

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--paper` | `#F6F7F4` | App background | — |
| `--surface` | `#FFFFFF` | Cards, panels | — |
| `--ink` | `#16212E` | Primary text | 15.1:1 on paper, 16.3:1 on white (AAA) |
| `--ink-muted` | `#51606F` | Secondary text | 6.5:1 on white (AA) |
| `--hull` | `#1C3D5A` | Primary buttons (white text) | 11.3:1 (AAA) |
| `--brass` | `#F0B429` | Signature accents, fills (dark text `#10100A`) | 10.2:1 on fill (AAA) |
| `--brass-ink` | `#8A5A06` | Brass as text on white | 5.9:1 (AA) |
| `--link` | `#1C5D8F` | Links | 7.0:1 (AAA) |
| `--danger` | `#A8231A` | Errors on white | 7.2:1 (AAA) |
| `--success` | `#1D5C38` | Success on white | 8.0:1 (AAA) |

**Dark (`[data-theme=dark]`)**: `--paper #0C141F`, `--surface #16212E`, `--ink #EDF1F5` (16.3:1), `--ink-muted #9AAABB` (7.8:1), brass unchanged as fill.

**Stage badges** (tinted bg + dark text, all AA+): lead `#3D4B5C/#E4E9EE` · referred `#174E78/#DCEAF5` · viewing `#5B3E8F/#E9E2F6` · offer `#7A4D04/#FBEED3` · placed `#1D5C38/#DDF0E4` · fee_paid solid `#1D5C38` + white (8.0:1) · lost `#8C2B23/#F9E2DF`.

### 7.2 Type

- Display/headings: **Bricolage Grotesque** (700/600) — characterful without being decorative.
- Body/UI: **IBM Plex Sans** (400/500) — civic, dense-data friendly.
- Data/refs/money: **IBM Plex Mono** for amounts, postcodes, phone numbers.
- Scale: 13 / 15 (base) / 18 / 22 / 28. Sentence case everywhere. Buttons say what they do ("Confirm and update Lubna", not "Submit").

### 7.3 Signature element — the Keel Line

Every applicant page and the pipeline board carry a 3px vertical **brass spine** on the left of the timeline; stage markers sit on it like depth gauge ticks, filled brass when reached, hollow ahead. The Bin's review card reuses it: confirmed actions animate onto the spine. This is the app's one flourish; everything else stays quiet.

### 7.4 Floor

Responsive to 360px; visible `:focus-visible` rings (`--hull`, 2px offset); `prefers-reduced-motion` respected; touch targets ≥ 44px; toasts announced via `aria-live`.

## 8. Screens

1. **Bin** (default route `/`) — paste target, queue of items by status, review cards. Empty state: "Paste a screenshot anywhere — Ctrl/Cmd+V."
2. **Pipeline** `/pipeline` — kanban by stage, applicant cards (name, borough, budget vs LHA chip, days-in-stage). Drag to advance (writes activity).
3. **Applicants** `/applicants/:id` — details, placement panel, Keel Line timeline of activities with screenshot thumbnails.
4. **Properties** `/properties` — table + detail; void list grouped by borough; rent vs LHA delta column.
5. **Contacts** `/contacts` — officers/partners/landlords, grouped by borough; per-contact referral history.
6. **Fees** `/fees` — placements with fee status, splits, monthly totals; mark invoiced/paid.
7. **Search** — global ⌘K across all entities (Supabase `ilike` + trigram).

## 9. Build phases (execute in order; stop after each)

**Phase 0 — Scaffold.** Vite + React + TS + Tailwind + Router + TanStack Query; token CSS from §7; Supabase client; Netlify config (`netlify.toml`, functions dir); auth gate (email magic link). *Done when:* app builds, deploys, login works, tokens render on a styleguide page at `/dev/tokens`.

**Phase 1 — Schema.** Migration §4, RLS policies, `bin` bucket, seed script with sample contacts/applicants. *Done when:* RLS verified (anon blocked), seed visible in a raw table view.

**Phase 2 — The Bin.** Paste/drag/picker capture, upload, `/api/extract` function with forced tool use, matching engine + RPC, review card with editable fields, confirm transaction writing entities + activities. *Done when:* a real WhatsApp referral screenshot goes paste → review → confirm → applicant exists with timeline entry linking the screenshot; a fee confirmation updates a placement.

**Phase 3 — Pipeline & records.** Kanban, applicant/property/contact pages, Keel Line timeline, global search. *Done when:* drag advances stage and logs activity; timelines show extraction provenance.

**Phase 4 — Fees & polish.** Fees dashboard, dark mode toggle, mobile pass at 360px, empty/error states per §7 writing rules, keyboard shortcuts (V paste focus, ⌘K search). *Done when:* Lighthouse a11y ≥ 95, all §7.4 floor items pass.

## 10. Security & data care

- `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` exist **only** in Netlify function env. Client gets anon key + RLS.
- `bin` bucket private; images served to the UI via short-lived signed URLs.
- Applicant data is personal data: add a per-applicant delete that cascades activities and removes linked screenshots (supports ICO/GDPR erasure).
- Function validates the caller's Supabase JWT before doing anything.

## 11. Repo structure & conventions (put in CLAUDE.md)

```
src/
  lib/        supabase.ts, matching.ts, format.ts (phone/E.164, money, dates)
  components/ ui primitives on tokens (Button, Badge, Card, Field, Toast, KeelLine)
  features/   bin/ pipeline/ applicants/ properties/ contacts/ fees/
netlify/functions/ extract.ts, lib/prompt.ts, lib/claude.ts
supabase/migrations/
```

Conventions: TypeScript strict; no `any` in `matching.ts` or the extraction contract (share types via `src/types/extraction.ts`, imported by the function); British English in all UI copy; no em dashes in user-facing text; every DB write that changes state creates an `activities` row; commit per phase with `phase-N:` prefix.

Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OWNER_EMAIL`.
