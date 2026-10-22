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
      'On an iPhone: take the screenshot, tap it, tap Copy (or share it and choose Copy), then open Keel and tap Paste screenshot here. Tap Paste when the phone asks. From WhatsApp, press and hold a photo and choose Copy.',
      'Keel reads it, suggests which client it belongs to and waits for you to check. Nothing is saved until you confirm a card.',
      'A new client is dated from when they got in touch: when the Bin received it, not when you confirm it. If a screenshot or email is older than that, change First got in touch on the card.',
      'Once an Anthropic key is added in Netlify, Claude reads screenshots: it understands chats and forms far better than reading the letters alone. The screenshot goes to Claude (Anthropic) to be read. Without the key, or if Claude does not answer, it is read on this device as before.',
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
      'Star a client (the star by their name, here or on their page) to pin them to the top of your Pipeline. Stars are your own: your co-worker keeps theirs. Tap "starred" above the list to see only them.',
      'Each client shows when their referral or enquiry was received: the officer\'s nomination if it was dated, else when they got in touch. Sort by Recently received for the newest first.',
    ],
  },
  pipelineCalls: {
    title: 'Next step column',
    body: ['When the client\'s next step is due, and when they were last contacted and how (a note, a call or a property sent on WhatsApp). Sort by Recently contacted to see who you have been in touch with lately, or filter Next step by Never contacted.'],
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
      'The rules come first. A property shows only when its rent is within the LHA the client is paid in that LHA area (under 35s the shared rate, couples, 35 plus and anyone exempt the 1 bed rate, families by bedrooms), it is in an LHA area they want, and its kind suits them (a shared kitchen or HMO room never goes to a couple or a family). A client sent by a London housing officer never sees anything outside Greater London.',
      'What the rules hide is counted under the list. Show over LHA and Show outside London bring those back, marked in red or amber; My settings sets them for good.',
      'Each property says in one line why it fits, and what Keel could expect: the provider\'s fee and the council incentive (on Finances, or the most the council\'s scheme pays). Hover for every reason.',
      'Strong: area, size and rent all fit. Good: a solid fit, perhaps in the borough next door. Possible: a looser fit, such as a different area or no area given, so check with the client.',
      'Anything to check shows in amber. Hover over a property for every reason.',
      'Send them on WhatsApp sends the best few in one message. A tick shows what has already been sent, and by whom.',
      'For a client a housing officer referred, Send to (the officer) puts the same few in one WhatsApp to the officer, with the LHA the client is paid in each area and why each fits, asking whether to book viewings. Anything marked not ready is left out, and nothing goes to an officer who has left. It goes on the client\'s timeline and each property is tracked as sent.',
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
      'Gone cold means a lead or referral with no property in play, no next step booked and nothing moving for 30 days (Team settings). Home offers to move them all to Lost in one tap; each gets a line on their timeline, and you can set any back on their page.',
      'Active clients are the ones still being housed: lead, referred, viewing or offer. Clients who have moved in are counted as housed.',
      'Once a viewing\'s time has passed, Keel asks how it went: they viewed it, offer made, signed up, not going ahead (with why), or did not turn up (back to Interested, to rebook). Why a property was lost is kept in six groups (too far, too small, failed affordability or referencing, client dropped out, problem with the property, other) so the reasons can be counted.',
    ],
  },
  numbers: {
    title: 'Weekly numbers',
    body: [
      'How Keel is doing, a week at a time (Monday to Sunday), or a month. Everything comes from what Keel already holds: nothing here is typed in.',
      'Placements are clients who moved in, by the council that placed them (focus boroughs first, starred) and by route. Viewings per placement counts viewings that took place (no-shows left out). Why properties were lost uses the six reason groups; a client\'s other properties closing when they move in with Keel is not counted as a loss.',
      'Incentive per placement is the incentive on Finances for each placement that has one; Split in writing is how many of those have the split agreed in writing. Sign up to cash is the middle number of days from sign up to paid, for fees and incentives paid in the period.',
      'Sent within LHA is the share of properties sent in the period (to clients, or in the Mailer) whose rent was within LHA: the target is 100%. First replies and outcomes back follow the targets in Team settings.',
      'The month\'s goal (Team settings, Targets) shows placements against a range, and how many carry a council incentive, with an even-pace marker.',
    ],
  },
  mailer: {
    title: 'Mailer',
    body: [
      'Property emails to housing officers, written by Keel so nothing goes out that should not. Copy them into your email, or open them in your email app; each send is recorded against every officer it went to.',
      'Every property is ready to send unless you marked it not ready (the suppliers see to the safety checks); Keel also needs to know its LHA area and rent. One over LHA can go too: it is marked red, and the email says how far over. Held back lists the rest and what each needs. Nothing goes until the gov.uk LHA rates are loaded (Team settings, LHA rates), so an email never quotes built-in figures.',
      'Alerts: one property each, only to the officers of clients they referred that it fits. Monthly digest: one borough, 5 to 8 properties at most. Anyone who had a bulk email or digest in the last 30 days is flagged and left unticked.',
      'All properties: every property ready to send at once (or one borough\'s), by area and numbered right through, as one email to the officers on the list in Bcc, one WhatsApp, or a spreadsheet to attach. Over LHA and outside Greater London are left out until you tick them in. Choose which go takes any out. It is recorded as a full list, and counts as a bulk email for the 30 days.',
      'Officers shows who can be emailed, from the officer list on Councils: never anyone who left, is on leave, opted out, bounced or has not opted in or referred a client; a team mailbox replaces personal emails. London officers never get anything outside Greater London unless you include it, and then it is marked.',
      'Every email has the subject [Borough] | type | rent | LHA | available date, the LHA rate for the area, any safety papers recorded with their dates, up to 3 photo links, Keel\'s business details (Team settings, Business details) and a way to stop the emails. Clients are never named.',
      'Writing one goes in three steps: who it goes to (tick officers in or out), the email (subject and the whole message, to copy if you like), and sending it: Send from Outlook when it is connected, else Open in my email, or I\'ve sent it if it went another way. The old Keel Mailer\'s Restore list is under Officers.',
      'Or send it on WhatsApp gives the same message for WhatsApp, with a link for each ticked officer who has a mobile number (a team mailbox means email only), or Pick a chat or group for a WhatsApp group of officers. Each send is recorded like an email.',
    ],
  },
  responses: {
    title: 'Waiting on us',
    body: [
      'How fast Keel answers housing officers. When an officer sends a client, the first reply is due within 4 working hours (Monday to Friday, 9am to 5:30pm). Record it with Replied once you have answered them.',
      'After a viewing, the officer should hear how it went the same day. Email them from the client\'s Progress (the email is written for you, and sending it is recorded), or press Told them another way if you phoned or messaged.',
      'Updates about an officer\'s own client still go to an officer who opted out of property emails. Nothing goes to someone who has left or whose email bounced: their team mailbox if one is saved on Councils, else Keel asks you to find who has the case now.',
      'Viewings whose time has passed with nothing recorded are listed too. Anything older than 14 days drops off the list. The targets and working hours are in Team settings, under Client progress.',
    ],
  },
  arrange: {
    title: 'Arrange this page',
    body: [
      'Move the cards on a client\'s page up or down, say Timeline nearer the top. The order is yours: it is the same for every client, follows you from phone to computer, and does not change your co-worker\'s page.',
      'Any card can also be folded away by tapping its title; folding is remembered on each device.',
    ],
  },
  ice: {
    title: 'On ice',
    body: [
      'For a client who is not ready yet: they want to think about it, are waiting on a job, or asked you to come back later. While on ice they are not matched to properties, not flagged as stuck or gone cold, and are left out of the Pipeline\'s main list (find them under Progress: On ice).',
      'Give a date and they come back by themselves that day, with a next step to check in. Without a date they stay on ice until someone takes them off.',
    ],
  },
  targets: {
    title: 'Targets',
    body: [
      'How the team is doing against its targets: placements are clients who moved in during the week, month or year (Monday to Sunday for the week); fees are letting fees and incentives with a sign-up date in that time, paid or not.',
      'The marker on each bar shows where you would be if you kept an even pace. The owner sets the targets under Settings, Team rules. A target of 0 is left out.',
    ],
  },
  shareClient: {
    title: 'Share a client',
    body: [
      'Sends a short description of the client to a landlord or agent who might have something: their first name, household, benefits, the size and areas they want, their budget and council. Never their surname, phone number, email or anything medical.',
      'It only sends once the client has agreed to their details going to landlords (the same agreement requests to providers use). You can change the wording before sending. Each share goes on their timeline, but does not count as contacting the client.',
    ],
  },
  nothingShared: {
    title: 'Shared accommodation',
    body: [
      'Self-contained only means the client is never matched to anything shared: rooms, en-suite rooms and en-suite studios (an en-suite still shares a kitchen), HMO rooms, house shares, or a studio whose notes say the kitchen or bathroom is shared. Plain studios, HMO studios and flats still match.',
      'It adds "Self-contained only" to their must-haves; Fine takes it out again. If the client wrote "self-contained", "no shared house" or "own kitchen" in their own words, it is already on.',
    ],
  },
  notes: {
    title: 'Notes and contact',
    body: [
      'Keep a note each time you are in touch: pick how (a call, WhatsApp, a text, an email, in person, or just a note), write what was said, and save it. Each note is dated and signed with your name, and both of you see it here and on the timeline.',
      'The latest contact shows at the top, so you know what you last spoke to them about. Calls logged on the Calls page and properties sent on WhatsApp count as contact too. The Pipeline shows when each client was last contacted and can be sorted by it.',
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
  profile: {
    title: 'Profile',
    body: [
      'Everything Keel knows or can work out about a client, put together to say where they can be placed. Each answer says where it came from: recorded on the form, read from their message, or worked out.',
      'Needed for matching lists what is still missing: the postcode area they want, their age band, who is moving in, UC, the benefit cap, and PIP or LCWRA. Until those are in, matches are a best guess.',
      'Who is moving in comes from the form, or from what they wrote: someone writing as one person who only asks for a studio or a 1 bed reads as a single adult. Their age comes from their date of birth, or an age they gave.',
      'The rate they are paid: families by the bedrooms their children need; couples, people 35 or over, and under-35s exempt from the shared rate, the 1 bed rate; other under-35s, the shared accommodation rate. PIP exempts them outright, whatever their age: never the shared rate, no benefit cap and no limit for UC alone. LCWRA lifts the benefit cap and that limit too. Other possible exemptions (leaving care, a hostel stay, MAPPA, domestic abuse) are pointed out to check, never assumed.',
      'Where to place them: the LHA areas of the available properties that match them, counting those whose rent is within the LHA they would be paid there. Focus boroughs are starred. Ask next lists the answers that would change where they can go.',
      'Fill them in applies only the answers Keel is sure of from their notes, and never changes an answer already given. Every change goes on their timeline.',
    ],
  },
  councils: {
    title: 'Councils',
    body: [
      'Officers: your housing officer list. Each officer is active, left, on leave, opted out or bounced. Mark as opted out and Mark as left are one click; More has on leave (until a day), bounced, the route, a shared mailbox and how they came to be on the list.',
      'The mailing list leaves out everyone who has left, is on leave, opted out or bounced, and any housing officer who has not opted in or sent you a client. When a shared mailbox is set (rental.alert@islington.gov.uk, say), that is the only address used. Every list Keel copies for officers follows this rule.',
      'Record a bulk email after you send one: Keel keeps who was sent what and when, and warns when someone would get a second bulk email or digest inside 30 days.',
      'The boxes at the top are the list\'s health: who can be emailed, who has not opted in, bounces, leavers, leave, opt-outs, and anyone sent to twice in 30 days. Tap one to see who.',
      'Schemes: each council\'s procurement or landlord scheme, registered once per council, with its route mailbox, incentive terms, the most it pays and the documents it wants. Focus boroughs (Team settings) come first, marked with a star.',
    ],
  },
  pasteOfficers: {
    title: 'Paste officers',
    body: [
      'Paste housing officers in however you have them: a spreadsheet copied with its headings (Name, Email, Council, Phone, Job title), the To or Cc line of an email, email signatures one after another, or one officer a line.',
      'Keel reads each one into a name, email, phone, job title and council (from what you pasted, else from a .gov.uk address), and shows them for you to look over first. Edit fixes a name, council or route; untick anyone you do not want.',
      'Anyone already on the list (the same email or phone) is not added twice: if the paste has their phone or job title and the list does not, Keel fills in just those blanks and changes nothing else.',
      'Housing officers are added as not opted in, so the Mailer never emails them until they opt in or refer a client. Tick They asked for property emails only when they did, and say how. A team mailbox for properties (lettings@, rental.alert@ and the like) can be written to straight away.',
      'Pasted a list of officers into the Bin by mistake? The Bin offers to bring it here.',
    ],
  },
  prospects: {
    title: 'Fit, chance and money',
    body: [
      'Every client a property suits shows three things. Fit: how well they match, out of 100 (area, size, rent against their LHA, needs such as a ground floor, and priority). The chance it ends in a placement. And what that is worth: the fee and incentive it could bring, times the chance.',
      'Easy money means likely (55% or more) and worth at least £1,000. Hard work means under 20%. Tap the chance to see why: what moved it up (a strong fit, room under their LHA, a housing officer referral, a viewing booked, recent contact) and down (details missing, places turned down, missed viewings, an offer elsewhere, over LHA).',
      'The chance starts from Keel\'s own record: of the properties sent that have ended, how many became a placement. Until there are enough of those it starts at about 20%, and it sharpens as more deals end. A provider whose properties often (or rarely) place moves it too.',
      'Each property shows its best bet, and the list puts the most money likely first (Order, in the filters). A client who turned a place down is never offered another flat in the same building, and someone who needs step-free is never offered an upper floor with no lift.',
    ],
  },
  propertyChecks: {
    title: 'Ready to send?',
    body: [
      'Each property shows its BRMA, the monthly LHA rate for its size, and the gap: the rent minus that rate. An HMO room is measured against the shared rate; an HMO studio is a studio, so the 1 bed rate.',
      'Red: the rent is at least £1 above LHA, so a client on benefits would have a shortfall to make up. It shows in red everywhere; clients only see it with Show over LHA on.',
      'Every property is ready to send as standard: the suppliers make sure their safety checks are done. Mark not ready holds one back, with your reason, until you mark it ready again.',
      'Amber: a property outside Greater London (not offered to London councils by default), or safety papers you recorded that have run out or an EPC below E (worth a word with the supplier). Amber is a warning, not a stop.',
      'Grey: marked not ready by hand, the only thing that stops a property going out. Red (at least £1 over LHA) can still be sent from the Mailer, marked red; clients are only offered it with Show over LHA on.',
      'Papers and photos are optional: fill them in with Edit on the property card, under Letting details and safety papers, and the Mailer prints their dates. Who it suits: UC 35 plus, SAR-exempt, under 35 standard, couples, families. Every change goes on the property\'s history.',
    ],
  },
  lha: {
    title: 'LHA check',
    body: [
      'Compares the rent with the Local Housing Allowance for the property\'s size in its area (Broad Rental Market Area), using the rates in Team settings.',
      'The owner loads the rates from the gov.uk CSV, with the page it came from and the day they apply from; weekly figures become the monthly Universal Credit amount (× 52 ÷ 12). Until then Keel uses built-in rates that are not checked against gov.uk, and says so next to every rate.',
      'A rent written as "1-Bed LHA" is shown as the pounds it means for that property\'s area, never as the label.',
      'Studios (HMO studios too) and en-suite rooms count as 1 bed. Other rooms, HMO rooms among them, use the shared rate. LHA stops at 4 bed. A rent written as "1-Bed LHA" counts as exactly that rate.',
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
      'Housing officers (tick the box) show as squares, one per council, with how many officers work there: dark when at least one can be emailed under the mailing list rules, light when none can. Click a square for its officers, how each stands, the clients they referred and how to reach them. A council sits at the middle of its postcode districts; one outside London is found by its name. Officers named only on clients show as not on the officer list.',
      'Postcodes are placed using postcodes.io, a free public lookup; only property postcodes, postcode districts and council names are sent, never anything about a client or an officer. The map is from OpenStreetMap.',
    ],
  },
  money: {
    title: 'Finances',
    body: [
      'What Keel is owed and what could come in. Owed is every letting fee and council incentive still to come in, soonest due first; anything past its due date is flagged overdue. Potential is fees from clients with a viewing booked or further. Paid is what has come in.',
      'When a client is marked as moved in on their Progress, the letting fee is added by itself: from the property\'s provider (Watermint, Zuber...) at their usual fee, or from the landlord. Add an incentive from the client\'s page if the council pays one.',
      'An incentive that came with a housing officer\'s referral is owed from sign up, with nothing to claim: Keel sets that up for clients who came through a housing officer, and asks for it once they are placed. Any other incentive is claimed from the council and falls due on the rule in Settings. Change which it is with How it is paid when you edit it.',
      'Placements: every client who has moved in is a placement. Councils pay whoever is on the paperwork, so each one records who invoices the council, whether the split with the partner is agreed in writing (with a link to the agreement), Keel\'s share and the day the tenant was given the Renters\' Rights information sheet. Amounts, invoices and payments are read from the fees and incentives here, never typed twice. An incentive with no split in writing is flagged red.',
      'Anything added before the client has signed up (an incentive at the offer, say) has no sign-up date yet and waits as Waiting for sign up: it is not counted as owed and never shows as overdue, though it is in the ghost total with the offers. When they are marked as moved in on Progress, or you tap Signed up, it is dated and falls due.',
      'An amount can be typed in, or worked out from the property\'s rent: a percentage of a month\'s rent, or a number of weeks\' rent (a week is the monthly rent times 12, divided by 52). Change the rent if the listing was wrong.',
      'The due date is worked out from the sign-up date: the provider\'s own rule if it has one (say 1 month after sign up), otherwise the standard in Team settings. Some providers only pay once the client\'s first month\'s rent is in: those fees wait for it, with the date it is expected on the calendar. Press First rent paid when it arrives and the fee falls due. You can change any date by hand.',
      'Letting fees go Due, Chased, Paid. Incentives go To claim, Claim submitted, Chased, Paid (or Declined). Chase opens WhatsApp to the provider with the message written; Paid takes it off the list. Each step is on the client\'s timeline.',
    ],
  },
  accountant: {
    title: 'For your accountant',
    body: [
      'Downloads every letting fee and incentive in the period as a spreadsheet that Excel or Numbers opens: date, invoice number, type, who pays, client, property, amount, status, paid, due and signed-up dates, and how the fee was worked out. Totals paid and still owed are underneath.',
      'Each fee falls in a period by the day it was paid, or if not yet paid, the day it is due. Tax years run 6 April to 5 April.',
    ],
  },
  potential: {
    title: 'Potential',
    body: [
      'Letting fees that could come in from clients with a viewing booked, viewed, an offer made or accepted. Offers made and accepted are counted as likely. Properties only sent, or clients only interested, do not count.',
      'Several clients can be booked to view the same property, and each of them counts. Each client is counted once, at the property they have got furthest with, as they only move in once. Clients who have moved in are on Owed instead.',
      'The fee is the provider\'s usual fee from Settings, Providers, worked out from the rent if they pay a percentage or weeks of rent. Fees from landlords, or from providers with no usual fee, show as not known.',
    ],
  },
  ghost: {
    title: 'Ghost total',
    body: [
      'The size of the whole pipeline as one number: everything still owed, plus a fee for every client with a viewing booked or further (viewed, an offer made or accepted). Properties only sent do not count. It is what would come in if every one of them came good, so it is a ghost, not money in the bank. Paid money is not in it.',
      'The bar shows what it is made of, from solid to faint: owed (clients who have moved in), offers made or accepted, then viewings.',
      'Several clients booked to view the same property each count. Each client counts once, at the property they have got furthest with. Fees are the provider\'s usual fee, worked out from the rent where they pay that way; fees nobody can work out yet (a landlord, or no rent) are counted as not known.',
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
  duplicates: {
    title: 'Possible duplicates',
    body: [
      'Clients who look like the same person entered twice: the same phone number (07700 900123 and +44 7700 900123 count as the same), the same email, or the same name in any order. A shared phone or email is almost certainly one person; a shared name is only a question, as two people can have the same name.',
      'Merge keeps the record you pick (Keel suggests the one furthest along) and moves everything from the other onto it: calls, properties and their progress, fees and incentives, requests to providers and the timeline. Details the kept record is missing are filled in, notes are joined, and the other record is deleted. It cannot be undone.',
      'A phone number or email on more than three clients is taken to be shared (a support worker\'s, or an office line) and is left out.',
      'Not the same person hides the pair on this device.',
    ],
  },
  summary: {
    title: 'Today',
    body: [
      'Today in a few lines: viewings, next steps due, providers to chase, money overdue or due this week, first rents to check, move-in checks still open, and who has stopped moving. Tap a line to open the list behind it.',
      'Send to WhatsApp opens WhatsApp with the summary written out: pick your own chat (Message yourself) or your co-worker\'s. It carries first names and short addresses only, never phone numbers.',
    ],
  },
  checklist: {
    title: 'Move-in checklist',
    body: [
      'Once an offer is accepted, each property shows the checks to tick off before and at the move-in: right to rent, the tenancy signed, the deposit protected, the gas safety certificate, EPC and electrical report given, and so on. Each tick is dated and goes on the client\'s timeline, so you can show it was done.',
      'The list is the same for every move-in. The owner can change it under Settings, Team rules: one check per line.',
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
  notifications: {
    title: 'Notifications',
    body: [
      'The bell at the top shows what needs you, worked out by the same rules as Home: something new in the Bin, a nomination waiting on its first reply (with its 4 working hours), a viewing in the next 3 hours, how a viewing went and telling the officer, next steps due, payments overdue, officers\' emails from Outlook, and clients back from ice. Urgent ones come first. Something new pops up at the top right while you are in Keel.',
      'Marking one read (opening it, or Mark all as read) is remembered on this device. Anything new, like another item in the Bin or a viewing moved, comes back unread.',
      'Notifications on this device (Settings, My settings) send the same to your phone or computer when Keel is closed: something new in the Bin, a reply waiting, a viewing within the hour, officers\' emails, and a short summary each working morning. Each is sent once. Turn them on for each device you use; on an iPhone, open Keel from your Home Screen first.',
      'They carry first names and short addresses only, as they can show on a locked screen.',
    ],
  },
  outlook: {
    title: 'Outlook',
    body: [
      'Connect your work Outlook under Settings, My settings: you sign in with Microsoft in Microsoft\'s own window, and Keel never sees your password. Each of you connects your own; it stays connected on that device until you disconnect.',
      'Send from Outlook: the Mailer, officer replies and outcomes, and invoices get a Send from Outlook button. It asks first, then sends from your mailbox (kept in your Sent Items) and records the send, just like the email links. Several officers go in Bcc with you in To.',
      'Officer emails come in by themselves while Keel is open (every 5 minutes, or Check Outlook now): only emails from officers on the list, officers named on clients, or council (.gov.uk) addresses, never anything else in your mailbox. One about a client (from their officer, or naming them) goes on that client\'s timeline. A nomination goes to the Bin to review, dated from when it arrived. Any other officer email waits on the Bin for you to send to the Bin, file on a client, or ignore.',
      'Officers from your Outlook (Councils): finds the council officers you emailed, or who emailed you, over the last year (addresses and dates only) and adds the ones you tick to the officer list. They are added as not opted in, so they are never sent property emails until they opt in or refer a client.',
      'The owner sets Outlook up once in Team settings, Outlook, by registering Keel in Microsoft Entra (the steps are on that card).',
    ],
  },
  whatsapp: {
    title: 'Sending on WhatsApp',
    body: [
      'The chat button next to a client opens WhatsApp with the property typed in, ready to send to them. Share on a property lets you pick anyone, such as a landlord or a group.',
      'Landlord, next to a client on a property, sends that client to the property\'s provider ("Salam ..."): first name, household, benefits and council only, never a surname, phone number or anything medical. It only works once the client agreed to their details going to landlords.',
      'Once a client has moved in, their Progress card can ask them to recommend Keel: a message for them to forward to friends who need a home, with Keel\'s WhatsApp link (the phone under Invoices) and website (Business details). It counts as contact.',
      'Nothing is sent until you press send in WhatsApp. Every send goes on the client\'s timeline, so you can both see who has been sent what.',
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
      'The same rules as a client\'s Suitable properties decide who can be offered it (their LHA, their area, the kind of place). Clients whose council pays an incentive come first, looser fits last; each line says why they fit and what Keel could expect.',
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
