import { parseEnquiryEmail } from '../src/lib/parseEnquiry';

const omar = `First Name:
Omar

Last Name:
Mohamed

Email:
omar.y.mohamed@hotmail.com

Phone:
07922538452

Enquiry Type:
Other

Message:
Good afternoon.
I would like to rent a 2-3 bedroom . It's me and my 3 daughters. My budget is 1400-1800 and to be furnished or partly furnished.

King regards,
Omar`;

// Also test the inline "Label: value" layout (single-line)
const inline = `First Name: Leon
Last Name: Carter
Email: leon@example.com
Phone: 07700900123
Enquiry Type: DSS
Message: Looking for a 1 bed studio, UC, budget £900-1100.`;

for (const [name, text] of [['Omar (multiline)', omar], ['Leon (inline)', inline]] as const) {
  console.log('\n━━━', name, '━━━');
  const ex = parseEnquiryEmail(text);
  if (!ex) { console.log('  (no enquiry detected)'); continue; }
  console.log('summary   :', ex.summary);
  console.log('applicant :', JSON.stringify(ex.applicant, null, 0));
}
