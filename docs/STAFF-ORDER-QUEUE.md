# Scorpion Staff Custom Order Queue

## Purpose

The staff console turns durable Scorpion Leather Studio submissions into an operational quote, payment, workshop-release, and production queue without adding React or Three.js to the customer storefront.

The page remains `/staff.html` and talks only to authenticated server endpoints.

## Required server configuration

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SCORPION_STAFF_TOKEN`. Shopify draft/invoice features also require the existing Shopify server configuration.

The staff token is stored only in `sessionStorage`, never in the URL, and is cleared when the session closes or staff presses **Lock**.

## Workflow

Supported states are `received`, `reviewing`, `quoted`, `approved`, `paid`, `in_production`, `completed`, and `cancelled`.

`in_production` is protected by the V0.20 workshop release gate. Ordinary status saving cannot bypass manufacturing checks.

### Release to workshop

Before release, final quote/payment must be satisfied, ambiguous shop decisions must be resolved, required source artwork must exist in durable private storage, and a named staff member must release the exact revision.

A successful release stores the exact packet snapshot and revision ID, records releasing staff/time, locks manufacturing resolutions, and moves the order to `in_production`.

Released packets can be downloaded or printed from the staff console.

## Artwork

Customer artwork is privately stored in Supabase Storage instead of depending only on email. The detail API returns a short-lived signed URL to authenticated staff.

## Security

The Supabase service-role key remains server-side; staff APIs require bearer authorization; responses use `Cache-Control: no-store`; the staff page is noindex; order-table RLS exposes no public policy; the artwork bucket is private; and manufacturing packets omit customer email/phone.

The shared token remains a small-team mechanism. Individual staff identities and per-user audit trails are still a later hardening target.

## Efficiency

The staff console remains dependency-free vanilla HTML/CSS/JavaScript, isolated from customer React/3D bundles. V0.20 raises the internal static-asset ceiling only enough to accommodate production-resolution and release controls.

## Migration

Run/re-run `supabase/scorpion_custom_order_requests.sql`. See `WORKSHOP-SPEC.md` for V0.20 fields and release semantics.

## V0.22 revision comparison

Released controlled revisions now expose their archived packet history inside the staff order detail. Staff can compare an archived revision with the active revision and see only manufacturing-relevant changes.

The latest comparison can be printed as a compact revision change sheet containing the work-order/revision identity, reason, changed values, and the active scanner payload. This supplements—not replaces—the active released workshop packet.
