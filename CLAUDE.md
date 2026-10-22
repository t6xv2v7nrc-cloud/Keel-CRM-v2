# Keel CRM v2 — conventions

Read `KEEL_CRM_PLAN.md` for the full build plan. Work phase by phase; do not start a phase until the previous one's acceptance criteria pass.

## Repo structure

```
src/
  lib/        supabase.ts, matching.ts, format.ts (phone/E.164, money, dates),
              settings.ts (team rules + my settings, tier logic types), tiering.ts (tier engine),
              calls.ts, propertyMatch.ts, readNotes.ts (form answers from free text; `readHouseholdText` reads who is moving
                           in as a whole: any child, "my 13-year-old daughter", "single mum", makes a family; writing as one
                           person and asking only for a studio or 1 bed, nobody else mentioned, reads as single; `readAgeText`
                           reads "I'm 28"; also used for pasted enquiries),
              clientProfile.ts (the Profile card, first on a client's page: household, age and age band (date of birth,
                           else read), the rate they are paid (families by bedrooms; couples, 35 plus and SAR-exempt the 1 bed
                           rate; other under-35s the shared rate), exemptions to check, benefits, wants ("Area: london" is
                           London), council and incentive, where to place them (LHA areas of available matches within the
                           LHA they are paid there; London clients stay in London), what to ask next; one-tap fill-in of the
                           notes reader's sure answers (never overwrites an answer)), contacts.ts (notes on a client and last contact: activities kind "contact"
                           ("WhatsApp: ...") or "note"; calls and WhatsApp sends count as contact; no migration),
              lha.ts (LHA area, size rules and rent-vs-LHA check; rates from the database (lha_rates, 0018, loaded from the
                      gov.uk CSV with source and start date), else the built-in src/data/lha-rates.ts, marked not checked;
                      postcode corrections in postcode_brma; `rentShown` shows "1-Bed LHA" rents as pounds; `overLha`:
                      over only when £1 or more above, so pennies over is at the LHA, used everywhere),
              whatsapp.ts (wa.me links and message wording for sending properties),
              shareWhatsApp.ts (the other WhatsApp shares, buttons in features/properties/ShareLinks.tsx: the shown matches
                           to the referring officer (`officerMatchesText`: client's full name, their LHA there, why each
                           fits; not-ready left out, never to an officer who left); the Mailer's alert or digest on WhatsApp
                           (`alertWhatsApp`, `digestWhatsApp`, `whatsappRecipients`: the mailing list's people with a mobile,
                           not a team mailbox); a housed client asked to recommend Keel (`recommendText`, Team settings
                           `whatsappRecommend`, `{keel contact}` from the phone, else email, on Invoices; counts as contact;
                           never incentives); a client to a property's provider (`landlordShareText`: "Salam", first name,
                           household, benefits, council; needs share_with_landlords; logged as shared)),
              propertyEdit.ts (editing a saved property: typed rent, bedrooms from the type, what changed in words;
                               the Edit button on each property card, features/properties/EditProperty.tsx),
              propertyChecks.ts (0019, 0025: kind of place, who it suits, safety papers; LHA gap and shared-rate gap worked
                               out, never typed (the shared rate is never shown as a note); flags red over LHA, amber outside
                               Greater London or recorded papers lapsed, grey marked not ready by hand (`not_ready_at`, `not_ready_note`); `sendBlockers`
                               = grey only (over LHA is red but still sendable from the Mailer, marked red); card and Mark
                               not ready / Mark ready in features/properties/Checks.tsx),
              matchRules.ts (Step 6, 0023: the rules on top of propertyMatch's scores; every screen matches through it:
                           LHA at the rate the client is paid (`rateOf` in clientProfile.ts) in the property's BRMA, hidden
                           when over unless `showOverLha`; shared kitchen or HMO room never to couples or families;
                           `suitable_for` respected; families never under their size; BRMA must be one they want
                           (`targetsOf`: their areas, districts, postcode_area; "London"; else their council and next door);
                           London officers' clients see nothing outside Greater London unless `showOutsideLondon`;
                           one-line reason (`line`), expected income (`incomeFor`: provider fee + incentive on Finances, else
                           the scheme's max, else "likely" for an officer referral); on a property, incentive-bearing first;
                           `hiddenForApplicant` counts what the rules hid; UI bits in features/properties/MatchBits.tsx),
              geo.ts (placing postcodes via postcodes.io, cached per device; a client's areas as districts; `locateCouncils`:
                      a council at the middle of its districts, else by name from postcodes.io places),
              officerMap.ts (housing officers on the Properties map: `officerPlaces` groups the officer list and officers
                      named only on clients by council, with send status from `mailingList`, clients referred; squares
                      on the map (features/map), a council's officers in a panel under it; no call or email to one who left),
              progress.ts (deals: each property a client is going for; stage follows deals, next steps, stuck, gone cold,
                           the move-in checklist on accepted and moved-in deals (`deals.checklist`, items in Settings)),
              viewings.ts (0022: how a viewing went (viewed, no_show, offered, declined, signed; `outcomeForMove` writes it as
                           deals move), why a deal was lost (`LOST_REASONS` grouped by `reason_lost`; old ones read by
                           `reasonLostOf`, never written back), working hours, the first reply to an officer's nomination
                           (`replyState`, nominated_at else created_at) and the outcome back the same day (`outcomeBack`);
                           `responsesDue` is Home's Waiting on us; `caseworkAddress` never writes to someone who left or bounced;
                           UI in features/progress/Responses.tsx and features/dashboard/WaitingOnUs.tsx),
              requests.ts (providers' rules, request messages to providers, follow-ups; never phone, surname or health),
              money.ts (Finances: receivables per placement (letting fees and incentives), fees worked out from the rent
                        (£, % of a month's rent, weeks of rent; a week is pcm × 12 ÷ 52), due dates from sign up or from the
                        first month's rent, overdue, potential fees from deals, by month, calendar and .ics file;
                        the app says "Finances", files and the activity kind keep the name "money"),
              placements.ts (0021: a placement is a client's moved-in deal; its record (made at move-in) holds route,
                           partner (provider_id), fee type, Keel's share %, who invoices the council, split agreed in writing
                           and the link, Renters' Rights sheet date; amounts, invoice and paid dates are read from receivables;
                           flags: red incentive with no written split; panel on the client's Finances card and the
                           Finances page's Placements tab, features/money/Placement.tsx),
              invoice.ts (invoice wording, numbering, VAT split, WhatsApp and email text; client first name only to providers),
              officers.ts (housing officers gathered from clients' details, joined on email, phone, name; copy formats),
              officerPaste.ts (Paste officers on Councils, features/councils/PasteOfficers.tsx: `readOfficerPaste` reads a
                           spreadsheet with headings, an email's To line, signatures or one a line into name, email, phone,
                           job title, council; checked against the list (`recordFor`, then name); one already on it only gets
                           its blanks filled (`fills`); `pastedRow` is never opted in unless "They asked" with how; a team
                           mailbox for properties (`mailboxKind`) is a procurement mailbox; the Bin hands a pasted officer
                           list over (`looksLikeOfficers`, `PASTE_HANDOFF` in sessionStorage); `useAddPastedOfficers`),
              councils.ts (0020: the officer list (HELM's `officers` table) with send status, sends log, council schemes;
                           THE HARD RULE `mailingList`: every export, mailer list and bulk action of officer addresses goes
                           through it: no left, on leave, opted out, bounced, or housing officer not opted in or nominated;
                           a shared mailbox (send_to_mailbox) replaces personal emails; list health; focus boroughs),
              mailer.ts (Step 7, 0024: the Mailer at /mailer, features/mailer/MailerPage.tsx: `sendables` (available, no
                         `sendBlockers`, LHA area and rent known; over LHA sendable, `over`, marked red with how far over,
                         listed last, in digests only with Include over LHA), nothing sent until `mailerReady` (gov.uk rates loaded);
                         All properties tab (`fullList`: every sendable one, or one borough's, by area, focus first, over LHA
                         and outside London only when ticked; `fullListBody`, `fullListWhatsApp`, `fullListCsv` spreadsheet;
                         to the whole mailing list via `digestRecipients(null, ...)`, recorded as kind 'bulk'; linked from
                         the Properties page's Send all properties);
                         alerts: one property, to officers of nominated clients it fits (`alertRecipients`); monthly digest:
                         one borough, `digestPicks` 5 to 8, `digestRecipients` flags a bulk send in the last 30 days;
                         recipients only via `mailingList`; out-of-London never to London officers unless included;
                         plain text, subject "[Borough] | type | £rent pcm | LHA £rate | available date", LHA line,
                         `complianceLine`, up to 3 `photo_urls`, credentials and a STOP line; never client names or
                         incentives; every send recorded (`useRecordMailerSend`: officer_sends with subject and
                         property_ids, last_sent_at, property and officer history); `oldMailerBackup` for the separate
                         Keel Mailer's Restore box, folded under the Officers tab (?tab=old lands there);
                         page: one status line, a Before you send card (gov.uk rates, footer details), tabs Alerts, Monthly
                         digest, All properties, Officers; each property one line with an LHA chip (`LhaChip`); the
                         email in three steps: who it goes to, the email (subject and a preview), send it), business.ts (Team settings `business`: redress, CMP, LLAS, ICO, fees,
                         unsubscribe email; blank ones left out; `signature` also signs the officer outcome email),
              outlook.ts (each person's work Outlook through Microsoft Graph, from the browser: MSAL sign-in in Microsoft's
                      window (popup; full page in the home-screen app), delegated User.Read, Mail.Read, Mail.Send, kept on
                      the device; app IDs in Team settings `outlook` (not secrets); `sendFromOutlook` (several in Bcc, sender
                      in To), `inboxSince`, `addressesSince`; outlook-redirect.html + src/outlookRedirect.ts is the page
                      Microsoft returns to; `setOutlookTestDouble` is for the harness only),
              outlookMail.ts (sorting Outlook mail: only officers on the list, officers named on clients or .gov.uk
                      addresses come in, never anything else (`sortEmail`): reply about a client (their officer naming
                      them, or a client named in the subject) to the timeline (activity kind "email"), nomination to the
                      Bin (dated from arrival), other waits on the Bin (file, send to the Bin, ignore); `officerAddresses`
                      gathers council officers from sent and received headers to add, not opted in;
                      0026 `outlook_messages` claims each email once; UI in features/outlook/Outlook.tsx: Send from
                      Outlook (always asks first), Your Outlook (My settings), Outlook (Team settings, with Entra steps),
                      Officer emails from Outlook (Bin), Officers from your Outlook (Councils), checked every 5 minutes),
              notifications.ts (what needs someone, by Home's rules: Bin to review, replies and outcomes owed to officers,
                      viewings in the next 3 hours, next steps due, overdue money, officers' emails, back from ice; ids
                      stay the same while it is the same thing; first names and short addresses only; `pushPlan` picks
                      what goes to phones: new things once each, a viewing within the hour, more than 3 as one, and a
                      morning summary on working days 8:30 to 11 London time); the bell, panel and pop-ups are
                      features/notifications/Notifications.tsx (read state per person per device),
              push.ts (notifications on this device: Web Push via sw.js; turn on per device in My settings
                      (features/notifications/PushCard.tsx); on iPhone only from the Home Screen; 0027 push_subscriptions;
                      server side netlify/functions/push-key.ts (public key; the key pair is made once into push_keys,
                      which no policy opens), push-test.ts, and push-send.ts every 10 minutes (TZ London, the same rules
                      as the bell, each sent once via push_log; the first run only notes what is already there)),
              guide.ts (in-product guidance: Getting started on Home (steps tick themselves from what Keel holds; owner
                      steps say so; put away per device, back from the account menu), What's new (`WHATS_NEW`, newest
                      first, ids never reused; card on Home while unseen, page at /whats-new), `TIPS` (one per page, Got
                      it per device); UI in features/guide/Guide.tsx; add a What's new entry for anything Ridwan would notice),
              clipboard.ts (copy with a fallback for older phones), files.ts (save a file, share sheet on phones),
              duplicates.ts (clients entered twice: same phone, email or name; a contact on more than 3 clients is shared,
                             not a duplicate; merging is the `merge_applicants` database function, 0014),
              digest.ts (the Today summary on Home: first names and short addresses only, as it goes to WhatsApp),
              claudeRead.ts (Bin screenshots read by Claude through /api/read-screenshot; null means read on the device),
              shareClient.ts (a client described for a landlord or agent: first name, household, benefits, size, areas,
                              budget, council; never surname, phone, email or medical; needs share_with_landlords),
              collapse.ts (`useFold`: cards folded away on this device; CardHeader takes open/onToggle and keeps its
                           summary (sub) in view when folded; `openCard` opens one from elsewhere; some start folded),
              clientLayout.ts (order of the client page's cards: personal setting `clientPageOrder`, Arrange panel),
              targets.ts (weekly, monthly, annual targets: placements moved in and fees signed up, pace; Team settings `targets`),
              kpis.ts (Step 8, Weekly numbers at /numbers, features/dashboard/NumbersPage.tsx, linked from Home: placements by
                       borough (focus first) and route, viewings per placement, reasons lost (moving in with Keel is no
                       loss), incentive per placement and share split in writing, sign-up to cash (middle value), sent
                       within LHA (target 100%), first replies and outcomes on time, list health; the month's goal from
                       Team settings `monthlyGoal` (6 to 8 placements, 4 with an incentive); read-only, no migration),
              help.ts (words behind the "?" help buttons)
  components/ ui primitives on tokens (Button (lifts on hover, `busy` spinner; every button gives a little on press,
              index.css), StageBadge, Card, Field, Toast (icon, slide in, close, countdown bar), Icon,
              Visuals: avatars, page headers, stat tiles (numbers count up), PageSkeleton, Empty (with `action`),
              SVG charts, UpdateNote for "run this migration"). Motion tokens (--ease-*, --dur-*) and keel-* animations
              in index.css (keel-page, keel-stagger, keel-rise, keel-pop, keel-skeleton, keel-ping); all off with reduced motion
  features/   councils/ (the Councils page at /councils: officers with one-click opted out / left, list health, schemes)
              dashboard/ bin/ pipeline/ (with the Housing officers and Possible duplicates boxes) calls/ applicants/ properties/ settings/ map/ (Leaflet, lazy-loaded) progress/ requests/ (request sheet, Awaiting providers) money/ (the Finances page at /finances: Owed, Potential, Calendar, Paid; invoice page at /finances/invoice/:id;
              client card, Home summary)
  types/      extraction.ts (shared contract, imported by netlify functions; also EXTRACTION_SCHEMA for Claude's
              structured output and cleanExtraction(), run on every answer by the function and again by the Bin)
netlify/functions/ intake.mjs (website form to the Bin), read-screenshot.ts (Claude reads a Bin screenshot; checks the
              caller's Supabase token, answers 501 until ANTHROPIC_API_KEY is set), lib/prompt.ts (what Claude is told).
              Type-checked strictly by `tsconfig.functions.json` as part of `npm run build`.
tools/        keel-mailer.html: the standalone mailer Ridwan runs as a Claude artifact (window.storage; reads lists through
              the Claude API); not part of the app or the build. Each housing officer gets a local list (their council and the
              3 neighbouring areas with the most properties; BORDERS is copied from london.ts) or the full list, by Outlook.
supabase/migrations/
supabase/checks/live-vs-repo.sql  (read-only: which migrations the live database has had, and tables no migration made)
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
  Studios (HMO studios too: "HMO" alone never makes a studio shared) and en-suite rooms count as 1 bed for LHA; only HMO
  rooms and plain rooms use the shared rate. "Central" means the zone 1 districts (`CENTRAL_DISTRICTS`).
  "Self-contained only" (the client's Shared accommodation switch, stored as those words in their must-haves; the same
  wish in their own words counts) is never matched to anything shared: rooms, en-suite rooms and studios, HMO rooms, house
  shares, or notes saying shared kitchen or bathroom (`selfContainedFrom`, `withSelfContained`, `shared` in propertyMatch.ts).
  No "shared" notes on properties (Ridwan's call): no shared-rate line on cards or in emails, no "Suits not set" amber,
  and a guessed kind of place is never printed (only one set by hand shows, on the card and in Mailer wording).
- Matching rules (Step 6, matchRules.ts) decide what anyone is offered: within the LHA the client is paid there (wins
  over the premium rule), in an LHA area they want, a kind of place that suits them; out-of-London never to a London
  officer's client by default. What the rules hide is counted under each list, with Show over LHA and Show outside
  London switches (personal settings set the default). Needed for matching (Profile): postcode area, age band, who is
  moving in, UC, benefit cap, PIP or LCWRA (`matchingGaps`).
- Properties are ready to send by default: the suppliers see to their safety checks. Missing papers or photos never hold
  one back (recorded ones that have lapsed show amber); only Ridwan's Mark not ready (0025, with a reason, logged) does.
  Do not make papers or photos block again unless he says. Over LHA (£1 or more, `overLha`) is hidden from clients
  unless Show over LHA, but Ridwan can send it from the Mailer: it shows red and the message says how far over.
- PIP exempts a client from every cap and the shared rate, whatever else is recorded (`benefitCapOf`, `sharedRateExempt`
  in search.ts, the one rule everywhere): no benefit cap, no UC-only limit, the 1 bed rate at any age (age not needed).
  LCWRA lifts the benefit cap and the UC-only limit, not the shared rate. PIP clients are still held to LHA (Step 6).
- Short lists, not endless ones: each property shows only its best few clients (`bestFew`), one line each. No kanban.
- Nothing scrolls sideways, on a phone especially.
- Keel should feel alive but quiet: things rise into place, buttons give and spin while busy, toasts slide in; nothing
  flashes or loops except a soft ping on New and unread. Notifications (the bell, pop-ups, push) are worked out from the
  data by notifications.ts, never typed in, and carry first names only. New features get a What's new entry, and a page's
  first-time tip if it needs one; empty pages say what to do next.
- Cards fold away: `<Card fold="page.name">` (startsFolded for Settings, which reads as a list of sections) folds from its
  CardHeader, remembered per device (collapse.ts); a link to a Settings card (#targets) opens it. Property cards fold too
  (Cards: Open or Folded on the Properties page, remembered; folded on a phone, their buttons wait), the Mailer folds a
  long officer list to a line, and on a phone the Properties filters sit behind one Filters button.
- Properties go to clients, and requests go to providers, as WhatsApp links (wa.me) the person sends by hand; every
  send is logged. Providers are greeted "Salam {name}". The same goes for the other shares (shareWhatsApp.ts): matches
  to a client's referring officer, Mailer alerts and digests on WhatsApp (recorded like an email), a housed client asked
  to recommend Keel, and a client to a property's provider (first name, household, benefits only, once they agreed).
- The page for fees, incentives, potential income and invoices is called "Finances" (Ridwan renamed it from "Receivables",
  which had replaced "Money"); /receivables and /money still land there. Never call it "Money".
- Invoices to providers or landlords name the client by first name only; a council incentive claim carries the full name.
- Outlook (each person's own work Outlook, connected under My settings): Send from Outlook always asks before sending and
  records the send like the email link; only officer and council emails are ever read in, nothing else from the mailbox
  is kept; officers added from Outlook (or pasted on Councils, unless ticked as having asked, with how) are not opted in,
  so `mailingList` never emails them in bulk until they opt in or refer a client. Claude never signs in to anyone's
  Microsoft account.
- Two people use Keel: Ridwan (owner) and a co-worker. Ridwan invites people from the Supabase dashboard; Claude never
  creates accounts or enters passwords.
- Contacts was removed on request; do not bring it back unasked. Housing officers live on each client (officer_*) and,
  since Step 3, on the officer list (`officers`, the Councils page). The Pipeline's Housing officers box gathers them
  from clients, and its copies go through `mailingList` like every other officer export.
- Switching a provider off withdraws its available properties (under offer and let stay); switching it back on brings back
  only those (`provider_off` / `provider_on` property activities, `withdrawnBySwitchOff` in requests.ts). Lists pasted
  while it is off come in withdrawn.
- "Active" means still being housed (lead, referred, viewing, offer: `isActive`); moved-in clients are housed (`isHoused`).
  Leads and referrals with nothing for `coldAfterDays` (no live property, no next step booked) have gone cold: Home offers
  one tap to move them to Lost, and they are left out of "Needs a push". Home counts properties with a strong match.
- Clients who got in touch in the last 7 days carry a New badge (`isFresh`).
- On ice (0017: `iced_at`, `iced_until`, `iced_reason`; `isIced` in search.ts): a paused client is not matched, never stuck
  or cold, has no next step due, and is out of the Pipeline's active list (Progress: On ice). On the return date they come
  back by themselves with "Back from ice: check in" as their next step.
- Home shows targets (Team settings): the week as its own card of progress bars, the month and year in a card that starts
  folded. Bars show an even-pace marker and say On track or Behind pace in words, not colour alone.
- A client is dated (`created_at`) from when they got in touch (their Bin item arriving), never from when it was confirmed.
- Every card on a client's page (Notes and contact, Progress, Finances, Suitable properties, Client details, Next step,
  Timeline) folds away; the summary stays in the header and the choice is remembered per device. Each person arranges the
  cards' order (Arrange, saved as their own setting). The call log is gone from the client page: notes cover calls. Share (client header) sends their details to a landlord or agent
  on WhatsApp, by email or copied, only once they agreed; it is logged (activity kind "shared"), not counted as contact.
- Notes: each client page has Notes and contact (how you were in touch, what was said, who, when); the Pipeline shows
  last contact per client and sorts by Recently contacted.
- Stars: each person stars their own clients (personal setting `starredClients`, saved by `useStarClient`, no migration);
  starred ones sit at the top of their Pipeline under a Starred label (`starredFirst`), `?starred=1` shows only them, and
  the star is by the name on the Pipeline row and the client page (features/pipeline/Star.tsx). Each row and the client
  page say when the referral was received (`receivedAt`: nominated_at, else created_at; `receivedWords`), and the
  Pipeline sorts by Recently received. Rows carry no delete button (delete is on the client page).
- Calls are kept quiet on request: not in the top bar, not on Home, not on the client page (the /calls page still exists
  but nothing links to it); log a call as a note. Home shows next steps due instead. Do not make calls prominent again unasked.
- Finances leads with the ghost total: everything owed plus a fee for every client with a viewing booked or further
  (viewing, viewed, offered, accepted; `ghostTotal` and `potentials` in money.ts). Properties only sent or "interested" never
  count. Several clients booked to view one property each count; each client counts once (they move in once).
- Clients referred directly by a housing officer (`fromHousingOfficer`: officer details on the client) often come with a council
  incentive attached: it is owed from sign up with nothing to claim (status Due, `officerIncentiveDue` in Team settings, on sign up
  as standard; `cameWithReferral`). Other incentives are claimed (To claim, then Claim submitted) and fall due on `incentiveDue`.
  Not every officer client has one, so it is not added by itself: once placed, their Finances card asks for it.
- Nothing is owed before the client signs up. A fee or incentive with no sign-up date (added at the offer stage), or one
  still to come, waits as "Waiting for sign up" (`awaitingSignUp`): not in Owed totals, never overdue, not in targets, counted
  under Potential and with the offers in the ghost total. Moving the client in on Progress dates it from the move-in day
  (`signingUpWith`, `signUpPatch`); so does the Signed up button on the row.

## Update brief (October 2026): ground rules and decisions

Ridwan's brief "make Keel stop bad matches and bad emails before they happen", worked step by step in this order: diff live
vs repo (done: live has had 0001 to 0017), LHA table (Step 1, done: 0018), property fields (Step 2, done: 0019), officers send status (Step 3, done: 0020) plus `council_schemes`, placements and
incentives (Step 4, done: 0021), viewings (Step 5, done: 0022), matching (Step 6, done: 0023), the Mailer with its "sendable" view (Step 7, done: 0024), KPI dashboard (Step 8, done: Weekly numbers). All steps done. After each step: run it, test it, say what changed in 3 lines.
- Do not ask Ridwan to run pending migrations until he says; `supabase/checks/live-vs-repo.sql` lists what is pending.
  Live also has tables from HELM (the old name and version of Keel CRM): `leads`, `officers` (108 rows: temp, score,
  last_contact_at, prefers_sms...), `activity_log`, `notifications`, `eod_reports`, all RLS on, unused by this app.
  Officer send status (Step 3) is on `officers`; a client arriving from the Bin with their officer's email stamps
  last_nominated_client_at (or adds the officer: sending a client counts as opting in).
- One migration per step, with a rollback note at the top. Back up any existing table a migration changes into a separate
  `keel_backup` schema first (never into `public`, which the API serves). Never delete or rename columns; add new ones.
  Keep RLS; new tables get RLS on, signed-in only. Nothing is ever exposed publicly.
- Never type in or invent LHA figures: they come from the gov.uk CSV (or one Ridwan supplies), with source and start date.
- keellettings.com and the Keel Mailer (a separate browser tool) are not in this repo: do not touch them. Officer emails
  are now sent from Keel's own Mailer page; the old tool only gets a clean list to paste into its Restore box.
- Decided for matching (Step 6): the LHA rule wins for everyone (over-LHA hidden unless the warning switch is on), the
  £1,100 UC-only cap stays. Out-of-London stock is never offered to London officers by default (amber when sent).
- Money is in council incentives (£1,500 to £8,000), not fees: show expected Keel income per match, incentive-bearing first.
  Placements read amounts from `receivables` (never typed twice) and use `provider_id` for the partner.
- Focus boroughs: Harrow, Hounslow, Hillingdon, Croydon, Haringey, Islington (wish-list Sutton, Kingston).
- Response discipline (Step 5, 0022): an officer's nomination gets a first reply within 4 working hours (Mon to Fri, 9 to
  5:30, Team settings `responses`), a viewing's outcome goes back to the officer the same day. Once a viewing's time has
  passed, Progress asks how it went instead of offering the next step. Updates about an officer's own client still go to
  one who opted out of property emails; never to one who left or bounced (their mailbox, else nothing). Nominations and
  viewings older than `watchDays` (14) are not chased, and an old nomination is never stamped "replied" with today's time.

## Env vars

| Var | Where |
|---|---|
| `VITE_SUPABASE_URL` | client (.env.local + Netlify) |
| `VITE_SUPABASE_ANON_KEY` | client (.env.local + Netlify) |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify function env ONLY |
| `ANTHROPIC_API_KEY` | Netlify function env ONLY; turns on Claude reading Bin screenshots (off without it) |
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
  then 0013 (finances: fees from the rent, first-rent dates, invoice numbers), then 0014 (merge duplicate clients),
  then 0015 (move-in checklist), then 0016 (dates clients confirmed from the Bin from when the Bin received them; the
  app already does this for new ones, and the review card's "First got in touch" date can change it), then 0017 (on ice),
  then 0018 (LHA rates and postcode areas with their source), then 0019 (property kind, suits, safety papers; backs up
  properties into keel_backup first), then 0020 (officer send status, officer_sends, council_schemes; backs up officers),
  then 0021 (placements on moved-in deals: who invoices, split in writing; backs up placements, makes one per moved-in deal),
  then 0022 (viewing outcome, reason lost, outcome sent to the officer on deals; nominated_at and officer_replied_at on
  applicants; backs up deals and applicants, fills nothing in), then 0023 (postcode_area, age_band, benefit_cap on
  applicants for matching; backs up applicants), then 0024 (photo_urls on properties, property_ids and subject on
  officer_sends, for the Mailer; backs up both), then 0025 (not_ready_at and not_ready_note on properties: ready by
  default; backs up properties), then 0026 (outlook_messages: each Outlook email Keel has filed, once; a new table only),
  then 0027 (push_subscriptions, push_keys, push_log for notifications on devices; new tables only).
- Check every migration runs, twice, on a scratch Postgres before committing one:
  `npm i --no-save @electric-sql/pglite && node scripts/check-migrations.mjs` (it also tests the merge and invoice numbers).

## Checking the screen without signing in

Sign-in is invite-only and Claude must not enter passwords, so the real app cannot be opened in a preview. Use the harness:
it answers every Supabase request from sample rows in memory.

1. Copy `.harness/harness.html` to the repo root and `.harness/__harness.tsx` to `src/`. (Both are git-ignored. If
   `.harness/` is missing, it has to be rebuilt: an entry file that stubs `window.fetch` for the Supabase URL, stores a
   fake session with `access_token: 'harness'`, then renders `<App />`. No `.env.local` is needed: without one the
   app uses `placeholder.supabase.co`, which the stub answers.) Extra query options: `&missing=receivables` makes a
   table look missing, `&nocols=1` makes the 0013 and 0015 columns look missing, `&theme=dark`.
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
`public/sw.js` (registered in `main.tsx`, production only) keeps `/assets/` on the device and fetches the page
network first (3 seconds, then the kept copy); it never touches Supabase, `/api`, other sites or the Outlook sign-in page (/outlook-redirect.html).
It also shows push notifications and opens Keel at the right page when one is tapped. Bump `CACHE` if its
rules change.

## Pitfalls

- Never stop the preview with `pkill -f vite` or `pgrep -f "vite --port" | xargs kill`: the pattern matches the shell running
  the command and kills it. Use `fuser -k 5173/tcp`.
- Never put code containing backslashes in a bash heredoc: `\n` turns into a line break and `\b` into a stray control
  byte. Use the Edit and Write tools, or write a script file and run it.
- Dates must read the same everywhere: use `shortDate` / `shortDay` / `longDay` / `weekdayName` / `fullDate` / `clockTime`
  in `lib/format.ts`, never `toLocaleDateString` (browsers disagree on "Sep" and "Sept").
- Messages to providers carry a client's first name, household and benefits only: never phone, surname or anything
  medical. Sending details needs `applicants.share_with_landlords`.
- Keel's public website must never mention council incentives. Tracking them inside the CRM is fine.
