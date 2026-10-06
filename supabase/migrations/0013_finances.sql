-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — finances: fees from the rent, first rent, invoices
-- (run after 0012)
--
-- receivables gains:
--   rent_pcm, fee_basis, fee_rate  how a fee was worked out: a set amount,
--                                  a % of a month's rent, or weeks of rent
--   due_after                      'sign_up', or 'first_rent' for providers
--                                  who pay once the client's first month's
--                                  rent is in
--   first_rent_due_on / _paid_on   when that rent is expected, and paid
--   invoice_number, invoiced_on,   the invoice raised for it
--   bill_to
--
-- next_invoice_no() hands out invoice numbers from a sequence, so two people
-- raising invoices at once never get the same one, and a number is never
-- used twice.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table receivables add column if not exists rent_pcm           numeric(10, 2);
alter table receivables add column if not exists fee_basis          text;
alter table receivables add column if not exists fee_rate           numeric(10, 2);
alter table receivables add column if not exists due_after          text not null default 'sign_up';
alter table receivables add column if not exists first_rent_due_on  date;
alter table receivables add column if not exists first_rent_paid_on date;
alter table receivables add column if not exists invoice_number     text;
alter table receivables add column if not exists invoiced_on        date;
alter table receivables add column if not exists bill_to            text;

do $$ begin
  alter table receivables add constraint receivables_fee_basis_check check (fee_basis is null or fee_basis in ('fixed', 'percent', 'weeks'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table receivables add constraint receivables_due_after_check check (due_after in ('sign_up', 'first_rent'));
exception when duplicate_object then null; end $$;

create unique index if not exists receivables_invoice_number_key on receivables(invoice_number) where invoice_number is not null;
create index if not exists receivables_first_rent_idx on receivables(first_rent_due_on) where first_rent_paid_on is null;

-- Invoice numbers
create sequence if not exists invoice_no_seq;

-- The next invoice number, never below at_least (to carry on from invoices raised before Keel did them).
create or replace function next_invoice_no(at_least bigint default 1) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  n := nextval('invoice_no_seq');
  if n < at_least then
    perform setval('invoice_no_seq', at_least);
    n := at_least;
  end if;
  return n;
end $$;

revoke all on function next_invoice_no(bigint) from public;
grant execute on function next_invoice_no(bigint) to authenticated;
