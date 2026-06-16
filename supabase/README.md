# Supabase setup — Phase 1

Two SQL files, run once each in the Supabase dashboard.

## Step 1 — open the SQL editor

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open your project
   (the same one v1 uses — `wsvapjyscqmzesyikmvy`).
2. Left sidebar → **SQL Editor** → **+ New query**.

## Step 2 — run the schema

1. Open [`migrations/0001_init.sql`](migrations/0001_init.sql), copy the whole file.
2. Paste into the SQL editor, click **Run** (or Ctrl/Cmd+Enter).
3. You should see **Success. No rows returned.** This creates:
   - 6 tables: `contacts`, `applicants`, `properties`, `placements`, `inbox_items`, `activities`
   - all enums, indexes, `updated_at` triggers
   - Row Level Security on every table (authenticated-only)
   - the `match_applicants` / `match_contacts` fuzzy-search functions
   - the private **`bin`** storage bucket + its access policies

It is safe to re-run — every statement is idempotent.

### Step 2b — run the tiering migration

Open [`migrations/0002_tiering.sql`](migrations/0002_tiering.sql), paste into a new
query, **Run**. This adds the referral-triage columns (UC / PIP / LCWRA /
council-registered / work status / household type / urgency / officer details /
consent / **tier**) to `applicants`. Also idempotent.

## Step 3 — seed sample data (optional but recommended)

1. New query → paste [`seed.sql`](seed.sql) → **Run**.
2. Adds 5 contacts, 7 applicants across every stage, 3 properties, 1 placement with a fee split, and a couple of activity rows.
3. Safe to re-run (guards against duplicates).

## Step 4 — confirm it worked

In the SQL editor run:

```sql
select stage, count(*) from applicants group by stage order by stage;
select id, name, public from storage.buckets where id = 'bin';
```

You should see applicants spread across stages and one **non-public** `bin` bucket.

## Step 5 — confirm RLS blocks anonymous access (the security check)

The build plan's Phase 1 acceptance is "anon is blocked". Verify from your machine:

```sh
# from the keel-crm-v2 folder
node supabase/verify-rls.mjs
```

Expected output: every table reports **BLOCKED ✓** for the anonymous key.
If any table says "LEAKED", RLS is not enabled on it — stop and tell me.
