alter table public.ione_smart_ads_campaigns add column if not exists whatsapp_phone text not null default '';
update public.ione_smart_ads_campaigns set whatsapp_phone = contact_phone where whatsapp_phone = '';
