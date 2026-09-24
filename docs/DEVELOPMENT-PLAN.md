# Development Plan

## Stage 0 — Foundation

Status: in progress

Deliverables:
- repository and engineering rules
- architecture contract
- Shopify integration contract
- 3D asset standard
- product schema draft
- first-product selection
- MVP acceptance criteria

No production 3D modeling should begin before the asset contract is stable enough to avoid rework.

## Stage 1 — Engine MVP

Build a standalone development application with a replaceable placeholder GLB.

Required vertical slice:
- load product definition
- load GLB
- rotate/zoom/touch
- change one material option
- toggle one modular component
- deterministic price update
- configuration summary
- serialize/restore configuration
- mock Shopify cart payload
- desktop/mobile test coverage

The purpose is to prove the architecture, not the final product visuals.

## Stage 2 — First real Scorpion product

Select one actual leather product and build the production asset pipeline.

Candidate: a Scorpion leather welding hood because it demonstrates:
- leather material fidelity
- hardware
- visor mechanics
- component options
- fitting/measurement value
- visually meaningful customization

Capture reference photography and dimensions, reconstruct/model the real product, clean in Blender, author true Scorpion PBR materials, optimize for web, and connect it through the same manifest used by the placeholder.

V0.18 adds the controlled Product Capture / Construction Specification gate for this stage. It validates required physical measurements, photographic coverage, and semantic node contracts before a reconstruction-ready packet can be exported. Physical capture of the real production hood is still required before the first digital twin can be considered production-ready.

V0.19 adds Product Asset QA and controlled digital-twin promotion. The reconstructed model is inspected against physical envelope dimensions, semantic nodes, asset-manifest contracts, production material lifecycle, geometry/texture budgets, and explicit human fidelity review. Promotion generates deterministic production metadata and placement instructions while preserving a manual final asset-registry gate.

## Stage 3 — Shopify integration

Package the validated engine for the Scorpion Shopify storefront.

Deliver:
- Theme App Extension/app block
- product-page entry point
- full configurator surface
- cart line metadata
- configuration ID
- normal Shopify cart/checkout flow
- reliable mobile behavior

## Stage 4 — Commerce hardening

Add:
- trusted price validation
- configuration persistence
- shareable builds
- robust error telemetry
- accessibility pass
- performance budget enforcement
- compatibility testing against the live Scorpion theme

## Stage 5 — Workshop system

V0.20 establishes the first production-release and workshop-specification layer from the same authoritative order configuration.

Implemented:
- deterministic work-order and revision IDs
- privacy-minimized workshop payload
- resolved construction/personalization decisions
- durable private source-artwork provenance
- quote/payment/release blockers
- explicit staff release to production
- manufacturing checklist
- final QC checklist
- scanner/reference payload
- locked released manufacturing snapshot

Next workshop iterations should add controlled post-release revisions, digital QC completion/signoff, final-photo attachment, and individual staff identity/audit attribution.

## Stage 6 — Catalog expansion

Once the first product is production-proven, add further Scorpion leather products using the existing engine.

Do not broaden the catalog until the first product proves:
- visual fidelity
- configuration correctness
- mobile performance
- Shopify order integrity
- workshop usability
