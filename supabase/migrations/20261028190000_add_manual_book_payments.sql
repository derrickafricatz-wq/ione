-- Additive manual book payment support. Existing electronic orders retain their current provider split.
alter table public.book_orders
  add column if not exists manual_payer_name text,
  add column if not exists manual_payer_phone text,
  add column if not exists manual_review_status text not null default 'not_required',
  add column if not exists manual_reviewed_at timestamptz,
  add column if not exists manual_reviewed_by text,
  add column if not exists manual_rejection_reason text,
  add column if not exists manual_receipt_number text;

create index if not exists book_orders_manual_review_idx
  on public.book_orders (manual_review_status, created_at desc)
  where payment_provider = 'Manual';

create table if not exists public.ione_book_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.book_orders(id) on delete restrict,
  receipt_number text not null unique,
  book_id uuid not null references public.heavens_books(id) on delete restrict,
  customer_id uuid not null,
  customer_email text,
  buyer_name text,
  buyer_phone text,
  amount_tzs bigint not null check (amount_tzs > 0),
  payment_method text not null check (payment_method in ('Manual','BLMPay')),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.ione_book_receipts enable row level security;
revoke all on public.ione_book_receipts from anon, authenticated;

create table if not exists public.ione_book_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.book_orders(id) on delete restrict,
  book_id uuid not null references public.heavens_books(id) on delete restrict,
  customer_id uuid not null,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz
);
alter table public.ione_book_recovery_codes enable row level security;
revoke all on public.ione_book_recovery_codes from anon, authenticated;

-- Author share remains 95% for every confirmed sale. Electronic: 95/3/2.
-- Manual: 95/0/5, because no BLMPay transaction fee is incurred.
create or replace function public.ione_record_author_earning()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_book public.heavens_books%rowtype;
  v_amount bigint;
  v_author bigint;
  v_provider bigint;
  v_platform bigint;
  v_paid_at timestamptz;
begin
  if lower(coalesce(new.status,'')) not in ('paid','completed') then return new; end if;
  if lower(coalesce(old.status,'')) in ('paid','completed') then return new; end if;
  select * into v_book from public.heavens_books where id = new.book_id;
  if not found or v_book.author_id is null then return new; end if;
  v_amount := round(new.amount)::bigint;
  if v_amount <= 0 then return new; end if;
  v_author := floor(v_amount * 0.95)::bigint;
  if lower(coalesce(new.payment_provider,'')) = 'manual' then
    v_provider := 0;
    v_platform := v_amount - v_author;
  else
    v_provider := floor(v_amount * 0.03)::bigint;
    v_platform := v_amount - v_author - v_provider;
  end if;
  v_paid_at := coalesce(new.paid_at, now());
  insert into public.ione_author_earnings
    (order_id,book_id,author_id,sale_amount_tzs,author_share_tzs,provider_fee_share_tzs,platform_share_tzs,status,earned_at,available_at)
  values
    (new.id,new.book_id,v_book.author_id,v_amount,v_author,v_provider,v_platform,'pending',v_paid_at,date_trunc('month',v_paid_at) + interval '1 month')
  on conflict (order_id) do nothing;
  return new;
end $$;

-- Approval is transactional: paid order, access, receipt, and recovery hash commit together.
create or replace function public.ione_approve_manual_book_order(
  p_order_id uuid, p_authority_name text, p_receipt_number text, p_recovery_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.book_orders%rowtype;
  v_book public.heavens_books%rowtype;
  v_receipt public.ione_book_receipts%rowtype;
begin
  select * into v_order from public.book_orders where id = p_order_id for update;
  if not found or coalesce(v_order.payment_provider,'') <> 'Manual' then raise exception 'Manual payment request not found'; end if;
  if v_order.status in ('paid','completed') then
    select * into v_receipt from public.ione_book_receipts where order_id = v_order.id;
    return jsonb_build_object('success',true,'already_approved',true,'receipt_number',v_receipt.receipt_number);
  end if;
  if v_order.status <> 'pending' or v_order.manual_review_status <> 'pending' then raise exception 'Only pending manual requests can be approved'; end if;
  if v_order.customer_id is null then raise exception 'Customer account is missing'; end if;
  if p_receipt_number is null or length(trim(p_receipt_number)) < 6 or p_recovery_hash is null or length(trim(p_recovery_hash)) <> 64 then raise exception 'Receipt or recovery details are invalid'; end if;
  select * into v_book from public.heavens_books where id = v_order.book_id and active = true;
  if not found then raise exception 'Book is no longer available'; end if;
  update public.book_orders set status='paid', paid_at=now(), manual_review_status='approved',
    manual_reviewed_at=now(), manual_reviewed_by=left(coalesce(p_authority_name,'Authority Press'),120),
    manual_receipt_number=trim(p_receipt_number) where id=v_order.id;
  insert into public.book_access (book_id, customer_id, order_id)
    values (v_order.book_id, v_order.customer_id, v_order.id) on conflict do nothing;
  insert into public.ione_book_receipts
    (order_id,receipt_number,book_id,customer_id,customer_email,buyer_name,buyer_phone,amount_tzs,payment_method,paid_at)
  values (v_order.id,trim(p_receipt_number),v_order.book_id,v_order.customer_id,v_order.customer_email,
    v_order.manual_payer_name,v_order.manual_payer_phone,round(v_order.amount)::bigint,'Manual',now())
  on conflict (order_id) do nothing;
  insert into public.ione_book_recovery_codes (order_id,book_id,customer_id,code_hash)
    values (v_order.id,v_order.book_id,v_order.customer_id,lower(trim(p_recovery_hash))) on conflict (order_id) do nothing;
  return jsonb_build_object('success',true,'already_approved',false,'receipt_number',trim(p_receipt_number));
end $$;

create or replace function public.ione_reject_manual_book_order(
  p_order_id uuid, p_authority_name text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.book_orders%rowtype;
begin
  select * into v_order from public.book_orders where id=p_order_id for update;
  if not found or coalesce(v_order.payment_provider,'') <> 'Manual' then raise exception 'Manual payment request not found'; end if;
  if v_order.status in ('paid','completed') or v_order.manual_review_status='approved' then raise exception 'A confirmed purchase cannot be rejected'; end if;
  if v_order.manual_review_status <> 'pending' then raise exception 'Only pending manual requests can be rejected'; end if;
  update public.book_orders set status='rejected', manual_review_status='rejected', manual_reviewed_at=now(),
    manual_reviewed_by=left(coalesce(p_authority_name,'Authority Press'),120),
    manual_rejection_reason=left(trim(coalesce(p_reason,'Payment could not be verified')),500) where id=p_order_id;
  return jsonb_build_object('success',true,'status','rejected');
end $$;

revoke all on function public.ione_approve_manual_book_order(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.ione_reject_manual_book_order(uuid,text,text) from public, anon, authenticated;
grant execute on function public.ione_approve_manual_book_order(uuid,text,text,text) to service_role;
grant execute on function public.ione_reject_manual_book_order(uuid,text,text) to service_role;
