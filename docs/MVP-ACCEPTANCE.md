# MVP Acceptance Criteria

The first engine MVP is accepted only when all conditions below are met.

## Product/configuration

- A product definition loads from data.
- One authoritative configuration state exists.
- At least one leather/material choice works.
- At least one modular component choice works.
- Invalid combinations are rejected with a reason.
- Configuration serializes and restores deterministically.

## 3D

- A GLB loads through the asset manifest.
- Mouse orbit works.
- Touch orbit works.
- Zoom is bounded.
- Material switching does not reload the whole application.
- Component visibility updates from configuration state.
- At least one mechanical animation is implemented through a manifest-defined pivot/target.
- Camera preset switching works.
- Loading and failure states are visible.
- Reduced-motion behavior is respected.

## Pricing

- Base price plus modifiers produces a deterministic structured breakdown.
- Money is handled in minor units.
- UI displays the same total returned by the pricing engine.
- Tests cover representative modifier combinations.

## Fitting

- At least one measurement field is schema-driven.
- Range validation works.
- Fit recommendation logic is separate from raw measurement storage.

## Shopify adapter

Before live Shopify credentials are required, the adapter must generate a mock cart-line payload containing:
- merchandise ID placeholder
- quantity
- configuration ID
- readable option summary
- machine-readable/versioned configuration reference or payload

## UI

Desktop and mobile must both support the complete primary flow:
1. inspect product
2. change options
3. view price
4. enter measurement
5. view summary
6. generate cart payload

No essential action may depend on hover.

## Quality gates

Required before calling the MVP complete:
- typecheck passes
- lint passes
- unit tests pass
- production build passes
- affected flows manually exercised in browser
- desktop checked
- mobile viewport checked
- no console-breaking errors
- no hardcoded placeholder-specific mesh logic outside the manifest adapter

The MVP may use placeholder geometry. It may not use placeholder architecture.
