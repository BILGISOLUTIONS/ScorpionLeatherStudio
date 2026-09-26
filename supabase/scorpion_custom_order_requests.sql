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

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_invoice_state text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_invoice_sent_at timestamptz;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_invoice_error text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_reconciled_at timestamptz;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_order_id text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_order_name text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_financial_status text;

alter table public.scorpion_custom_order_requests
  add column if not exists shopify_fulfillment_status text;

alter table public.scorpion_custom_order_requests enable row level security;

-- Intentionally create no anon/authenticated policies.
-- The order API writes with the server-only service-role key, which bypasses RLS.
-- A future staff dashboard should use its own authenticated server endpoint rather
-- than exposing this table directly to the public browser.


-- V0.20 — durable artwork provenance + workshop release state.
alter table public.scorpion_custom_order_requests
  add column if not exists artwork_storage_path text;

alter table public.scorpion_custom_order_requests
  add column if not exists artwork_sha256 text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_resolutions jsonb not null default '{}'::jsonb;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_release_packet jsonb;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_revision_id text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_released_at timestamptz;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_released_by text;

create index if not exists scorpion_custom_order_requests_workshop_revision_idx
  on public.scorpion_custom_order_requests (workshop_revision_id)
  where workshop_revision_id is not null;

-- Private durable source artwork. Service-role API access only; no public policy.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'scorpion-order-artwork',
  'scorpion-order-artwork',
  false,
  2097152,
  array['image/png','image/jpeg','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- V0.21 — controlled workshop revisions, checklist progress, final QC evidence and audit attribution.
alter table public.scorpion_custom_order_requests
  add column if not exists workshop_progress jsonb not null
    default '{"manufacturingCompleted":[],"qualityCompleted":[]}'::jsonb;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_revision_history jsonb not null default '[]'::jsonb;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_audit_log jsonb not null default '[]'::jsonb;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_qc_completed_at timestamptz;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_qc_completed_by text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_final_photo_name text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_final_photo_type text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_final_photo_size integer;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_final_photo_storage_path text;

alter table public.scorpion_custom_order_requests
  add column if not exists workshop_final_photo_sha256 text;

create index if not exists scorpion_custom_order_requests_qc_completed_idx
  on public.scorpion_custom_order_requests (workshop_qc_completed_at)
  where workshop_qc_completed_at is not null;

-- Private final-QC evidence. Service-role API access only; no public policy.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'scorpion-workshop-qc',
  'scorpion-workshop-qc',
  false,
  2097152,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
