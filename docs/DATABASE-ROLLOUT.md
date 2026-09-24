# Production Database Rollout Safety

V0.20 introduces additive Supabase schema for workshop release and durable artwork provenance. Application deploys must remain safe if the database migration lands later than the code.

## Compatibility behavior

- New public order submissions first attempt the V0.20 row shape.
- If PostgREST reports the new artwork columns are absent from its schema cache, the API retries with the pre-V0.20 row shape so the customer request is still retained.
- Artwork upload failure or an unlinked artwork object never causes the customer request itself to disappear.
- Staff list reads try the V0.20 projection first and fall back to the legacy projection when the migration is absent.
- Normal review/quote operations remain available on the legacy schema.
- Workshop resolution, release-to-production, and completion transitions are disabled until the V0.20 workshop columns exist.
- The staff UI shows a migration-required state instead of presenting a broken release workflow.

## Why release is fail-closed

Workshop release depends on fields that must persist the exact production revision. Allowing release without those columns would make `in_production` mean something that cannot be reconstructed or audited later. Therefore customer intake fails open to the legacy durable order path, while manufacturing release fails closed.

## Migration target validation

Never apply `supabase/scorpion_custom_order_requests.sql` to a Supabase project merely because it is the only project visible in a connector. Confirm that the project is the Scorpion order-store environment before mutation.

After applying the migration, verify:

1. `scorpion_custom_order_requests` contains all V0.20 artwork/workshop columns.
2. `scorpion-order-artwork` exists and is private.
3. its file-size limit is 2 MB and allowed MIME types are PNG/JPEG/WebP/PDF.
4. staff detail responses report workshop schema ready.
5. a controlled test order can save resolutions without releasing.
6. production release remains blocked until payment and required resolutions are satisfied.

This compatibility layer should remain until the Scorpion production and recovery environments are both confirmed migrated.