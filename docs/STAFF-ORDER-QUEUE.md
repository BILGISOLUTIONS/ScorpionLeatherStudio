# Scorpion Staff Custom Order Queue

## Purpose

The staff console turns durable Custom Leather Studio submissions into an operational review queue without adding React, Three.js, or any other dependency to the customer storefront.

The page is built as a static asset:

```text
/staff.html
```

and talks only to:

```text
/api/staff/orders
```

The API keeps the Supabase service-role key server-side.

## Required server configuration

Configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCORPION_STAFF_TOKEN`

Use a long random value for `SCORPION_STAFF_TOKEN` (32+ characters recommended).

The token is entered by staff in the browser and stored only in `sessionStorage`. It is not included in the URL and is cleared when the browser session is closed or the user presses **Lock**.

## Order workflow

Supported statuses:

1. `received`
2. `reviewing`
3. `quoted`
4. `approved`
5. `in_production`
6. `completed`
7. `cancelled`

Staff can also record:

- internal notes
- quote total in cents / USD
- current status

The complete original structured request remains stored in `request_payload`.

## Security model

- The public browser never receives the Supabase service-role key.
- Staff API calls require `Authorization: Bearer <SCORPION_STAFF_TOKEN>`.
- Bearer-token comparison uses Node's constant-time `timingSafeEqual`.
- Staff API responses use `Cache-Control: no-store`.
- `staff.html` declares `noindex,nofollow,noarchive`.
- The Supabase table has RLS enabled and intentionally has no public browser policies.
- The staff token is not committed to GitHub.

This is appropriate for a small internal team. A future multi-user phase should replace the shared staff token with individual authenticated staff accounts and audit trails.

## Efficiency contract

The staff console is intentionally dependency-free vanilla HTML/CSS/JavaScript. It does not participate in the customer React entry bundle.

CI enforces separate staff-page budgets:

- raw HTML: <= 40 kB
- gzip HTML: <= 10 kB

The existing customer JS/CSS/3D budgets continue independently.

## Database migration

Run:

```text
supabase/scorpion_custom_order_requests.sql
```

The migration is re-runnable and adds the staff-review columns when upgrading an existing order table.

## Current operational path

```text
Customer Custom Leather Studio
        ↓
POST /api/order-requests
        ↓
Supabase durable record
        ├── email notification
        └── /staff.html queue
                  ↓
             Reviewing
                  ↓
               Quoted
                  ↓
              Approved
                  ↓
           In production
                  ↓
              Completed
```

## Next phase

The next logical upgrade is to let an approved/quoted request create or link a Shopify Draft Order, while preserving the original request/build IDs as traceability metadata.
