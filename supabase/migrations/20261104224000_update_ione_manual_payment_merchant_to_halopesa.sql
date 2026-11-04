alter table public.ione_author_access
  alter column merchant_number set default '23544652',
  alter column merchant_network set default 'HaloPesa';

update public.ione_author_access
set merchant_number = '23544652',
    merchant_network = 'HaloPesa',
    updated_at = now()
where merchant_name = 'DERRICK KIPAJI OF AFRIKA & CO'
  and (merchant_number = '140001788' or merchant_network = 'Airtel Money');
