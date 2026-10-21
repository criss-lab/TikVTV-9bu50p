-- Apply to the Supabase project used by TikVTVz before deploying payment functions.
create table if not exists public.pesapal_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  merchant_reference text not null unique,
  tracking_id text unique,
  plan text not null check (plan in ('monthly')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending','active','failed','reversed')),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists pesapal_orders_user_idx on public.pesapal_orders(user_id);
alter table public.pesapal_orders enable row level security;
revoke all on public.pesapal_orders from anon, authenticated;
grant select on public.pesapal_orders to authenticated;
drop policy if exists pesapal_orders_own_read on public.pesapal_orders;
create policy pesapal_orders_own_read on public.pesapal_orders for select to authenticated using (auth.uid() = user_id);
-- Existing entitlement table must expose user_id, status and ends_at.
-- Serialize completion to prevent duplicate IPNs/callbacks extending access twice.
create or replace function public.activate_pesapal_order(p_tracking text, p_reference text, p_amount numeric, p_currency text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.pesapal_orders%rowtype; current_end timestamptz;
begin
  select * into o from public.pesapal_orders where tracking_id=p_tracking and merchant_reference=p_reference for update;
  if not found or o.amount <> p_amount or o.currency <> p_currency or o.status in ('failed','reversed') then return false; end if;
  if o.status='active' then return true; end if;
  select max(ends_at) into current_end from public.premium_subscriptions where user_id=o.user_id and status='active';
  insert into public.premium_subscriptions(user_id,status,ends_at)
  values(o.user_id,'active',greatest(coalesce(current_end,now()),now()) + interval '30 days');
  update public.pesapal_orders set status='active',activated_at=now() where id=o.id;
  return true;
end $$;
revoke all on function public.activate_pesapal_order(text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.activate_pesapal_order(text,text,numeric,text) to service_role;
