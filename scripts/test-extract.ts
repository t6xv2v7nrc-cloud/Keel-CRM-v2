import { extractFromText } from '../src/lib/extract';

const samples: Array<{ name: string; hint?: string; text: string }> = [
  {
    name: 'WhatsApp referral from an officer',
    hint: 'from Debby, Harrow',
    text: `Hi, hope you're well. I've got a referral for you.
Name: Lubna Hassan
Phone: 07700 900801
She's on Universal Credit, single, looking for a studio or HMO room in Harrow.
Budget is around £1,100 pcm. Let me know if you can help. Thanks, Debby`,
  },
  {
    name: 'Fee confirmation',
    text: `Dear Keel Lettings, we confirm the finder's fee of £1,200 for the placement
of Samuel Mensah at 22 Pinner Road, HA1 4HZ. Incentive £500. Payment to follow.`,
  },
  {
    name: 'Property details',
    text: `Studio flat to let. 14 Bruce Grove, N17 6RA, Haringey.
Rent £950 pcm. Available from next month. DSS accepted, EPC rating D.`,
  },
];

for (const s of samples) {
  console.log('\n━━━', s.name, '━━━');
  const ex = extractFromText(s.text, s.hint);
  console.log('doc_type   :', ex.doc_type, `(${Math.round(ex.confidence * 100)}%)`);
  console.log('summary    :', ex.summary);
  if (ex.applicant) console.log('applicant  :', JSON.stringify(ex.applicant));
  if (ex.property) console.log('property   :', JSON.stringify(ex.property));
  if (ex.contact) console.log('contact    :', JSON.stringify(ex.contact));
  if (ex.money) console.log('money      :', JSON.stringify(ex.money));
  console.log('actions    :', ex.suggested_actions?.join(', '));
}
