// London geography for matching: postcode districts and well-known
// neighbourhoods mapped to their (main) borough. Where a district or place
// spans boroughs, the borough covering most of it is used.

export const BOROUGHS = [
  'Barking & Dagenham', 'Barnet', 'Bexley', 'Brent', 'Bromley', 'Camden', 'City of London', 'Croydon',
  'Ealing', 'Enfield', 'Greenwich', 'Hackney', 'Hammersmith & Fulham', 'Haringey', 'Harrow', 'Havering',
  'Hillingdon', 'Hounslow', 'Islington', 'Kensington & Chelsea', 'Kingston upon Thames', 'Lambeth',
  'Lewisham', 'Merton', 'Newham', 'Redbridge', 'Richmond upon Thames', 'Southwark', 'Sutton',
  'Tower Hamlets', 'Waltham Forest', 'Wandsworth', 'Westminster',
  // just outside London, seen in partner stock lists
  'Hertsmere', 'Epsom & Ewell', 'Elmbridge', 'Spelthorne', 'Tandridge', 'Thurrock', 'Slough', 'Norwich',
] as const;

// Alternative ways a borough is written (lowercased, "&" as "and").
const BOROUGH_ALIASES: Record<string, string> = {
  'rbkc': 'Kensington & Chelsea', 'kensington': 'Kensington & Chelsea', 'chelsea': 'Kensington & Chelsea',
  'hammersmith': 'Hammersmith & Fulham', 'fulham': 'Hammersmith & Fulham', 'lbhf': 'Hammersmith & Fulham',
  'kingston': 'Kingston upon Thames', 'richmond': 'Richmond upon Thames', 'barking': 'Barking & Dagenham',
  'dagenham': 'Barking & Dagenham', 'epsom': 'Epsom & Ewell',
};

// Postcode district → borough.
const DISTRICT: Record<string, string> = {
  N1: 'Islington', N2: 'Barnet', N3: 'Barnet', N4: 'Haringey', N5: 'Islington', N6: 'Haringey', N7: 'Islington',
  N8: 'Haringey', N9: 'Enfield', N10: 'Haringey', N11: 'Enfield', N12: 'Barnet', N13: 'Enfield', N14: 'Enfield',
  N15: 'Haringey', N16: 'Hackney', N17: 'Haringey', N18: 'Enfield', N19: 'Islington', N20: 'Barnet',
  N21: 'Enfield', N22: 'Haringey',
  NW1: 'Camden', NW2: 'Brent', NW3: 'Camden', NW4: 'Barnet', NW5: 'Camden', NW6: 'Camden', NW7: 'Barnet',
  NW8: 'Westminster', NW9: 'Barnet', NW10: 'Brent', NW11: 'Barnet',
  E1: 'Tower Hamlets', E2: 'Tower Hamlets', E3: 'Tower Hamlets', E4: 'Waltham Forest', E5: 'Hackney',
  E6: 'Newham', E7: 'Newham', E8: 'Hackney', E9: 'Hackney', E10: 'Waltham Forest', E11: 'Waltham Forest',
  E12: 'Newham', E13: 'Newham', E14: 'Tower Hamlets', E15: 'Newham', E16: 'Newham', E17: 'Waltham Forest',
  E18: 'Redbridge', E20: 'Newham',
  EC1: 'Islington', EC2: 'City of London', EC3: 'City of London', EC4: 'City of London',
  SE1: 'Southwark', SE2: 'Bexley', SE3: 'Greenwich', SE4: 'Lewisham', SE5: 'Southwark', SE6: 'Lewisham',
  SE7: 'Greenwich', SE8: 'Lewisham', SE9: 'Greenwich', SE10: 'Greenwich', SE11: 'Lambeth', SE12: 'Lewisham',
  SE13: 'Lewisham', SE14: 'Lewisham', SE15: 'Southwark', SE16: 'Southwark', SE17: 'Southwark',
  SE18: 'Greenwich', SE19: 'Croydon', SE20: 'Bromley', SE21: 'Southwark', SE22: 'Southwark',
  SE23: 'Lewisham', SE24: 'Lambeth', SE25: 'Croydon', SE26: 'Lewisham', SE27: 'Lambeth', SE28: 'Greenwich',
  SW1: 'Westminster', SW2: 'Lambeth', SW3: 'Kensington & Chelsea', SW4: 'Lambeth', SW5: 'Kensington & Chelsea',
  SW6: 'Hammersmith & Fulham', SW7: 'Kensington & Chelsea', SW8: 'Lambeth', SW9: 'Lambeth',
  SW10: 'Kensington & Chelsea', SW11: 'Wandsworth', SW12: 'Wandsworth', SW13: 'Richmond upon Thames',
  SW14: 'Richmond upon Thames', SW15: 'Wandsworth', SW16: 'Lambeth', SW17: 'Wandsworth', SW18: 'Wandsworth',
  SW19: 'Merton', SW20: 'Merton',
  W1: 'Westminster', W2: 'Westminster', W3: 'Ealing', W4: 'Hounslow', W5: 'Ealing', W6: 'Hammersmith & Fulham',
  W7: 'Ealing', W8: 'Kensington & Chelsea', W9: 'Westminster', W10: 'Kensington & Chelsea',
  W11: 'Kensington & Chelsea', W12: 'Hammersmith & Fulham', W13: 'Ealing', W14: 'Hammersmith & Fulham',
  WC1: 'Camden', WC2: 'Westminster',
  HA0: 'Brent', HA1: 'Harrow', HA2: 'Harrow', HA3: 'Harrow', HA4: 'Hillingdon', HA5: 'Harrow',
  HA6: 'Hillingdon', HA7: 'Harrow', HA8: 'Barnet', HA9: 'Brent',
  UB1: 'Ealing', UB2: 'Ealing', UB3: 'Hillingdon', UB4: 'Hillingdon', UB5: 'Ealing', UB6: 'Ealing',
  UB7: 'Hillingdon', UB8: 'Hillingdon', UB9: 'Hillingdon', UB10: 'Hillingdon', UB11: 'Hillingdon',
  TW1: 'Richmond upon Thames', TW2: 'Richmond upon Thames', TW3: 'Hounslow', TW4: 'Hounslow', TW5: 'Hounslow',
  TW6: 'Hillingdon', TW7: 'Hounslow', TW8: 'Hounslow', TW9: 'Richmond upon Thames', TW10: 'Richmond upon Thames',
  TW11: 'Richmond upon Thames', TW12: 'Richmond upon Thames', TW13: 'Hounslow', TW14: 'Hounslow', TW17: 'Spelthorne',
  KT1: 'Kingston upon Thames', KT2: 'Kingston upon Thames', KT3: 'Kingston upon Thames', KT4: 'Sutton',
  KT5: 'Kingston upon Thames', KT6: 'Kingston upon Thames', KT9: 'Kingston upon Thames', KT12: 'Elmbridge',
  KT17: 'Epsom & Ewell', KT19: 'Epsom & Ewell',
  CR0: 'Croydon', CR2: 'Croydon', CR3: 'Tandridge', CR4: 'Merton', CR5: 'Croydon', CR7: 'Croydon', CR8: 'Croydon',
  BR1: 'Bromley', BR2: 'Bromley', BR3: 'Bromley', BR4: 'Bromley', BR5: 'Bromley', BR6: 'Bromley', BR7: 'Bromley',
  DA5: 'Bexley', DA6: 'Bexley', DA7: 'Bexley', DA8: 'Bexley', DA14: 'Bexley', DA15: 'Bexley', DA16: 'Bexley',
  DA17: 'Bexley', DA18: 'Bexley',
  RM1: 'Havering', RM2: 'Havering', RM3: 'Havering', RM5: 'Havering', RM6: 'Redbridge', RM7: 'Havering',
  RM8: 'Barking & Dagenham', RM9: 'Barking & Dagenham', RM10: 'Barking & Dagenham', RM11: 'Havering',
  RM12: 'Havering', RM13: 'Havering', RM14: 'Havering', RM17: 'Thurrock',
  IG1: 'Redbridge', IG2: 'Redbridge', IG3: 'Redbridge', IG4: 'Redbridge', IG5: 'Redbridge', IG6: 'Redbridge',
  IG8: 'Redbridge', IG11: 'Barking & Dagenham',
  EN1: 'Enfield', EN2: 'Enfield', EN3: 'Enfield', EN4: 'Barnet', EN5: 'Barnet', EN6: 'Hertsmere',
  SM1: 'Sutton', SM2: 'Sutton', SM3: 'Sutton', SM4: 'Merton', SM5: 'Sutton', SM6: 'Sutton',
  SL1: 'Slough',
};

// Well-known neighbourhoods → borough. Multi-word names are matched first.
const AREAS: Record<string, string> = {};
const add = (borough: string, names: string) => names.split(',').forEach((n) => { AREAS[n.trim().toLowerCase()] = borough; });
add('Barnet', 'finchley, north finchley, east finchley, west finchley, finchley central, church end, whetstone, totteridge, high barnet, new barnet, east barnet, friern barnet, hendon, west hendon, colindale, burnt oak, edgware, mill hill, golders green, hampstead garden suburb, childs hill, brent cross, arkley, oakleigh park, woodside park, cricklewood');
add('Brent', 'wembley, wembley park, harlesden, willesden, willesden green, kensal green, neasden, dollis hill, kingsbury, queensbury, stonebridge, alperton, sudbury, kilburn, queens park, brondesbury, kensal rise');
add('Harrow', 'harrow, harrow on the hill, south harrow, north harrow, west harrow, wealdstone, harrow weald, pinner, rayners lane, stanmore, hatch end, headstone, kenton');
add('Hillingdon', 'uxbridge, hayes, harlington, west drayton, yiewsley, ruislip, south ruislip, ickenham, northwood, eastcote, hillingdon, harefield');
add('Ealing', 'ealing, west ealing, acton, south acton, southall, hanwell, greenford, northolt, perivale, park royal');
add('Hounslow', 'hounslow, feltham, isleworth, brentford, chiswick, heston, cranford, bedfont, osterley');
add('Haringey', 'tottenham, wood green, hornsey, crouch end, muswell hill, seven sisters, turnpike lane, bruce grove, northumberland park, harringay, highgate, stroud green, noel park, bounds green, white hart lane, tottenham hale');
add('Enfield', 'enfield, enfield town, edmonton, lower edmonton, ponders end, southgate, palmers green, winchmore hill, bush hill park, enfield lock, enfield wash, brimsdown, cockfosters, oakwood, arnos grove, new southgate');
add('Islington', 'islington, holloway, highbury, archway, angel, finsbury park, canonbury, barnsbury, tufnell park');
add('Camden', 'camden, camden town, kentish town, hampstead, belsize park, swiss cottage, west hampstead, gospel oak, somers town, holborn, chalk farm');
add('Hackney', 'hackney, dalston, stoke newington, clapton, homerton, hoxton, shoreditch, hackney wick, stamford hill, haggerston');
add('Tower Hamlets', 'bethnal green, stepney, whitechapel, bow, poplar, limehouse, mile end, wapping, canary wharf, isle of dogs, shadwell');
add('Newham', 'stratford, east ham, west ham, forest gate, plaistow, canning town, beckton, manor park, upton park, custom house, silvertown');
add('Waltham Forest', 'walthamstow, leyton, leytonstone, chingford, highams park');
add('Redbridge', 'ilford, gants hill, barkingside, woodford, seven kings, goodmayes, wanstead');
add('Barking & Dagenham', 'barking, dagenham, becontree, chadwell heath');
add('Havering', 'romford, hornchurch, upminster, harold wood, harold hill, rainham, collier row');
add('Bexley', 'bexleyheath, sidcup, welling, erith, belvedere, crayford, bexley');
add('Greenwich', 'greenwich, woolwich, eltham, charlton, plumstead, thamesmead, abbey wood, blackheath, kidbrooke');
add('Lewisham', 'lewisham, catford, deptford, new cross, brockley, forest hill, sydenham, lee, hither green, ladywell, bellingham, downham');
add('Southwark', 'peckham, camberwell, bermondsey, walworth, elephant and castle, dulwich, east dulwich, nunhead, rotherhithe');
add('Lambeth', 'brixton, clapham, stockwell, streatham, norwood, west norwood, vauxhall, kennington, herne hill, tulse hill, waterloo');
add('Wandsworth', 'wandsworth, battersea, tooting, balham, putney, earlsfield, roehampton, southfields');
add('Merton', 'wimbledon, mitcham, morden, colliers wood, raynes park');
add('Croydon', 'croydon, thornton heath, norbury, selhurst, south norwood, addiscombe, purley, coulsdon, new addington, sanderstead, upper norwood');
add('Sutton', 'sutton, cheam, carshalton, wallington, worcester park');
add('Kingston upon Thames', 'kingston, surbiton, new malden, chessington, tolworth');
add('Richmond upon Thames', 'richmond, twickenham, teddington, hampton, whitton, barnes, kew, mortlake, east sheen');
add('Hammersmith & Fulham', 'hammersmith, fulham, shepherds bush, white city, parsons green');
add('Kensington & Chelsea', 'kensington, chelsea, notting hill, earls court, north kensington, ladbroke grove');
add('Westminster', 'westminster, paddington, marylebone, maida vale, pimlico, mayfair, soho, bayswater, st johns wood, victoria, westbourne park');
add('Bromley', 'bromley, beckenham, orpington, penge, chislehurst, petts wood, west wickham, anerley');

// Broad regions clients often use ("anywhere in North London").
const REGIONS: Record<string, string[]> = {
  'north london': ['Barnet', 'Enfield', 'Haringey', 'Islington', 'Camden'],
  'north west london': ['Brent', 'Barnet', 'Harrow', 'Camden'],
  'north east london': ['Enfield', 'Waltham Forest', 'Hackney', 'Redbridge'],
  'east london': ['Tower Hamlets', 'Newham', 'Hackney', 'Waltham Forest', 'Redbridge', 'Barking & Dagenham', 'Havering'],
  'south london': ['Lambeth', 'Southwark', 'Lewisham', 'Wandsworth', 'Croydon', 'Merton', 'Greenwich', 'Bromley', 'Sutton'],
  'south east london': ['Lewisham', 'Greenwich', 'Southwark', 'Bexley', 'Bromley'],
  'south west london': ['Wandsworth', 'Merton', 'Lambeth', 'Richmond upon Thames', 'Kingston upon Thames', 'Sutton'],
  'west london': ['Ealing', 'Hounslow', 'Hillingdon', 'Hammersmith & Fulham', 'Kensington & Chelsea', 'Brent', 'Harrow'],
};

const low = (s: string) => ` ${s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Area names, longest first so "north finchley" wins over "finchley". */
const AREA_NAMES = Object.keys(AREAS).sort((a, b) => b.length - a.length);
const BOROUGH_KEYS = [
  ...BOROUGHS.map((b) => [b.toLowerCase().replace(/&/g, 'and'), b] as const),
  ...Object.entries(BOROUGH_ALIASES),
].sort((a, b) => b[0].length - a[0].length);

export const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const DISTRICT_RE = /\b(EC|WC|NW|SE|SW|N|E|W|HA|UB|TW|KT|CR|BR|DA|RM|IG|EN|SM|SL)(\d{1,2})[A-Z]?\b/gi;

/** "N12 0AB" or a bare "N12" → "N12". */
export function districtOf(text: string): string | null {
  const full = text.match(POSTCODE_RE);
  if (full) return full[1].toUpperCase().replace(/^([A-Z]+\d+)[A-Z]$/, '$1');
  DISTRICT_RE.lastIndex = 0;
  const m = DISTRICT_RE.exec(text);
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null;
}

/** All postcode districts mentioned in free text (e.g. a client's notes). */
export function districtsIn(text: string): string[] {
  const out = new Set<string>();
  DISTRICT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DISTRICT_RE.exec(text)) !== null) out.add(`${m[1]}${m[2]}`.toUpperCase());
  return [...out];
}

export const boroughFromDistrict = (d: string | null) => (d ? DISTRICT[d] ?? null : null);

/** Finds a borough named in text: "Ealing Council", "RBKC", "LB of Harrow" → canonical name. */
export function canonicalBorough(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = low(text);
  for (const [key, borough] of BOROUGH_KEYS) if (t.includes(` ${key} `)) return borough;
  return null;
}

/** Every borough named in text (not just the first). */
export function boroughsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = low(text);
  return [...new Set(BOROUGH_KEYS.filter(([key]) => t.includes(` ${key} `)).map(([, b]) => b))];
}

/** Neighbourhood names found in text, e.g. ["north finchley", "tottenham"]. */
export function areasIn(text: string | null | undefined): string[] {
  if (!text) return [];
  let t = low(text);
  const found: string[] = [];
  for (const name of AREA_NAMES) {
    if (t.includes(` ${name} `)) {
      found.push(name);
      t = t.split(` ${name} `).join('  '); // so "finchley" is not found again inside "north finchley"
    }
  }
  return found;
}

export const boroughOfArea = (area: string) => AREAS[area.toLowerCase()] ?? null;

/** Boroughs covered by region phrases like "north london". */
export function regionBoroughs(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = low(text);
  return [...new Set(Object.entries(REGIONS).filter(([r]) => t.includes(` ${r} `)).flatMap(([, b]) => b))];
}

// Boroughs that share a border (or a central Thames bridge). Used to suggest
// clients who asked for the borough next door.
const BORDERS: [string, string][] = [
  ['Barking & Dagenham', 'Newham'], ['Barking & Dagenham', 'Redbridge'], ['Barking & Dagenham', 'Havering'],
  ['Barnet', 'Enfield'], ['Barnet', 'Haringey'], ['Barnet', 'Camden'], ['Barnet', 'Brent'], ['Barnet', 'Harrow'], ['Barnet', 'Hertsmere'],
  ['Bexley', 'Greenwich'], ['Bexley', 'Bromley'],
  ['Brent', 'Camden'], ['Brent', 'Westminster'], ['Brent', 'Kensington & Chelsea'], ['Brent', 'Hammersmith & Fulham'],
  ['Brent', 'Ealing'], ['Brent', 'Harrow'],
  ['Bromley', 'Greenwich'], ['Bromley', 'Lewisham'], ['Bromley', 'Southwark'], ['Bromley', 'Lambeth'], ['Bromley', 'Croydon'], ['Bromley', 'Tandridge'],
  ['Camden', 'Haringey'], ['Camden', 'Islington'], ['Camden', 'City of London'], ['Camden', 'Westminster'],
  ['City of London', 'Westminster'], ['City of London', 'Islington'], ['City of London', 'Hackney'],
  ['City of London', 'Tower Hamlets'], ['City of London', 'Southwark'],
  ['Croydon', 'Lambeth'], ['Croydon', 'Southwark'], ['Croydon', 'Merton'], ['Croydon', 'Sutton'], ['Croydon', 'Tandridge'],
  ['Ealing', 'Harrow'], ['Ealing', 'Hillingdon'], ['Ealing', 'Hounslow'], ['Ealing', 'Hammersmith & Fulham'],
  ['Enfield', 'Haringey'], ['Enfield', 'Waltham Forest'], ['Enfield', 'Hertsmere'],
  ['Greenwich', 'Lewisham'],
  ['Hackney', 'Haringey'], ['Hackney', 'Islington'], ['Hackney', 'Tower Hamlets'], ['Hackney', 'Newham'], ['Hackney', 'Waltham Forest'],
  ['Hammersmith & Fulham', 'Kensington & Chelsea'], ['Hammersmith & Fulham', 'Hounslow'],
  ['Hammersmith & Fulham', 'Richmond upon Thames'], ['Hammersmith & Fulham', 'Wandsworth'],
  ['Haringey', 'Waltham Forest'], ['Haringey', 'Islington'],
  ['Harrow', 'Hillingdon'], ['Harrow', 'Hertsmere'],
  ['Havering', 'Redbridge'], ['Havering', 'Thurrock'],
  ['Hillingdon', 'Hounslow'], ['Hillingdon', 'Slough'], ['Hillingdon', 'Spelthorne'],
  ['Hounslow', 'Richmond upon Thames'], ['Hounslow', 'Spelthorne'],
  ['Kensington & Chelsea', 'Westminster'], ['Kensington & Chelsea', 'Wandsworth'],
  ['Kingston upon Thames', 'Richmond upon Thames'], ['Kingston upon Thames', 'Merton'], ['Kingston upon Thames', 'Sutton'],
  ['Kingston upon Thames', 'Wandsworth'], ['Kingston upon Thames', 'Epsom & Ewell'], ['Kingston upon Thames', 'Elmbridge'],
  ['Lambeth', 'Wandsworth'], ['Lambeth', 'Southwark'], ['Lambeth', 'Westminster'], ['Lambeth', 'Merton'],
  ['Lewisham', 'Southwark'],
  ['Merton', 'Wandsworth'], ['Merton', 'Sutton'],
  ['Newham', 'Tower Hamlets'], ['Newham', 'Waltham Forest'], ['Newham', 'Redbridge'],
  ['Redbridge', 'Waltham Forest'],
  ['Richmond upon Thames', 'Wandsworth'], ['Richmond upon Thames', 'Elmbridge'], ['Richmond upon Thames', 'Spelthorne'],
  ['Southwark', 'Tower Hamlets'], ['Southwark', 'Westminster'],
  ['Sutton', 'Epsom & Ewell'],
  ['Wandsworth', 'Westminster'],
];
const NEIGHBOURS = new Map<string, Set<string>>();
for (const [a, b] of BORDERS) {
  if (!NEIGHBOURS.has(a)) NEIGHBOURS.set(a, new Set());
  if (!NEIGHBOURS.has(b)) NEIGHBOURS.set(b, new Set());
  NEIGHBOURS.get(a)!.add(b);
  NEIGHBOURS.get(b)!.add(a);
}

/** True when two boroughs share a border. */
export const areNeighbours = (a: string, b: string) => NEIGHBOURS.get(a)?.has(b) ?? false;

export const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
