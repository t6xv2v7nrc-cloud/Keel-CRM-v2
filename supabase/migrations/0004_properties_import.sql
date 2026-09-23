-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — property list import + matching (run after 0003)
--
-- 1. Adds the fields a pasted stock list carries: bedrooms, bills,
--    furnished, rent as stated (e.g. "1-Bed LHA"), locality and the
--    partner/source tag.
-- 2. Removes the three sample properties from the original seed data.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table properties
  add column if not exists bedrooms   int,   -- 0 for studios and rooms
  add column if not exists bills      text,  -- "All Included", "Excluded", ...
  add column if not exists furnished  text,  -- "Furnished", "Part furnished", "Unfurnished"
  add column if not exists rent_text  text,  -- rent as stated: "1-Bed LHA", "£220 pw"
  add column if not exists area       text,  -- locality: "North Finchley"
  add column if not exists source_tag text;  -- where the list came from (partner, landlord)

create index if not exists properties_borough_idx on properties(borough);

-- Sample placeholders from seed.sql (the seeded placement keeps its record;
-- its property link is cleared automatically).
delete from activities
where entity_type = 'property'
  and entity_id in (
    select id from properties
    where address_line in ('Room 2, 14 Bruce Grove', 'Flat C, 88 Ladbroke Grove', '22 Pinner Road')
  );
delete from properties
where address_line in ('Room 2, 14 Bruce Grove', 'Flat C, 88 Ladbroke Grove', '22 Pinner Road');
