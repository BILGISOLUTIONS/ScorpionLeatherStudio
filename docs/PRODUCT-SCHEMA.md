# Product Schema Contract

## Purpose

Every configurable product must be described by data rather than hardcoded UI logic.

A product definition is versioned and contains the information required by:
- configurator state
- compatibility rules
- pricing
- fitting
- 3D rendering
- Shopify mapping
- manufacturing output

## Conceptual shape

```ts
type ProductDefinition = {
  schemaVersion: number
  id: string
  handle: string
  name: string
  category: string
  currency: string
  basePrice: number

  commerce: {
    shopifyProductId?: string
    defaultMerchandiseId?: string
    variantStrategy: "inventory-only" | "selected-options"
  }

  asset: {
    manifest: string
    defaultCameraPreset: string
  }

  optionGroups: OptionGroup[]
  measurements?: MeasurementDefinition[]
  compatibilityRules?: CompatibilityRule[]
  pricingRules?: PricingRule[]
  manufacturing?: ManufacturingMapping
}
```

## Option groups

Each option group has:
- stable ID
- customer-facing label
- type
- required/default behavior
- ordered values
- optional rendering/commerce/manufacturing metadata

Supported conceptual UI types:
- swatch
- choice
- toggle
- select
- text
- number

An option value may contain:
- label
- description
- price modifier
- visual targets
- Shopify metadata
- manufacturing code
- availability/compatibility tags

## Example

```json
{
  "id": "welding-hood-001",
  "name": "Custom Leather Welding Hood",
  "basePrice": 18900,
  "currency": "USD",
  "optionGroups": [
    {
      "id": "leather",
      "label": "Leather",
      "type": "swatch",
      "required": true,
      "defaultValue": "brown-full-grain",
      "values": [
        {
          "id": "brown-full-grain",
          "label": "Brown Full Grain",
          "priceModifier": 0,
          "visual": {
            "materialSlot": "LeatherPrimary",
            "materialVariant": "SCL-002"
          },
          "manufacturingCode": "SCL-002"
        }
      ]
    }
  ]
}
```

All money values should be represented in minor units (cents) in domain logic.

## Compatibility rules

Compatibility must be explicit and deterministic.

Rules may:
- require another selection
- exclude another selection
- limit values based on base style
- constrain components based on size/material
- disable impossible manufacturing combinations

The engine should return both validity and human-readable reasons.

## Pricing rules

Pricing must be derived from stable rule data, never duplicated in UI copy.

A pricing result should include:
- base price
- modifier lines
- total
- currency
- source rule IDs

## Measurements

Measurements should define:
- ID
- label
- unit
- minimum/maximum
- instructions
- illustration reference
- whether required
- fit recommendation rules

Raw customer measurements must remain separately preserved from any recommended size.

## Personalization

Personalization fields must define:
- allowed characters
- max length
- placement choices
- price impact
- manufacturing representation

Do not accept arbitrary unbounded text.

## Serialization

Saved/shared configurations must include:
- schema version
- product ID
- selected values by stable ID
- measurements
- personalization
- true Shopify merchandise identity where needed

Canonical serialization must not contain transient UI state, Three.js objects, or display-only labels.
