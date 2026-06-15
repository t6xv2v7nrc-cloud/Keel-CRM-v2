-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — seed data (run AFTER 0001_init.sql, optional)
-- Realistic London DSS sample so the UI has something to render.
-- Safe to re-run: clears v2 sample rows first by known names.
-- ════════════════════════════════════════════════════════════════════

-- ── Contacts: housing officers + a partner agency + a landlord ──────
insert into contacts (type, full_name, organisation, borough, email, phone, notes) values
  ('housing_officer', 'Debby Owusu',  'Harrow Council',        'Harrow',   'd.owusu@harrow.gov.uk',     '+447700900111', 'Fast mover, prefers WhatsApp. Refers steady volume of UC singles.'),
  ('housing_officer', 'Marek Lewandowski', 'Haringey Council', 'Haringey', 'm.lewandowski@haringey.gov.uk', '+447700900222', 'Bedroom-tax cases. Wants weekly Friday updates.'),
  ('housing_officer', 'Aisha Rahman', 'RBKC Housing Solutions', 'RBKC',    'a.rahman@rbkc.gov.uk',      '+447700900333', 'High bar on property quality. Good for families.'),
  ('partner',         'Kingsway Property Ltd', 'KPL',          'Hounslow', 'deals@kingswayproperty.co.uk', '+447700900444', '50/50 fee split partner agency.'),
  ('landlord',        'Tomasz Nowak', null,                    'Haringey', 'tomasz.nowak@example.com',  '+447700900555', 'Owns 3 HMO rooms in N17. DSS-friendly.')
on conflict do nothing;

-- ── Applicants across the pipeline ──────────────────────────────────
insert into applicants
  (full_name, phone, email, adults, children, benefit_type, referring_borough, source, stage, budget_pcm, lha_band, requirements, notes, referred_by)
values
  ('Lubna Hassan',    '+447700900801', null, 1, 0, 'UC', 'Harrow',   'officer', 'referred',     1100, 'shared', 'Studio or HMO room, near Harrow & Wealdstone.', 'Referred by Debby. Quiet, working part-time.', (select id from contacts where full_name='Debby Owusu' limit 1)),
  ('Daniel Okafor',   '+447700900802', null, 2, 2, 'UC', 'Haringey', 'officer', 'viewing',      1650, '2bed',   'Two-bed, ground floor preferred, school catchment.', 'Family of 4. Viewing booked this week.', (select id from contacts where full_name='Marek Lewandowski' limit 1)),
  ('Priya Sharma',    '+447700900803', null, 1, 1, 'HB', 'RBKC',     'officer', 'offer',         1400, '1bed',   'One-bed, step-free access.', 'Offer out on a Ladbroke Grove flat.', (select id from contacts where full_name='Aisha Rahman' limit 1)),
  ('Samuel Mensah',   '+447700900804', null, 1, 0, 'UC', 'Hounslow', 'whatsapp','placed',        1050, 'shared', 'HMO room.', 'Moved in last month. Fee invoicing pending.', null),
  ('Grace Adeyemi',   '+447700900805', null, 3, 3, 'UC', 'Harrow',   'officer', 'fee_paid',      1900, '3bed',   'Three-bed house.', 'Completed deal. Fee paid. Great reference for Debby.', (select id from contacts where full_name='Debby Owusu' limit 1)),
  ('Mohammed Ali',    '+447700900806', null, 1, 0, 'UC', 'Haringey', 'website', 'lead',          1000, 'shared', 'Anything DSS-accepted in N-postcodes.', 'Inbound from website form.', null),
  ('Elena Popescu',   '+447700900807', null, 2, 1, 'HB', 'RBKC',     'officer', 'lost',          1500, '2bed',   'Two-bed.', 'Lost — landlord pulled out.', (select id from contacts where full_name='Aisha Rahman' limit 1))
on conflict do nothing;

-- ── Properties ──────────────────────────────────────────────────────
insert into properties (address_line, postcode, borough, property_type, rent_pcm, lha_rate_pcm, status, available_from, landlord_id, notes) values
  ('Room 2, 14 Bruce Grove',    'N17 6RA', 'Haringey', 'hmo_room', 950,  920,  'void',        current_date + 14, (select id from contacts where full_name='Tomasz Nowak' limit 1), 'HMO room, shared kitchen. Rent £30 over LHA.'),
  ('Flat C, 88 Ladbroke Grove', 'W11 2PA', 'RBKC',     '1bed',     1400, 1350, 'under_offer', current_date + 7,  null, 'One-bed, step-free. Offer with Priya Sharma.'),
  ('22 Pinner Road',            'HA1 4HZ', 'Harrow',   'studio',   1080, 1100, 'let',         null,              null, 'Studio, let to Samuel Mensah.')
on conflict do nothing;

-- ── A placement with a fee split (Samuel, placed, fee pending) ──────
insert into placements (applicant_id, property_id, council, officer_id, move_in_date, rent_pcm, incentive_amount, fee_amount, fee_splits, fee_status, notes)
select
  (select id from applicants where full_name='Samuel Mensah' limit 1),
  (select id from properties where address_line='22 Pinner Road' limit 1),
  'Hounslow',
  (select id from contacts where full_name='Debby Owusu' limit 1),
  current_date - 30, 1080, 500, 1200,
  '[{"partner":"KPL","pct":50}]'::jsonb,
  'pending',
  'Moved in 30 days ago. Invoice the council this week.'
where not exists (
  select 1 from placements p
  join applicants a on a.id = p.applicant_id
  where a.full_name = 'Samuel Mensah'
);

-- ── A couple of activity rows so timelines are not empty ────────────
insert into activities (entity_type, entity_id, kind, body)
select 'applicant', id, 'stage_change', 'Stage lead → referred (seed)'
from applicants where full_name = 'Lubna Hassan'
and not exists (select 1 from activities where body = 'Stage lead → referred (seed)');

insert into activities (entity_type, entity_id, kind, body)
select 'applicant', id, 'note', 'Viewing booked for Thursday 2pm (seed)'
from applicants where full_name = 'Daniel Okafor'
and not exists (select 1 from activities where body = 'Viewing booked for Thursday 2pm (seed)');
