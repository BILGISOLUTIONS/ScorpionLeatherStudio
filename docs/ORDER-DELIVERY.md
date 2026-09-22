# Scorpion Leather Studio — Order Delivery

## Purpose

V0.5 adds a server-side delivery path for the structured order requests produced by the Custom Leather Studio.

The browser never receives SMTP credentials. The public repository contains only environment-variable names.

## Current flow

```text
Customer configures product
        ↓
Studio creates structured order request
        ↓
POST /api/order-requests
        ↓
Server validates request + honeypot + origin
        ↓
Scorpion order email
        ↓
Optional customer confirmation
```

The same `StudioOrderRequest` schema is designed to be reused later for Shopify draft-order creation, database persistence, an internal Scorpion production queue, artwork/file attachments, staff quoting, status notifications, and workshop build sheets.

## Vercel configuration

Add these Environment Variables to the ScorpionLeatherStudio Vercel project.

Required:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `ORDER_DESTINATION_EMAIL`

Recommended:

- `ORDER_SEND_CUSTOMER_CONFIRMATION=true`
- `ORDER_ALLOWED_ORIGINS=https://scorpionwesternwear.com,https://www.scorpionwesternwear.com` once the production domains are active

Use the SMTP settings from the mail service hosting the Scorpion company mailbox. Do not paste credentials into source files, GitHub issues, client-side JavaScript, or this repository.

## Behavior when SMTP is not configured

The API returns `503 ORDER_TRANSPORT_NOT_CONFIGURED`.

The browser UI retains the prepared build sheet and offers the email-client fallback. No order request is silently discarded.

## Customer confirmation

When `ORDER_SEND_CUSTOMER_CONFIRMATION` is enabled and the customer supplied an email address, the server sends a receipt that clearly states Scorpion received the request, includes the request/build ids and product/SKU/quantity, and explains that customization, availability, lead time, fit, and final price remain subject to shop confirmation.

## Security

The endpoint currently includes POST-only handling, same-origin/configured-origin validation, a honeypot field, strict payload-size limits, server-side shape/length validation, no-store caching, and credentials available only through environment variables.

Before broad public launch, add abuse protection such as Cloudflare Turnstile or another server-verified challenge and a durable rate-limit store.

## Next Shopify phase

Once the Shopify custom-distribution app/backend is established, the server-side delivery step can additionally create a Shopify draft order or custom-order record.

For quote-only catalog references, the system must never treat the current $10 development placeholder as approved retail pricing. Staff quoting remains authoritative.


## Durable order persistence (recommended)

V0.9 can persist every validated request to Supabase before attempting email delivery. This changes email from the only copy of a lead into a notification channel.

Add these server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Run:

```text
supabase/scorpion_custom_order_requests.sql
```

in the dedicated Scorpion Supabase project.

The service-role key must never be exposed to the browser, Shopify Liquid, GitHub source, or public configuration.

### Delivery behavior

- Supabase + email succeed: request is persisted and emailed.
- Supabase succeeds, email fails: request is still accepted and retained for staff follow-up.
- Supabase succeeds, SMTP is not configured: request is retained and accepted.
- Supabase is not configured, email succeeds: legacy email-only behavior continues.
- Neither persistence nor email is available: the API returns an error and the browser keeps the local build sheet/fallback options.

`request_id` is the database primary key, so retries are idempotent and update the same request instead of creating duplicate leads.
