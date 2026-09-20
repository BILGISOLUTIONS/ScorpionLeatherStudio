# Shopify Integration

## Goal

Customers must use Scorpion Leather Studio directly within the Scorpion Western Wear Shopify storefront and proceed through the normal Shopify cart/checkout path.

## Delivery model

The project should support:

1. a Shopify Theme App Extension / app block used to place configurator entry points and the production experience inside the storefront;
2. a standalone development surface used for engineering and QA;
3. shared packages so the two surfaces use the same product schema, configuration engine, pricing logic, and renderer.

Avoid an iframe-first architecture unless a specific platform limitation makes it necessary.

## Commerce model

A custom build consists of two conceptually different layers:

### True Shopify merchandise

Use Shopify variants only for distinctions that need a true SKU/inventory/fulfillment identity.

Examples may include:
- base model
- stock size
- stocked material class

### Configuration metadata

Use structured configuration metadata for combinatorial options such as:
- leather color
- stitch choice
- hardware finish
- optional component
- measurements
- embossing/personalization
- build notes
- configuration ID

Do not generate thousands of variants for the Cartesian product of these choices.

## Cart payload

The Shopify adapter must produce:
- merchandise/variant identifier
- quantity
- configuration ID
- human-readable summary fields
- versioned machine-readable configuration data, or a durable reference to it
- pricing/build metadata needed downstream

Order information must be sufficient to reconstruct what the customer selected.

## Price integrity

Live pricing can be calculated in the client for responsiveness, but the browser is not authoritative.

Before launch, add a trusted validation mechanism that verifies:
- selected options are valid
- option combinations are allowed
- calculated modifiers are current
- final charge matches the configuration

Do not ship a client-only pricing system that can be trivially tampered with.

## Product-page integration

Applicable product pages should be able to expose an entry point such as:
- Customize Yours
- Build Your Own
- Open Leather Studio

The merchant should be able to place/remove the block through Shopify's supported theme extension mechanisms.

## Full studio

A larger configurator surface may also live on a dedicated Scorpion storefront page while preserving the site's navigation/branding and normal checkout flow.

## Saved/shared configurations

Future architecture should allow a URL or configuration ID to restore a build.

Do not couple restoration to localStorage-only state.

## Workshop integration

The normalized order configuration should later feed:
- printable build sheet
- material/component requirements
- QR/reference code
- production checklist
- QC checklist
- optional customer approval render

The manufacturing representation should derive from the same canonical configuration rather than reinterpreting free-form order notes.

## API freshness

Shopify APIs evolve. Before implementing a Shopify-specific contract, verify the current supported API/version and update this document if assumptions change.
