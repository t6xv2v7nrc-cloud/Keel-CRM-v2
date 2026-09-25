// Words behind the small "?" help buttons. Kept in one place so the
// explanations stay consistent and are easy to update. Plain British English.

export interface HelpEntry { title: string; body: string[] }

export const HELP = {
  home: {
    title: 'Home',
    body: [
      'The team\'s day at a glance: who needs a call, how active clients split across tiers, calls made in the last 14 days, the pipeline and the latest activity.',
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
      'Just log a note: keeps a record without changing any client.',
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
    title: 'Calls column',
    body: ['The next call booked (or "Not called yet" for new clients), and the outcome of the last call with how long ago it was.'],
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
      'Keeps track of who to ring. To call now lists follow-ups due today or earlier, plus new clients nobody has called yet.',
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
    title: 'Next call',
    body: [
      'When this client should be rung next. On the day, they appear in To call now for both of you.',
      'Logging a call sets this for you. You can also change or clear it here without logging a call.',
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
    body: ['Where the client is: lead, referred, viewing, offer or placed. Change it with Stage in Client details, or from the Pipeline.'],
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
