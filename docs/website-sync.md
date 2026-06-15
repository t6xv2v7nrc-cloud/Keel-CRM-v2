# Syncing website enquiries into the CRM

Your website (keellettings.com) uses a Netlify form, which emails you each
enquiry (First Name / Last Name / Email / Phone / Enquiry Type / Message).
There are two ways to get these into the CRM. Both land the enquiry in **the
Bin as a review item**, so nothing is created without you confirming it.

## Option A — paste the email (works today, no setup)

1. Open the enquiry email, select all, copy.
2. In the CRM, go to **Bin → "Paste a website enquiry"**, paste, click **Parse enquiry**.
3. It pulls out the name, phone (→ +44 format), household size and budget,
   then shows a review card. Confirm to create the applicant.

Good for a handful a day. For hands-off sync, use Option B.

## Option B — automatic (Netlify webhook → CRM)

Every form submission is POSTed straight to the CRM, which files it in the Bin
automatically. You just open the Bin and confirm.

### One-time setup (about 5 minutes)

**1. Set the CRM's server env vars** (CRM Netlify site → Site settings →
Environment variables):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://wsvapjyscqmzesyikmvy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API → **service_role** secret (NOT the publishable key) |
| `INTAKE_SECRET` | any long random string you make up, e.g. a UUID |

Redeploy the CRM so the function picks them up.

> The service role key bypasses RLS and must only ever live in this server
> env — never in the website or client code.

**2. Point the website's form at the CRM** (the *website's* Netlify site, where
the form lives → Site settings → **Forms** → **Form notifications** → **Add
notification** → **Outgoing webhook**):

- **Event to listen for:** New form submission
- **URL to notify:**
  `https://<your-crm-site>.netlify.app/api/intake?key=<INTAKE_SECRET>`
  (use the same secret you set above)
- **Form:** the enquiry form

Save. Done.

### Test it

Submit a test enquiry on the website. Within a few seconds it should appear in
the CRM's **Bin → To review**, tagged "Website enquiry (auto)". Confirm it to
create the applicant.

### How it works

`netlify/functions/intake.mjs` receives the submission, checks `?key` against
`INTAKE_SECRET`, maps the fields (parsing household + budget out of the
message), and inserts an `inbox_items` row with `status='review'`. The review
card in the Bin then lets you edit and confirm — same flow as a pasted
screenshot, but the data arrives clean (no OCR).

## Upgrading to Claude later

Both paths fill the same `Extraction` contract used by screenshot OCR. If you
add an `ANTHROPIC_API_KEY` later, the screenshot path can swap OCR for Claude
vision with no change to the review/confirm flow — and the message-parsing in
the enquiry path could likewise be handed to Claude for messier emails.
