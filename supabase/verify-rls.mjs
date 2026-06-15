// Verifies RLS blocks the anonymous (publishable) key from reading data.
// Run: node supabase/verify-rls.mjs
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(here, '..', '.env.local'), 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const TABLES = ['contacts', 'applicants', 'properties', 'placements', 'inbox_items', 'activities'];

let anyLeaked = false;

for (const table of TABLES) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body) ? body.length : 0;
  // With RLS on and no anon policy, PostgREST returns 200 + [] (no rows visible)
  // or 401/403. Either way, zero rows = blocked. Rows returned = leaked.
  if (rows > 0) {
    anyLeaked = true;
    console.log(`  ${table.padEnd(12)} LEAKED — returned ${rows} row(s) to anon!`);
  } else {
    console.log(`  ${table.padEnd(12)} BLOCKED ✓`);
  }
}

console.log('');
if (anyLeaked) {
  console.error('FAIL: at least one table is readable by the anonymous key.');
  process.exit(1);
} else {
  console.log('PASS: anonymous key cannot read any table.');
}
