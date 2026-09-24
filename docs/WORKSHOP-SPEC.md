# Workshop Specification and Production Release

## Purpose

V0.20 converts a validated Scorpion Leather Studio order request into a controlled manufacturing packet rather than a prettier copy of the customer request.

The packet carries deterministic work-order and revision identity, resolved manufacturing decisions, source-artwork provenance, release blockers, manufacturing/QC checklists, and explicit staff release metadata.

## Operational flow

```text
Customer configuration
  -> durable order request
  -> staff review / quote
  -> approved
  -> payment confirmed
  -> resolve ambiguous shop decisions
  -> workshop release gate
  -> released production packet
  -> in production
  -> final QC
  -> completed
```

Selecting `in_production` directly is no longer an acceptable shortcut. Staff must use **Release to workshop**, which runs the production gate first.

## Production decisions

Precise customer choices remain authoritative. `as-photographed` resolves to the photographed starting reference. Ambiguous values such as `shop-choice`, `custom-request`, `custom-concept`, and `Shop recommendation` require a separate staff production resolution.

Staff resolutions are stored separately from the original request. The customer request remains immutable historical input.

## Release blockers

A production release is blocked when payment is not confirmed, a required quote is missing, manufacturing decisions remain ambiguous, required source artwork is not durably stored, the releasing staff member is unnamed, or bounded workshop fields are invalid.

Free-form customer notes are surfaced as warnings so they cannot disappear inside a packet.

## Revision identity

Every packet receives a stable work-order identity and deterministic manufacturing revision:

```text
SLS-WO-<BUILD>-<REQUEST-SUFFIX>
REV-<DETERMINISTIC-HASH>
```

Changing a manufacturing resolution changes the revision ID. Once a packet is released, its manufacturing resolutions are locked; later changes require a controlled revision rather than a silent edit.

## Privacy boundary

Workshop packets include customer display name, company when supplied, and needed-by date when supplied. They intentionally exclude customer email and phone data because shop-floor manufacturing does not require them.

## Durable artwork

V0.20 adds the private Supabase Storage bucket `scorpion-order-artwork`. Supported files remain PNG/JPEG/WebP/PDF up to 2 MB.

The order API stores source bytes privately and records filename/type/size, storage path, and SHA-256. The authenticated staff API issues only short-lived signed URLs. If artwork is referenced but the durable source is missing, workshop release is blocked.

## Build packet

The packet contains request/build/work-order/revision IDs, release state, product/SKU/variant/quantity, resolved construction choices, personalization, artwork provenance, product-specific configuration, notes, quote/release context, manufacturing checklist, final QC checklist, and a scanner payload.

The scanner payload contains no customer PII:

```text
SLS:WORKSHOP:1:<REQUEST-ID>:<REVISION-ID>
```

A later QR-rendering layer can encode the payload without changing this schema.

## Database migration

Re-run `supabase/scorpion_custom_order_requests.sql`. V0.20 adds durable artwork fields, workshop resolution/release fields, a revision index, and the private artwork bucket. The migration remains re-runnable.