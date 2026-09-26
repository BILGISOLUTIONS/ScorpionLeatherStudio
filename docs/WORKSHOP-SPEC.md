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

## V0.21 — controlled revisions, digital progress, final QC

V0.21 extends the released workshop packet into an auditable production record.

### Controlled revisions

A released manufacturing packet is still immutable. If a production decision must change after release:

1. enter the revised manufacturing resolutions;
2. provide a bounded revision reason;
3. provide the staff member creating the revision;
4. create a **controlled revision**.

The prior released packet is archived in `workshop_revision_history` with its revision ID, reason, staff identity, and archive timestamp. The new packet receives a newly derived deterministic revision ID and becomes the active released packet.

Creating a new revision resets manufacturing/QC checklist progress, final-QC signoff, and the linked final-QC photo. This prevents evidence from an older revision from being reused accidentally.

### Digital production progress

Required manufacturing and QC checklist items are now persisted in `workshop_progress` rather than existing only as boxes on a printed packet.

Every save records the staff identity and timestamp and appends an audit event. Unknown checklist IDs are rejected against the active released packet.

### Final QC evidence

Completion requires all of the following:

- every required manufacturing checklist item completed;
- every required final-QC checklist item completed;
- named staff/QC signer;
- a durably stored final-QC photo linked to the active work order/revision.

Final photos are stored privately in the `scorpion-workshop-qc` Supabase Storage bucket. Supported formats are PNG, JPEG, and WebP up to 2 MB. Staff access uses short-lived signed URLs; the bucket remains non-public.

### Completion gate

Directly changing a released order to `completed` through the ordinary order editor is no longer valid. Staff must use **Complete final QC**, which revalidates checklist progress, photo provenance, release state, and signer identity before the order status can become completed.

### Audit attribution

V0.21 stores a bounded workshop audit log. Current audited actions include:

- release to production;
- checklist progress save;
- final-QC photo stored;
- controlled revision created;
- final QC completed.

Each event includes timestamp, staff identity, and the relevant revision ID.

### Migration

Re-run `supabase/scorpion_custom_order_requests.sql`. The V0.21 additions are idempotent and add workshop progress, revision history, audit log, final-QC identity/timestamps, final-photo provenance, and the private final-QC storage bucket.


## V0.22 — revision comparison and print-first change control

V0.22 makes controlled revisions easier to execute on the shop floor without changing the V0.21 persistence schema.

### Revision history

The staff console now renders archived released revisions returned by the existing workshop API. Each entry preserves:

- archived revision ID;
- archive timestamp and staff identity;
- revision reason;
- the immutable released packet snapshot.

### Manufacturing diff

The active packet can be compared against any archived revision. The comparison is deliberately limited to manufacturing-relevant fields:

- leather finish and color;
- stitching;
- hardware;
- edge/binding;
- tooling;
- text/text execution;
- placement;
- tooling/artwork/additional notes;
- production notes;
- staff notes.

Unchanged fields are omitted so staff see only what must change physically.

### Scan-first change sheet

The latest archived revision can be printed as a compact **Revision Change Sheet** containing:

- work-order ID;
- prior -> active revision IDs;
- revision reason and staff attribution;
- previous and active value for each changed manufacturing field;
- active scanner payload.

The change sheet is supplementary. The active released workshop packet remains the manufacturing authority.

### Runtime efficiency

V0.22 remains a lazy staff-only module. The retired V0.21 browser module is removed from the deployed public assets so the internal upgrade does not accumulate dead JavaScript or affect the customer storefront.
