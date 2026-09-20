# Scorpion Leather Studio

Scorpion Leather Studio is the custom 3D product configurator and fitting platform for Scorpion Western Wear.

## Product goal

Customers will configure real Scorpion leather products directly on the Shopify storefront: leather, color, stitching, hardware, compatible components, sizing, measurements, personalization, and upgrades. The live 3D representation, price, cart payload, and manufacturing specification must remain synchronized from one authoritative configuration state.

## Engineering principles

- Production-first; this repository is not a disposable prototype.
- Product fidelity takes priority over decorative CGI.
- Shopify remains the commerce system of record.
- 3D rendering, product rules, pricing, fitting, and Shopify integration remain separated behind clear interfaces.
- Product definitions are data-driven so new leather products can be added without rewriting the application.
- Real Shopify variants are reserved for inventory/SKU distinctions; configurator choices are not exploded into thousands of variants.
- Mobile performance is a first-class requirement.
- Real Scorpion product assets will replace development placeholders without application-level rewrites.

## Target stack

TypeScript, React, Three.js / React Three Fiber, glTF/GLB + PBR materials, a small deterministic state layer, and a Shopify Theme App Extension / supported Shopify storefront integration.

## Planned repository layout

- `apps/configurator` — standalone development application and visual test harness
- `apps/shopify-extension` — Shopify storefront integration
- `packages/configurator-core` — configuration state and rules
- `packages/product-schema` — product definition contracts and validation
- `packages/pricing-engine` — deterministic pricing logic
- `packages/three-renderer` — reusable 3D rendering layer
- `packages/shopify-adapter` — Shopify cart/order translation layer
- `assets` — development assets and manifests (production binaries should follow repository/LFS policy)
- `docs` — architecture, 3D standards, commerce constraints, and development plans

See `AGENTS.md` before making implementation changes.
