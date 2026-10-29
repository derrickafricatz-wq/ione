-- Add recovery-code visibility to manual book receipts.
-- The recovery code is generated once at submission; access validation still uses its hash.
-- These fields are accessible only through the service-role Edge Function (RLS remains enabled/revoked).
alter table public.book_orders
  add column if not exists manual_recovery_code text;

alter table public.ione_book_receipts
  add column if not exists recovery_code text;

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
  if p_receipt_number is null or length(trim(p_receipt_number)) < 6 then raise exception 'Receipt details are invalid'; end if;
  if coalesce(v_order.manual_recovery_hash, p_recovery_hash) is null or length(coalesce(v_order.manual_recovery_hash, p_recovery_hash)) <> 64 then raise exception 'Recovery details are invalid'; end if;
  select * into v_book from public.heavens_books where id = v_order.book_id and active = true;
  if not found then raise exception 'Book is no longer available'; end if;
  update public.book_orders set status='paid', paid_at=now(), manual_review_status='approved',
    manual_reviewed_at=now(), manual_reviewed_by=left(coalesce(p_authority_name,'Authority Press'),120),
    manual_receipt_number=trim(p_receipt_number) where id=v_order.id;
  insert into public.book_access (book_id, customer_id, order_id)
    values (v_order.book_id, v_order.customer_id, v_order.id) on conflict do nothing;
  insert into public.ione_book_receipts
    (order_id,receipt_number,book_id,customer_id,customer_email,buyer_name,buyer_phone,amount_tzs,payment_method,paid_at,recovery_code)
  values (v_order.id,trim(p_receipt_number),v_order.book_id,v_order.customer_id,v_order.customer_email,
    v_order.manual_payer_name,v_order.manual_payer_phone,round(v_order.amount)::bigint,'Manual',now(),v_order.manual_recovery_code)
  on conflict (order_id) do nothing;
  insert into public.ione_book_recovery_codes (order_id,book_id,customer_id,code_hash)
    values (v_order.id,v_order.book_id,v_order.customer_id,lower(trim(coalesce(v_order.manual_recovery_hash,p_recovery_hash)))) on conflict (order_id) do nothing;
  return jsonb_build_object('success',true,'already_approved',false,'receipt_number',trim(p_receipt_number));
end $$;

revoke all on function public.ione_approve_manual_book_order(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.ione_approve_manual_book_order(uuid,text,text,text) to service_role;
