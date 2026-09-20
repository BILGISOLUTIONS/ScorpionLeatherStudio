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
