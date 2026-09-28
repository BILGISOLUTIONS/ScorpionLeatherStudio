# SLS Engineering Program

Scorpion Leather Studio is being treated as a product platform rather than a single configurator page.

## Active workstreams

1. **Customer Studio** — guided customization, mobile ergonomics, accessibility, save/share/recovery, fast photo-first presentation, and progressively enhanced 3D.
2. **Digital-twin pipeline** — physical capture, reconstruction contracts, asset QA, controlled promotion, LOD/compression, visual regression and fidelity review.
3. **Material pipeline** — calibrated field capture, processing, QA, promotion, texture-tier governance and renderer parity.
4. **Commerce integrity** — live Shopify reconciliation, trusted pricing, inventory/SKU mapping, draft-order delivery, idempotency and order reconstruction.
5. **Workshop operations** — release-gated manufacturing specifications, controlled revisions, persisted progress/final QC, final-photo evidence, QR scan flow and low-distraction Focus Station.
6. **Staff operations** — individual role-aware authentication, quote/Shopify/workshop controls, asset/material administration and authenticated audit attribution.
7. **Reliability/observability** — V0.26 adds bounded local delivery diagnostics, server correlation traces and recoverable customer failure states; release health and aggregate privacy-safe monitoring remain future work.
8. **Security/privacy** — staff authorization, secret isolation, bounded uploads, input validation, rate limiting, data retention and least-privilege service access.
9. **Quality engineering** — unit/contract/browser tests, accessibility automation plus manual review, visual regression, device matrix and production smoke tests.
10. **Platform/release engineering** — bundle/function budgets, feature-branch CI without Vercel waste, exact-SHA promotion, rollback and environment parity.
11. **Catalog onboarding** — repeatable product/material intake so additional Scorpion products become data/asset work rather than application rewrites.
12. **Business intelligence** — funnel events, customization demand, quote conversion, abandonment points and product-option demand without compromising customer privacy.

## Current sequencing

### Now
- finish first-product physical/digital-twin provenance chain
- ensure production materials and model assets cannot bypass QA
- preserve photo-first customer UX while 3D fidelity matures

### Next
- accessibility + keyboard/focus + reduced-motion audit
- production Shopify theme compatibility/smoke suite
- customer save/share continuity beyond a single browser device
- privacy-safe aggregate release health/alerting only where it provides operational value

### Before broad catalog expansion
The welding hood must prove:

- photographed-product fidelity
- material fidelity
- mechanical correctness
- mobile performance
- deterministic commerce state
- successful Shopify order delivery
- workshop-readable build output
- recoverable failure behavior
- staff operability
- production monitoring

Only then should the engine be scaled across the rest of the customizable catalog.


## V0.25 staff identity hardening

V0.25 moves the staff console from shared-token-only operation to individual staff access keys with server-enforced roles and authenticated workshop audit attribution. The legacy shared token remains temporarily available for rollback. Staff identity UI remains lazy and customer storefront payload is unchanged.


## V0.26 customer-safe recovery and tracing

V0.26 adds request-scoped server trace IDs, bounded local delivery receipts, session-only privacy-safe diagnostic events, exact-build request restoration, retry/recovery UI, and private recovery packet export. It adds no polling, third-party telemetry SDK, new Vercel function, or initial storefront payload. Recovery remains inside the already-lazy order-capture workflow.
