alter table public.ione_chapchap_orders
  drop constraint if exists ione_chapchap_orders_commission_percent_check;
alter table public.ione_chapchap_orders
  add constraint ione_chapchap_orders_commission_percent_check
  check (commission_percent = any (array[1.00, 4.00, 5.00]::numeric[]));

alter table public.ione_chapchap_receipts
  drop constraint if exists ione_chapchap_receipts_chapchap_percent_check;
alter table public.ione_chapchap_receipts
  add constraint ione_chapchap_receipts_chapchap_percent_check
  check (chapchap_percent = any (array[1.00, 4.00]::numeric[]));

alter table public.ione_chapchap_receipts
  add column if not exists payment_provider text not null default 'BLMPay';

update public.ione_chapchap_receipts r
set payment_provider = coalesce(o.payment_provider, 'BLMPay')
from public.ione_chapchap_orders o
where o.id = r.order_id and (r.payment_provider is null or r.payment_provider = 'BLMPay');