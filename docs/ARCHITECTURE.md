# Architecture

## Objective

Scorpion Leather Studio is a reusable configurator engine with two delivery surfaces:

1. a standalone development application used for rapid development, QA, asset validation, and visual testing;
2. a Shopify storefront integration that exposes the same configurator directly on Scorpion Western Wear's store.

The Shopify surface must not require a second implementation of the configuration engine.

## Logical layers

### Product schema

Declarative product definitions describe:
- product identity
- Shopify merchandise references
- model/asset manifests
- option groups
- option values
- pricing modifiers
- compatibility rules
- measurement requirements
- camera presets
- animation/component targets
- manufacturing metadata

No React component should be the canonical location for product business rules.

### Configurator core

Owns the authoritative configuration state and pure rule evaluation.

Responsibilities:
- initialize defaults
- validate selections
- enforce compatibility
- resolve derived state
- serialize/deserialize configurations
- generate stable configuration identifiers
- produce a normalized configuration summary

The core should not depend on Three.js or Shopify SDK objects.

### Pricing engine

A deterministic function receives:
- product definition
- selected true merchandise variant, if any
- configurator selections
- applicable pricing rules

and returns a structured price breakdown plus total.

Browser pricing is presentation logic only until server-side validation is introduced.

### Measurement/fitting engine

Product-specific measurement schemas define:
- measurement name
- unit
- instructions
- range
- diagram/reference
- validation
- recommendation rules

The engine should return recommendations and warnings without silently changing customer measurements.

### 3D renderer

Consumes resolved visual state from the configurator core.

Responsibilities:
- asset loading
- materials
- mesh/component visibility
- camera control
- mechanical animation
- lighting/environment
- rendering performance
- screenshot/render output

The renderer must never become the source of truth for commerce state.

### Shopify adapter

Translates a validated configuration into Shopify-oriented commerce data.

Responsibilities:
- resolve merchandise/variant IDs
- map configuration metadata to cart line attributes/properties
- preserve a configuration ID
- provide enough structured information for order reconstruction
- prepare for server-side price validation and build-sheet generation

### UI

Presentation only:
- option controls
- swatches
- measurement wizard
- price breakdown
- configuration summary
- loading/error states
- cart action

UI components call domain actions rather than independently mutating multiple systems.

## Proposed workspace

```
apps/
  configurator/
  shopify-extension/

packages/
  configurator-core/
  product-schema/
  pricing-engine/
  fitting-engine/
  three-renderer/
  shopify-adapter/
  ui/

assets/
  models/
  materials/
  environments/
  manifests/

docs/
```

A monorepo tool may be introduced when implementation begins, but workspace complexity must remain justified.

## Data flow

```
Product Definition
       |
       v
Configurator Core <---- Customer UI
       |
       +------> Pricing Engine ------> Price UI
       |
       +------> Fitting Engine ------> Fit recommendation
       |
       +------> 3D Resolved State ---> Three Renderer
       |
       +------> Shopify Adapter -----> Cart / Order metadata
       |
       +------> Manufacturing Spec --> future build sheet
```

## Configuration identity

A configuration must serialize to a stable versioned object. The public/share identifier must not depend on UI ordering or incidental runtime state.

Recommended conceptual shape:

```ts
{
  schemaVersion: 1,
  productId: "...",
  merchandiseId: "...",
  selections: { ... },
  measurements: { ... },
  personalization: { ... }
}
```

The implementation may hash/canonicalize this object for compact IDs, but the canonical data itself must remain reconstructible.

## Security boundary

Never trust client-generated totals as authoritative for checkout. Before production launch, final price/eligibility should be validated by trusted server-side logic or an equivalent Shopify-supported mechanism.

Personalization text and measurement input must be validated and bounded.

## Deployment principle

The standalone app exists to make development easier. The production experience belongs on Scorpion's Shopify storefront through a supported Shopify extension/integration surface.
