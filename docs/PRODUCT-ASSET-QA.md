# Product Asset QA and Controlled Digital-Twin Promotion

## Purpose

V0.19 closes the gap between physical Product Capture and the customer configurator.

A reconstructed model is not production-ready merely because it loads. The asset must preserve physical dimensions, semantic node contracts, material provenance, mechanical behavior, visual fidelity, and mobile delivery budgets.

The product-side pipeline is now:

```text
Physical product
  -> Product Capture / construction packet
  -> Reconstruction / Blender
  -> Product Asset QA
  -> Explicit QA approval
  -> Controlled asset promotion
  -> Production digital-twin library
  -> Customer configurator
```

## Automated gate

The framework-independent `@sls/product-asset-qa` package evaluates the construction packet, asset manifest, locally inspected model, and material lifecycle together.

Production blockers include:

- manifest/model asset-ID mismatch
- non-GLB production delivery
- model file above 8 MB
- more than 150,000 triangles
- more than 48 meshes
- more than 16 materials
- more than 24 textures
- texture edge above 2048 px without a changed policy
- missing or invalid model bounds
- physical width/height/depth drift beyond ±8%
- root scale not frozen at `[1, 1, 1]`
- missing manifest nodes
- missing confirmed construction semantic nodes
- duplicated semantic node names
- missing confirmed construction material slots/components
- default materials that are not `production-approved`

Warnings surface retained non-uniform/negative transforms, unnamed meshes, embedded animation clips, near-budget triangle counts, and non-blocking naming/path discrepancies.

These are SLS production defaults, not universal glTF limits. They are intentionally conservative for a Shopify/mobile customer experience and can be revised only through an explicit QA policy change.

## Local model inspection

The `/product-asset-qa.html` tool loads Three.js only after the reviewer selects a candidate model.

The browser inspects the selected asset locally and records:

- world-space physical bounds
- semantic node names and duplicates
- root scale
- mesh count
- triangle count
- material count
- texture count and largest detected texture edge
- unnamed meshes
- non-uniform and negative scale nodes
- embedded animation clips

The selected model is rendered in the QA surface for orbit inspection. Files are not uploaded by this tool.

## Human review

Automation cannot decide whether the digital twin actually matches the physical Scorpion product. Promotion therefore also requires explicit review of:

- silhouette/proportions
- construction details
- approved material realism
- mechanical pivots/motion
- UVs/normals/texture seams
- camera framing
- configurable state correctness
- target mobile performance

Every check must pass and a named reviewer is required.

## Promotion

An approved QA packet can generate deterministic production metadata and placement instructions.

Default structure:

```text
/assets/products/<PRODUCT-ID>/<ASSET-ID>/
  model.glb
  manifest.json
  qa-approval.json
  construction-provenance.json
```

The production record uses the lifecycle `production-approved` and always preserves:

```json
{
  "automaticRegistryMutation": false
}
```

The tool does not silently copy a model, mutate GitHub, or change the customer registry. That final operation remains deliberate.
