-- Secure one-time I|ONE Author Studio recovery codes.
-- Only a SHA-256 digest is stored; redeeming a code reconnects the existing author records.
alter table public.ione_author_access
 add column if not exists recovery_code_hash text,
 add column if not exists recovery_code_created_at timestamptz;

create or replace function public.ione_recover_author_by_code(p_code_hash text, p_new_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
 v_old uuid;
 v_row public.ione_author_access%rowtype;
begin
 if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' or p_new_user_id is null then
   raise exception 'Enter a valid recovery code.';
 end if;
 select user_id into v_old
 from public.ione_author_access
 where recovery_code_hash = lower(p_code_hash)
   and status = 'active'
   and verification_status = 'verified'
 for update;
 if v_old is null then raise exception 'Recovery code is invalid, expired, or already used.'; end if;
 if v_old = p_new_user_id then
   update public.ione_author_access set recovery_code_hash=null,recovery_code_created_at=null,updated_at=now()
   where user_id=v_old returning * into v_row;
   return jsonb_build_object('success',true,'request',to_jsonb(v_row));
 end if;
 if exists(select 1 from public.ione_author_access where user_id=p_new_user_id) then
   raise exception 'This account already has an author profile. Contact I|ONE support to safely reconcile it.';
 end if;
 update public.ione_author_access set user_id=p_new_user_id,recovery_code_hash=null,recovery_code_created_at=null,updated_at=now() where user_id=v_old;
 update public.authors set user_id=p_new_user_id where user_id=v_old;
 update public.heavens_books set author_id=p_new_user_id where author_id=v_old;
 update public.books set author_id=p_new_user_id where author_id=v_old;
 update public.book_narration_requests set author_id=p_new_user_id where author_id=v_old;
 update public.ione_author_earnings set author_id=p_new_user_id where author_id=v_old;
 update public.ione_author_payouts set author_id=p_new_user_id where author_id=v_old;
 select * into v_row from public.ione_author_access where user_id=p_new_user_id;
 return jsonb_build_object('success',true,'request',to_jsonb(v_row));
end $$;
revoke all on function public.ione_recover_author_by_code(text,uuid) from public, anon, authenticated;
grant execute on function public.ione_recover_author_by_code(text,uuid) to service_role;
