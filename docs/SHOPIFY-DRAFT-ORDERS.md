# Shopify Draft Orders — Custom Leather Studio

## Purpose

A staff-approved custom leather quote can be converted into a Shopify Draft Order without retyping the customer, quote total, request ID, build ID, or customization traceability data.

The integration uses Shopify Admin GraphQL `draftOrderCreate` and is entirely server-side.

## Required Shopify configuration

Configure a Shopify Admin app/access token with the `write_draft_orders` permission.

Set these server environment variables:

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_ADMIN_API_VERSION=2026-07`

Never expose the Admin access token to the browser, Shopify Liquid, GitHub, or the public Studio configuration.

## Why the draft uses a custom line item

A custom leather quote can include tooling, lettering, material changes, artwork work, and other labor that is not represented by the starting catalog variant price.

For that reason the integration creates one custom physical line item whose price equals the **staff-approved quote total**.

The original Shopify SKU/variant, requested physical quantity, request ID, build ID, and construction/tooling details are preserved as draft-order and line-item custom attributes.

This prevents the current catalog/test price from being mistaken for the approved bespoke price.

## Staff workflow

1. Open `/staff.html`.
2. Review the complete customer build.
3. Enter the final quote total.
4. Move the request to `Quoted` or `Approved`.
5. Save.
6. Press **Create Shopify draft**.
7. The backend creates the draft order and writes the Shopify draft ID/name/invoice URL back to Supabase.
8. Subsequent attempts return the already-linked draft instead of intentionally creating another one.

## Failure protection

The order record tracks:

- `shopify_draft_order_state`
- `shopify_draft_order_id`
- `shopify_draft_order_name`
- `shopify_draft_order_invoice_url`
- `shopify_draft_order_error`

Creation is marked `creating` before the Shopify mutation and `created` or `failed` afterward.

This is not a distributed transaction, but it substantially reduces accidental duplicate creation and gives staff an explicit recovery state.

## Invoice sending

V0.11 creates the draft order but does **not** automatically email the Shopify invoice to the customer.

That separation is intentional. Staff should verify the final draft before an invoice is sent.

A later release can add an explicit **Send Shopify Invoice** action after the draft has been reviewed.

## Pricing authority

The quote entered by Scorpion staff is authoritative for the draft-order handoff.

The Studio's displayed catalog base subtotal is informational. Custom tooling/material/artwork work continues to require staff confirmation.
