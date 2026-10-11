create table if not exists public.ione_author_access (
  user_id uuid primary key,
  real_name text not null,
  phone text not null,
  terms_accepted boolean not null default false,
  fee_tzs integer not null default 10000 check (fee_tzs = 10000),
  merchant_name text not null default 'DERRICK KIPAJI OF AFRIKA & CO',
  merchant_number text not null default '140001788',
  merchant_network text not null default 'Airtel Money',
  status text not null default 'pending_payment' check (status in ('pending_payment','active','locked','rejected')),
  package_number integer not null default 0 check (package_number >= 0),
  books_used integer not null default 0 check (books_used between 0 and 3),
  renewal_requested boolean not null default false,
  payment_confirmed_at timestamptz,
  payment_confirmed_by text,
  authority_notes text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ione_author_access_status_idx on public.ione_author_access(status,submitted_at desc);
alter table public.ione_author_access enable row level security;
revoke all on public.ione_author_access from anon, authenticated;
drop trigger if exists trg_ione_author_package_guard on public.heavens_books;
create or replace function public.ione_guard_author_package_publish()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_access public.ione_author_access%rowtype;
begin
  if new.active is distinct from true then return new; end if;
  if tg_op='UPDATE' and old.active is true then return new; end if;
  if new.author_id is null then raise exception 'An author account is required to publish.'; end if;
  select * into v_access from public.ione_author_access where user_id=new.author_id for update;
  if not found then raise exception 'Complete the I|ONE Author Studio form before publishing.'; end if;
  if v_access.status <> 'active' then raise exception 'Author Studio is locked. Complete the TSh 10,000 package payment and wait for Authority Press confirmation.'; end if;
  if v_access.books_used >= 3 then
    update public.ione_author_access set status='locked',updated_at=now() where user_id=new.author_id;
    raise exception 'This three-book package is complete. Renew the TSh 10,000 package to publish more books.';
  end if;
  update public.ione_author_access
    set books_used=books_used+1,
        status=case when books_used+1 >= 3 then 'locked' else 'active' end,
        updated_at=now()
    where user_id=new.author_id;
  return new;
end $$;
create trigger trg_ione_author_package_guard
before insert or update of active on public.heavens_books
for each row execute function public.ione_guard_author_package_publish();
