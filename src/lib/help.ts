// Words behind the small "?" help buttons. Kept in one place so the
// explanations stay consistent and are easy to update. Plain British English.

export interface HelpEntry { title: string; body: string[] }

export const HELP = {
  home: {
    title: 'Home',
    body: [
      'The team\'s day at a glance: active clients, available properties, what is owed and the ghost total, this week\'s viewings, next steps due, how clients split across tiers, the pipeline and the latest activity.',
      'Click any tile, chart or row to open the list behind it.',
    ],
  },
  bin: {
    title: 'The Bin',
    body: [
      'Where new information comes in. Paste a screenshot anywhere with Ctrl+V, drop an image here, or paste a website enquiry email.',
      'Keel reads it, suggests which client it belongs to and waits for you to check. Nothing is saved until you confirm a card.',
      'Referrals from the website form arrive here on their own. Confirm all saves every card exactly as shown, including your edits.',
    ],
  },
  binChoice: {
    title: 'What should happen?',
    body: [
      'Update: adds this to an existing client Keel thinks is the same person. It shows why, for example a phone number match.',
      'Create new client: starts a new record with the details on the left.',
      'Just log a note: changes no client. The note is kept in full under Notes, lower down the Bin page, where you can search it and later make a client from it or add it to one.',
    ],
  },
  binNotes: {
    title: 'Notes',
    body: [
      'Everything filed with Just log a note, newest first, with the full text that was pasted or read from the screenshot.',
      'Search finds a name, phone number or area in any note. Open a note to read it all.',
      'Make a client from it, or add it to one: sends the note back to the review list at the top of the Bin, where you can choose Create new client or Update.',
    ],
  },
  pipeline: {
    title: 'Pipeline',
    body: [
      'Every client in one table. Search by name, phone, area or anything in their notes. Put words in quotes to match a phrase, like "north finchley".',
      'Filters add up: UC plus Tier 1 plus "Due a call now" shows only clients who are all three. Assigned lets you see just your own clients.',
      'Click a column heading to sort. Your search is kept in the web address, so you can bookmark it or send it to each other.',
    ],
  },
  pipelineCalls: {
    title: 'Next step column',
    body: ['When the client\'s next step is due, and the outcome of the last call (if any) with how long ago it was.'],
  },
  tiers: {
    title: 'Tiers',
    body: [
      'Tier 1 is the highest priority. Tiers are worked out from each client\'s answers using the tier logic in Team settings, which only the owner can change.',
      'Tiers are checked from the top: a client gets the first tier whose conditions they meet, and the last tier is everyone else. Tiers can be added, renamed, reordered or removed, and each can test any answer (household, benefits, work, council, urgency, children, budget and more).',
      'A tier set by hand on a client is locked, so a change to the logic never moves that client.',
    ],
  },
  urgent: {
    title: 'Urgent',
    body: [
      'Clients whose situation is urgent get a dark Urgent tag, go to the top of lists and rank higher for properties.',
      'Which answers count as urgent (for example homeless tonight) is set in Team settings.',
    ],
  },
  calls: {
    title: 'Calls',
    body: [
      'The calls list: follow-ups due today or earlier, plus new clients nobody has called yet. It is out of the top bar; open it from Calls list on a client\'s Next step card.',
      'Logging a call records the outcome and books the next call, so the client leaves the list until then.',
      'Use Mine to see only clients assigned to you, or Unassigned to pick up new ones. Each call shows who made it.',
    ],
  },
  logCall: {
    title: 'Logging a call',
    body: [
      'Choose who called whom, tap the outcome, add a note and pick when to call again.',
      'The follow-up is suggested for you: after no answer and after a good call. Set your own gaps in My settings.',
      'The call goes on the client\'s timeline with your name, so your co-worker can see it.',
    ],
  },
  nextCall: {
    title: 'Next step',
    body: [
      'What to do next for this client and when: Call, Chase documents, Book a viewing. Leave it blank to mean a call.',
      'On the day, they appear in Next steps due on Home for both of you, with the step written next to their name.',
      'Keel sets it for you as things move: logging a call sets the follow-up, booking a viewing sets the viewing day, an offer sets a chase two days later. It only replaces your own step if its date is sooner.',
    ],
  },
  assign: {
    title: 'Assigned to',
    body: [
      'Who is looking after this client. It does not hide the client from anyone.',
      'It lets each of you filter to your own clients with Mine on the Calls page and Assigned on the Pipeline.',
    ],
  },
  suitable: {
    title: 'Suitable properties',
    body: [
      'Available properties this client could suit, from your saved property lists. Only the best few show at first; Show all lists the rest.',
      'Strong: area, size and rent all fit. Good: a solid fit, perhaps in the borough next door. Possible: a looser fit, such as a different area or no area given, so check with the client.',
      'Anything to check shows in amber. Hover over a property for every reason.',
      'Send them on WhatsApp sends the best few in one message. A tick shows what has already been sent, and by whom.',
    ],
  },
  clientDetails: {
    title: 'Client details',
    body: [
      'Everything about the client in one place. Change any box and it saves when you click away (or press Enter); there is no separate edit mode.',
      'The tier updates on its own as the answers change. Click a tier to set it by hand, which locks it; Use the logic unlocks it.',
      'Every change goes on the timeline with the name of whoever made it.',
    ],
  },
  readNotes: {
    title: 'Found in their notes',
    body: [
      'Some clients write everything in the message box instead of the form. Keel reads what they wrote and suggests answers for the form.',
      'Each suggestion shows the words it came from and an accuracy rating: High (80% or more) is usually right, Medium is worth a quick check, Low is a guess.',
      'Nothing changes until you click Use this. Fill in all High only applies the High ones. Not right hides a suggestion.',
    ],
  },
  stage: {
    title: 'Stage',
    body: [
      'Where the client is: lead, referred, viewing, offer or placed, or lost.',
      'Moving a client back a stage asks you to confirm first. Every move goes on the timeline.',
    ],
  },
  progress: {
    title: 'Progress',
    body: [
      'Each property the client is going for, and how far it has got: sent, interested, viewing booked, viewed, offer made, accepted, moved in. Sending a property on WhatsApp adds it; Add a property adds one by hand.',
      'The client\'s stage follows their furthest property, forwards only: a viewing booked makes them Viewing, an offer makes them Offer, a move-in makes them Placed. You can still change the stage by hand in Client details.',
      'When an offer is accepted the property goes under offer; when they move in it is marked as let, and anyone else going for it is told it was let to someone else.',
      'Stuck means nothing has moved for longer than Team settings allow at that stage. A viewing coming up always counts as moving.',
    ],
  },
  timeline: {
    title: 'Timeline',
    body: ['Everything that has happened with this client, newest first, and who did it. Website referrals show no name because they arrived on their own.'],
  },
  properties: {
    title: 'Properties',
    body: [
      'Paste a list of available properties (a WhatsApp message, an email or rows from a spreadsheet). Keel reads each one and matches it to your clients.',
      'Lists are saved to the account, so you both see them on every device. Mark a property as let when it goes, or purge old lists under Saved lists.',
    ],
  },
  lha: {
    title: 'LHA check',
    body: [
      'Compares the rent with the Local Housing Allowance for the property\'s size in its area (Broad Rental Market Area), using the rates loaded in Team settings.',
      'Studios and en-suite rooms count as 1 bed. Other rooms use the shared rate. LHA stops at 4 bed. A rent written as "1-Bed LHA" counts as exactly that rate.',
      'The area is estimated from the postcode, which is usually right but not always. Check an address on the VOA\'s LHA Direct and use Change area if it differs; the owner can apply it to every property in that postcode district.',
      'When matching, clients on UC or housing benefit with no budget are judged on their own LHA: 1 bed for singles and couples, and by bedrooms needed for families.',
      'To look up a postcode, type it (NW11, or HA8 7AB) or a place (Golders Green) in the search box, or in LHA rates in Team settings. It shows where it is, its LHA area and the rates.',
      'Area lists show London and the home counties. Pick Show the rest of England for anywhere else.',
    ],
  },
  map: {
    title: 'Map',
    body: [
      'Every property in the list, placed by its postcode. Filters above still apply. Click a pin for the property and its best clients.',
      'Type a client\'s name to shade the places they asked for (darker) and the wider borough or region (lighter), and to colour each pin by how well it fits them. "Somewhere central" counts as central London.',
      'Postcodes are placed using postcodes.io, a free public lookup; only property postcodes are sent, never anything about a client. The map is from OpenStreetMap.',
    ],
  },
  money: {
    title: 'Finances',
    body: [
      'What Keel is owed and what could come in. Owed is every letting fee and council incentive still to come in, soonest due first; anything past its due date is flagged overdue. Potential is fees from clients going for a property. Paid is what has come in.',
      'When a client is marked as moved in on their Progress, the letting fee is added by itself: from the property\'s provider (Watermint, Zuber...) at their usual fee, or from the landlord. Add an incentive from the client\'s page if the council pays one.',
      'An amount can be typed in, or worked out from the property\'s rent: a percentage of a month\'s rent, or a number of weeks\' rent (a week is the monthly rent times 12, divided by 52). Change the rent if the listing was wrong.',
      'The due date is worked out from the sign-up date: the provider\'s own rule if it has one (say 1 month after sign up), otherwise the standard in Team settings. Some providers only pay once the client\'s first month\'s rent is in: those fees wait for it, with the date it is expected on the calendar. Press First rent paid when it arrives and the fee falls due. You can change any date by hand.',
      'Letting fees go Due, Chased, Paid. Incentives go To claim, Claim submitted, Chased, Paid (or Declined). Chase opens WhatsApp to the provider with the message written; Paid takes it off the list. Each step is on the client\'s timeline.',
    ],
  },
  potential: {
    title: 'Potential',
    body: [
      'Letting fees that could come in from clients going for a property: a viewing booked, viewed, an offer made or accepted. Offers made and accepted are counted as likely. Properties only sent, or clients only interested, are listed as early: they count in the ghost total but not in Potential.',
      'Each client is counted once, at the property they have got furthest with, and each property once, as it can only be let once. Clients who have moved in are on Owed instead.',
      'The fee is the provider\'s usual fee from Settings, Providers, worked out from the rent if they pay a percentage or weeks of rent. Fees from landlords, or from providers with no usual fee, show as not known.',
    ],
  },
  ghost: {
    title: 'Ghost total',
    body: [
      'The size of the whole pipeline as one number: everything still owed, plus a fee for every client going for a property, from a property just sent to an offer accepted. It is what would come in if every one of them came good, so it is a ghost, not money in the bank. Paid money is not in it.',
      'The bar shows what it is made of, from solid to faint: owed (clients who have moved in), offers made or accepted, viewings, then properties only sent or clients only interested.',
      'Each client counts once, at the property they have got furthest with, and each property once. Fees are the provider\'s usual fee, worked out from the rent where they pay that way; fees nobody can work out yet (a landlord, or no rent) are counted as not known, and clients with no property yet are not in it.',
    ],
  },
  moneyCalendar: {
    title: 'Calendar',
    body: [
      'Every date that matters for money: when each fee or incentive is due, when a client\'s first month\'s rent is expected (for providers who pay after it), and when money came in. Pick a day to see what is on it.',
      'Add to my calendar saves a calendar file. Open it on your phone and it goes into your own calendar (Apple, Google or Outlook) with a reminder at 9am on the day. Dates change as things move, so add them again after big changes.',
    ],
  },
  invoices: {
    title: 'Invoices',
    body: [
      'Raise invoice gives a fee or incentive the next invoice number and today\'s date, and keeps it with the fee. The number comes from the database, so two of you can never get the same one.',
      'Print or save as PDF opens your browser\'s print window: choose Save as PDF to keep a copy or attach it to an email. Send on WhatsApp writes the message with the amount, due date and bank details; the PDF is attached by hand.',
      'An invoice to a provider or landlord names the client by first name only. An incentive claim to a council carries their full name, so the council can match it.',
      'Keel\'s address, bank details and VAT number come from Team settings, Invoices; only the owner can change them.',
    ],
  },
  requests: {
    title: 'Requests to providers',
    body: [
      'Ask the provider of a property to check it is available, book a viewing (offer up to 3 times), or send a client\'s details. Keel writes the message; Open in WhatsApp opens a chat with the provider with it typed in, and nothing is sent until you press send.',
      'Messages only ever carry a client\'s first name, household and benefits: never their phone, surname or anything medical. Several clients go in one message, one line each.',
      'If a client does not meet the provider\'s rules (say they need PIP or LCWRA), Keel warns you. You can still send it with a reason, which is kept on the client\'s timeline.',
      'Sending details needs the client to have agreed: OK to share with landlords, in their details. Checking availability does not.',
      'Every request is logged. If the provider has not replied in time (24 hours as standard, set in Team settings) it moves to the top of Awaiting providers on Home, with one tap to confirm, decline or chase.',
      'If a booked viewing moves or is cancelled, use Move or cancel on the client\'s Progress (or the calendar button on Home). Keel saves it, then writes the message for the client and for the provider.',
    ],
  },
  officers: {
    title: 'Housing officers',
    body: [
      'Every housing officer named on a client\'s details, once each. Keel joins the same person across referrals by their email, then their phone, then their name, and fills in whatever one referral missed.',
      'Copy emails puts them all on the clipboard, ready to paste into the To or Bcc box of an email (semicolons between, which Outlook, Gmail and Apple Mail all take). Email them (Bcc) opens a new email with them all in Bcc, so they cannot see each other.',
      'Copy details as text gives a block per officer (name, council, email, phone) for the body of an email or a note. Search, the council choice and Only with active clients narrow what is copied.',
      'Where they work comes from their email address. To correct an officer\'s details, change them on their client\'s page.',
    ],
  },
  providers: {
    title: 'Providers',
    body: [
      'Who supplies your properties, by the tag on their stock lists (BP, SR, ZUB...). Properties from a list with that tag belong to them.',
      'Rules are what they will take: benefits (any of those ticked), household, the councils they take clients from, a maximum rent and furnished or not. Requests warn you when a client does not fit.',
      'Switching a provider off keeps their history but stops new requests, and withdraws their available properties so they stop matching and cannot be sent (ones under offer or let are left alone). A list of theirs pasted while they are off comes in withdrawn. Switching them back on brings back the properties that switching off withdrew, but not ones you withdrew by hand. Only the owner can change providers.',
      'A property belongs to the provider whose tag is on its list. To change it, pick the provider on the property card, or tick several properties and use Set provider. The Provider filter on Properties shows who supplies what.',
      'Letting fee they pay Keel: a set amount, a percentage of a month\'s rent, or weeks of rent (say 1 week\'s rent). When their fee is due counts from sign up, or from when the client\'s first month\'s rent is paid if they only pay after it.',
    ],
  },
  whatsapp: {
    title: 'Sending on WhatsApp',
    body: [
      'The chat button next to a client opens WhatsApp with the property typed in, ready to send to them. Share on a property lets you pick anyone, such as a landlord or a group.',
      'Nothing is sent until you press send in WhatsApp. Sending to a client goes on their timeline, so you can both see who has been sent what.',
      'The owner sets the wording in Team settings.',
    ],
  },
  savedLists: {
    title: 'Saved lists',
    body: ['Each paste is kept as a list with the date and where it came from. Purging a list removes it for everyone.'],
  },
  matchStrength: {
    title: 'Matching clients',
    body: [
      'Each property shows only its best few clients: every Strong one, topped up with Good ones, or the top two Possible ones when nothing fits better. Show all lists everyone.',
      'Strong: area, size and rent all fit. Good: a solid fit, perhaps in the borough next door. Possible: a looser fit, so check with the client first.',
      'Anything to check shows in amber. Hover over a client for every reason.',
      'Properties over the premium rent in Team settings are always offered to clients on PIP or in full-time work.',
      'A client on UC alone (no PIP or LCWRA, not working) is never matched above the limit in Team settings, £1,100 as standard: they cannot afford it.',
    ],
  },
  mySettings: {
    title: 'My settings',
    body: ['These only change Keel for you. Your co-worker keeps their own.'],
  },
  teamSettings: {
    title: 'Team settings',
    body: [
      'These rules apply to everyone. Changing them updates tiers, urgent flags and property matches for all of you straight away.',
      'Only the owner can change them. Everyone else can see them.',
    ],
  },
  team: {
    title: 'Team',
    body: [
      'Everyone who can sign in to Keel. Names come from each person\'s My settings.',
      'Only people you invite can sign in. To add someone, open your Supabase project, go to Authentication, then Users, and choose Invite user.',
    ],
  },
} satisfies Record<string, HelpEntry>;

export type HelpTopic = keyof typeof HELP;
