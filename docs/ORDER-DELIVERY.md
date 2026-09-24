# Scorpion Leather Studio — Order Delivery

## Purpose

The delivery layer preserves a validated Studio request before notification/commerce work. Email is a notification channel, not the authoritative copy of the lead.

## Current flow

```text
Customer configures product
  -> Studio structured request
  -> POST /api/order-requests
  -> server validation
  -> Supabase durable order record
       -> private durable artwork source
       -> email notification / customer confirmation
```

## Durable persistence

Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `supabase/scorpion_custom_order_requests.sql`. The service-role key must never enter browser code, Shopify Liquid, source control, or client configuration.

`request_id` is the primary key, so retries upsert the same request.

### Artwork

Supported artwork remains PNG/JPEG/WebP/PDF up to 2 MB. V0.20 stores the actual source bytes in the private `scorpion-order-artwork` bucket and records SHA-256 plus storage path.

If artwork storage fails but the order/email path succeeds, the request is still retained for review; however production release is blocked until a durable source artifact exists.

## SMTP

Email uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ORDER_DESTINATION_EMAIL`, optional customer confirmation, and allowed-origin settings.

## Delivery outcomes

- Supabase + email succeed: durable request plus notification.
- Supabase succeeds and email fails/unconfigured: staff still receives a durable request.
- Supabase unavailable and email succeeds: legacy email-only fallback remains.
- Neither persistence nor email is available: the API errors and the browser retains its local packet/fallback.
- Artwork metadata without durable bytes: review/quote remains possible, workshop release is blocked.

## Security

The endpoint retains POST-only handling, origin checks, honeypot, body/upload bounds, server validation, private credentials, private artwork storage, and no-store responses.

Before broad public launch, add server-verified abuse protection and a durable rate-limit mechanism.