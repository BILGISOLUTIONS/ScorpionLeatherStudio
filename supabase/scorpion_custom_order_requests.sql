-- Scorpion Western Wear — Custom Leather Studio order intake
-- Run in the dedicated Scorpion Supabase project.
-- This table is intended for SERVER-SIDE service-role access.
-- Do not expose the service-role key to browser code.

create table if not exists public.scorpion_custom_order_requests (
  request_id text primary key,
  build_id text not null,
  status text not null default 'received',
  delivery_status text not null default 'received',
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),

  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_company text,

  product_title text not null,
  reference_title text not null,
  sku text not null,
  variant_title text not null,
  quantity integer not null check (quantity between 1 and 99),

  base_subtotal_minor integer not null check (base_subtotal_minor >= 0),
  base_price_status text not null check (base_price_status in ('catalog', 'quote')),

  artwork_name text,
  artwork_type text,
  artwork_size integer,

  request_payload jsonb not null
);

create index if not exists scorpion_custom_order_requests_created_at_idx
  on public.scorpion_custom_order_requests (created_at desc);

create index if not exists scorpion_custom_order_requests_status_idx
  on public.scorpion_custom_order_requests (status, created_at desc);

create index if not exists scorpion_custom_order_requests_customer_email_idx
  on public.scorpion_custom_order_requests (customer_email)
  where customer_email is not null;

create index if not exists scorpion_custom_order_requests_sku_idx
  on public.scorpion_custom_order_requests (sku, created_at desc);

alter table public.scorpion_custom_order_requests
  add column if not exists staff_notes text;

alter table public.scorpion_custom_order_requests
  add column if not exists quote_total_minor integer;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_draft_order_id text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_draft_order_name text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_draft_order_invoice_url text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_draft_order_state text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_draft_order_error text;

alter table public.scorpion_custom_order_requests enable row level security;

-- Intentionally create no anon/authenticated policies.
-- The order API writes with the server-only service-role key, which bypasses RLS.
-- A future staff dashboard should use its own authenticated server endpoint rather
-- than exposing this table directly to the public browser.
