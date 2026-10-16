-- Company Recovery Vault: encrypted recovery-code copies for Authority Press only.
create table if not exists public.ione_billboard_recovery_vault (
  billboard_id uuid primary key references public.afrilink_billboards(id) on delete cascade,
  encrypted_code text not null,
  iv text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ione_billboard_recovery_vault enable row level security;
revoke all on public.ione_billboard_recovery_vault from anon, authenticated;
