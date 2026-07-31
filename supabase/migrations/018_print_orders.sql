-- ─── 018: print_orders — Prodigi order submissions ───────────────────────────
-- One row = one Prodigi submission attempt for one episode. Episodes keep
-- denormalized current-order fields (print_status, tracking_number, …);
-- submission history lives here. The row id doubles as the Prodigi
-- idempotencyKey: re-POSTing the same order after a crash returns
-- outcome "AlreadyExists" instead of a duplicate order.

create table print_orders (
  id                   uuid primary key default gen_random_uuid(),
  episode_id           uuid not null references episodes(id),
  prodigi_order_id     text,
  status               print_status_enum not null default 'pending',
  recipient            jsonb not null,
  shipping_method      text not null,
  page_count           int not null,
  asset_url_expires_at timestamptz,
  tracking_number      text,
  tracking_url         text,
  carrier              text,
  charges              jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table print_orders is
  'One Prodigi submission attempt per row. id doubles as the Prodigi idempotencyKey.';

comment on column print_orders.prodigi_order_id is
  'Prodigi order id (e.g. ord_1165638). NULL until Prodigi accepts the order.';

comment on column print_orders.status is
  'pending = row created, order not yet accepted; submitted set after successful POST.';

comment on column print_orders.recipient is
  'Recipient snapshot at submission time: {name, address:{line1, line2, postalOrZipCode, countryCode, townOrCity, stateOrCounty}}.';

comment on column print_orders.asset_url_expires_at is
  'Expiry of the signed book.pdf URL given to Prodigi''s asset fetcher.';

comment on column print_orders.charges is
  'Prodigi charges array snapshot from order status, verbatim.';

create index on print_orders (episode_id);
create unique index on print_orders (prodigi_order_id)
  where prodigi_order_id is not null;

create trigger print_orders_updated_at
  before update on print_orders
  for each row execute function set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- No policies on purpose: only the service-role client (admin server actions,
-- webhook routes) touches this table; deny everything else.

alter table print_orders enable row level security;
