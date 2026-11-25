-- Free, Authority-verified author access. Existing book and earnings records are retained.
alter table public.ione_author_access
  add column if not exists known_author_name text,
  add column if not exists email text,
  add column if not exists verification_status text not null default 'pending_verification',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text;
alter table public.ione_author_access drop constraint if exists ione_author_access_fee_tzs_check;
alter table public.ione_author_access drop constraint if exists ione_author_access_status_check;
alter table public.ione_author_access alter column fee_tzs set default 0;
alter table public.ione_author_access add constraint ione_author_access_fee_tzs_check check (fee_tzs=0);
alter table public.ione_author_access add constraint ione_author_access_status_check check (status in ('pending_verification','pending_payment','active','locked','rejected'));
update public.ione_author_access set email=a.email
from public.authors a where a.user_id=ione_author_access.user_id and ione_author_access.email is null and nullif(trim(a.email),'') is not null;
update public.ione_author_access set status='pending_verification',fee_tzs=0,verification_status='pending_verification'
where status='pending_payment';
update public.ione_author_access set status='active',fee_tzs=0,verification_status='verified',verified_at=coalesce(payment_confirmed_at,now()),verified_by=coalesce(payment_confirmed_by,'Previously approved')
where status='locked';
update public.ione_author_access set fee_tzs=0,verification_status='verified',verified_at=coalesce(payment_confirmed_at,now()),verified_by=coalesce(payment_confirmed_by,'Previously approved')
where status='active';
update public.ione_author_access set verification_status='rejected' where status='rejected';
create unique index if not exists ione_author_access_email_unique on public.ione_author_access(lower(email)) where email is not null and trim(email)<>'';
drop trigger if exists trg_ione_author_package_guard on public.heavens_books;
create or replace function public.ione_guard_author_package_publish()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_access public.ione_author_access%rowtype;
begin
  if new.active is distinct from true then return new; end if;
  if tg_op='UPDATE' and old.active is true then return new; end if;
  if new.author_id is null then raise exception 'An author account is required to publish.'; end if;
  select * into v_access from public.ione_author_access where user_id=new.author_id for update;
  if not found or v_access.status <> 'active' or v_access.verification_status <> 'verified' then
    raise exception 'Authority Press must verify this author before publishing.';
  end if;
  -- No author access fee, package counter, renewal, or book-count restriction.
  return new;
end $$;
create trigger trg_ione_author_package_guard before insert or update of active on public.heavens_books
for each row execute function public.ione_guard_author_package_publish();

-- Secure email-based recovery for an author who signs in on a replacement device.
-- Only a confirmed Supabase Auth email can claim a matching registered author profile.
create or replace function public.ione_recover_author_registration()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_old uuid;
  v_row public.ione_author_access%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to recover your author profile.'; end if;
  select lower(trim(email)),email_confirmed_at into v_email,v_confirmed from auth.users where id=v_uid;
  if v_email is null or v_confirmed is null then return null; end if;
  select user_id into v_old from public.ione_author_access where lower(trim(email))=v_email for update;
  if v_old is null then return null; end if;
  if v_old=v_uid then
    select * into v_row from public.ione_author_access where user_id=v_uid;
    return to_jsonb(v_row);
  end if;
  if exists(select 1 from public.ione_author_access where user_id=v_uid) then
    raise exception 'This account already has an author registration. Contact I|ONE support to safely reconcile accounts.';
  end if;
  update public.ione_author_access set user_id=v_uid,updated_at=now() where user_id=v_old;
  update public.authors set user_id=v_uid where user_id=v_old;
  update public.heavens_books set author_id=v_uid where author_id=v_old;
  update public.books set author_id=v_uid where author_id=v_old;
  update public.book_narration_requests set author_id=v_uid where author_id=v_old;
  update public.ione_author_earnings set author_id=v_uid where author_id=v_old;
  update public.ione_author_payouts set author_id=v_uid where author_id=v_old;
  select * into v_row from public.ione_author_access where user_id=v_uid;
  return to_jsonb(v_row);
end $$;
revoke all on function public.ione_recover_author_registration() from public,anon;
grant execute on function public.ione_recover_author_registration() to authenticated;
