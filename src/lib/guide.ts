// In-product guidance: the Getting started list on Home (worked out from what Keel already holds, so each step ticks
// itself), What's new (each change in a sentence or two, with where to find it), and the one-time tips on each page.
// What each person has seen is kept on their device.

export interface Step { id: string; title: string; why: string; href: string; done: boolean; owner?: boolean }

export interface StepInput {
  myName: string | null;
  lhaFromGovUk: boolean;
  businessMissing: number;
  properties: number;
  officers: number;
  outlookSetUp: boolean;
  outlookConnected: boolean;
  pushOn: boolean;
  people: number;
}

/** The setting-up steps, in order; `owner` ones are for the owner to do (Team settings). */
export function gettingStarted(x: StepInput): Step[] {
  return [
    { id: 'name', title: 'Put your name in', why: 'It signs your WhatsApp messages and emails, and shows who did what.', href: '/settings#you', done: !!x.myName?.trim() },
    { id: 'lha', title: 'Load the gov.uk LHA rates', why: 'Matching and the Mailer then use the real figures, with their source and date.', href: '/settings?tab=team#lha', done: x.lhaFromGovUk, owner: true },
    { id: 'business', title: 'Add your business details', why: 'Redress, client money protection and the rest print at the foot of every Mailer email.', href: '/settings?tab=team#business', done: x.businessMissing === 0, owner: true },
    { id: 'properties', title: 'Paste your first property list', why: 'Each property then shows the clients it suits, best first.', href: '/properties', done: x.properties > 0 },
    { id: 'officers', title: 'Fill the officer list', why: 'The Mailer only ever emails officers on it who may be emailed.', href: '/councils', done: x.officers > 0 },
    { id: 'outlook', title: 'Connect your Outlook', why: 'Send from Outlook in one click, and officers\' emails come in by themselves.', href: x.outlookSetUp ? '/settings#myoutlook' : '/settings?tab=team#outlook', done: x.outlookConnected },
    { id: 'push', title: 'Turn on notifications on this device', why: 'Hear about a nomination or a viewing even when Keel is closed.', href: '/settings#notifications', done: x.pushOn },
    { id: 'team', title: 'Bring your co-worker in', why: 'Invite them from the Supabase dashboard; Keel then shows who did what.', href: '/settings?tab=people', done: x.people > 1, owner: true },
  ];
}

export interface NewThing { id: string; date: string; title: string; body: string; href?: string; where?: string }

/** Newest first. An id is never reused: what someone has seen is remembered by it. */
export const WHATS_NEW: NewThing[] = [
  { id: '2026-10-27-old-referrals', date: '2026-10-27', title: 'Old referrals sit lower', body: 'On each property\'s list, clients referred more than 60 days ago go below newer ones and show how many days old they are, unless they are a Good or Strong match. Change the 60 days in Team settings, Old referrals.', href: '/properties' },
  { id: '2026-10-27-speed', date: '2026-10-27', title: 'Faster between pages', body: 'Properties, the Pipeline and Home now open in a fraction of a second: matches are worked out once and kept, and long lists draw their first rows straight away and the rest as you scroll.' },
  { id: '2026-10-27-lists', date: '2026-10-27', title: 'Remove single properties from a saved list', body: 'In Saved lists, Choose properties opens a list so you can tick the ones to remove and keep the rest. Each property card also says when it was added.', href: '/properties', where: 'Properties, Saved lists' },
  { id: '2026-10-22-prospects', date: '2026-10-22', title: 'Easy money or hard work', body: 'Every client a property suits now shows a fit score out of 100, the chance it ends in a placement, and what that is worth. Easy money and Hard work stand out, each property names its best bet, and the list puts the most money likely first. Tap the chance to see why.', href: '/properties', where: 'Properties, and Suitable properties on each client' },
  { id: '2026-10-22-buildings', date: '2026-10-22', title: 'Turned down once, not offered again', body: 'When a client turns a place down, no other flat in that building is offered to them. Clients who need step-free are never offered an upper floor with no lift, and families are steered towards lower floors.', href: '/properties' },
  { id: '2026-10-21-pipeline-stars', date: '2026-10-21', title: 'Star clients on the Pipeline', body: 'Tap the star by a client to pin them to the top of your Pipeline; your stars are your own. Each client also shows when their referral was received, and Sort by Recently received puts the newest first.', href: '/pipeline', where: 'Pipeline, or the star on a client\'s page' },
  { id: '2026-10-20-paste-officers', date: '2026-10-20', title: 'Paste officers onto the list', body: 'Paste a spreadsheet, the To line of an email, or signatures, and Keel reads out each officer\'s name, email, phone, job title and council for you to look over and add. Anyone already on the list just gets their blanks filled in.', href: '/councils', where: 'Councils, Paste officers' },
  { id: '2026-10-20-mailer', date: '2026-10-20', title: 'A tidier Mailer', body: 'Each property is one clear row with its rent against the LHA, and writing an email goes in three steps: who it goes to, the email, and sending it.', href: '/mailer' },
  { id: '2026-10-20-notifications', date: '2026-10-20', title: 'Notifications', body: 'The bell at the top shows what needs you: replies due to officers, viewings coming up, new things in the Bin, payments overdue. New ones pop up while you work, and your phone can get them when Keel is closed.', href: '/settings#notifications', where: 'Settings, My settings, Notifications on this device' },
  { id: '2026-10-20-feel', date: '2026-10-20', title: 'A livelier Keel', body: 'Buttons give when you press them and spin while they work, folded cards open smoothly, messages slide in with a close button, and numbers count up on Home. Switched off if your device asks for less motion.' },
  { id: '2026-10-20-guide', date: '2026-10-20', title: 'Getting started and tips', body: 'Home lists the setting-up steps and ticks them off by itself, and each page has a one-time tip.' },
  { id: '2026-10-19-outlook', date: '2026-10-19', title: 'Outlook in Keel', body: 'Send Mailer emails, viewing outcomes and invoices from your own Outlook in one click. Officers\' emails come in by themselves: replies to the client\'s timeline, nominations to the Bin.', href: '/settings#myoutlook', where: 'Settings, My settings, Your Outlook' },
  { id: '2026-10-19-map', date: '2026-10-19', title: 'Housing officers on the map', body: 'Properties, Map shows a square per council with its officers; click one to see who can be emailed and their clients.', href: '/properties' },
  { id: '2026-10-19-all', date: '2026-10-19', title: 'Send all properties at once', body: 'Every property ready to send, by area, as one email, one WhatsApp or a spreadsheet.', href: '/mailer?tab=all', where: 'Properties, Send all properties' },
  { id: '2026-10-19-fold', date: '2026-10-19', title: 'Cards fold away', body: 'Fold any card from its header, and the Properties list from Cards: Folded. Keel remembers it on each device.', href: '/properties' },
  { id: '2026-10-19-hmo', date: '2026-10-19', title: 'HMO studios count as 1 beds', body: 'An HMO studio is measured against the 1 bed LHA and offered like any studio. Only HMO rooms use the shared rate.' },
  { id: '2026-10-19-whatsapp', date: '2026-10-19', title: 'More on WhatsApp', body: 'Send a client\'s matches to their officer, a Mailer alert or digest, a client to a landlord, or ask a housed client to recommend Keel.' },
];

/** The one-time tip on each page: what to know first. */
export const TIPS = {
  properties: 'Each client shows a fit score, the chance it ends in a placement and what it is worth: tap the chance for why. The list puts the most money likely first; fold the cards (Cards: Folded) to scan it quickly.',
  mailer: 'Alerts send one property to the officers whose clients it suits; Monthly digest picks the best few for a borough; All properties sends the lot. With Outlook connected, Send from Outlook does it in one click.',
  bin: 'Paste a screenshot anywhere (Ctrl or Cmd and V), drop an image here, or paste an enquiry email. With Outlook connected, officers\' nominations land here by themselves.',
  pipeline: 'Star a client to pin them to the top. Sort by Recently received for the newest referrals, or Recently contacted to see who has gone quiet.',
  client: 'Arrange, at the top, puts these cards in your own order, and each one folds away. Share sends their details to a landlord once they have agreed.',
  councils: 'Paste officers adds a whole list at once, from a spreadsheet, an email or signatures. One click marks an officer opted out or left, and every email list keeps to it.',
  finances: 'The ghost total is everything owed plus a fee for every client with a viewing booked or further on: the whole pipeline, if it all came in.',
} as const;
export type TipId = keyof typeof TIPS;
