# V0.25 — Workshop Production Overview

## Purpose

V0.25 adds a staff-only production analytics view over existing released workshop data.

It does **not** add a new database table, polling loop, customer-storefront bundle, or Vercel function.

## Runtime isolation

The production overview is loaded only when staff press **Production overview**.

Lazy assets:

- `/staff-analytics-v025.js`
- `/staff-analytics-v025.css`

The customer Studio never loads these files.

## Server path

V0.25 reuses the existing authenticated staff orders function:

```text
GET /api/staff/orders?view=workshop-analytics
```

No seventh Vercel function is created.

The query reads only workshop/production fields required for aggregation. Customer email, phone, address, artwork bytes, and other customer contact data are not returned in the analytics payload.

## Metrics

The overview reports factual operational measurements only:

- active released builds
- active unit quantity
- total released builds in the loaded history
- completed workshop builds
- completions in the previous 30 days
- average release-to-final-QC duration for completed builds
- age of the oldest active released build
- controlled revision count
- aggregate manufacturing checklist completion
- aggregate final-QC checklist completion
- released product mix by build count and unit quantity

No arbitrary SLA, "late", "good", or "bad" classification is imposed.

## Active queue

The queue contains only released, not-yet-completed/non-cancelled workshop builds.

For each build it displays:

- work-order and revision identity
- product/reference
- quantity
- factual time since release
- manufacturing checklist progress
- final-QC checklist progress
- controlled revision count

The queue sorts by release time, oldest first. Selecting a row opens the existing order detail rather than creating a second editing surface.

## Resource policy

- loaded on demand only
- no background polling
- one compact server query per open/refresh
- refresh is manual
- no customer PII in the analytics response
- no new serverless function
- dedicated raw/gzip JS and CSS budgets
- existing staff queue remains the source of order editing authority
