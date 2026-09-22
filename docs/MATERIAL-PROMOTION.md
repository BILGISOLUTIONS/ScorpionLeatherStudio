# Scorpion Material Promotion Standard

## Purpose

Material Promotion is the controlled release gate between an approved QA packet and a deployable production material.

It must never silently rewrite the deployed registry.

The promotion stage verifies that the following all refer to the same physical material:

1. captured-master material draft
2. processing manifest
3. QA approval packet
4. production texture files

## Provenance requirements

For field-captured material, the material ID and capture-session ID must match through the complete chain.

The QA packet must contain:

- `decision: approved-for-registry-promotion`
- `automaticRegistryMutation: false`
- named reviewer
- review timestamp
- all physical-comparison checks passed

A mismatch blocks promotion.

## Production texture tiers

### 1K baseline

Every production-approved leather requires a 1024 × 1024 tier.

This is the baseline customer-delivery asset and exists specifically to keep GPU memory, network transfer, and mobile rendering cost under control.

Required:

- base color
- normal
- roughness

### 2K optional tier

2048 × 2048 is optional.

Add it only if on-model QA shows a meaningful visual improvement at realistic customer viewing distances.

Do not add a 2K tier simply because source captures are large.

### 4K

The data model permits 4K, but the browser promotion UI deliberately does not encourage it.

Introduce 4K only after measured visual benefit and performance testing justify the additional bandwidth and GPU memory.

## Production formats

Current web policy:

```text
basecolor.webp
normal.png
roughness.png
```

Base color is encoded to WebP for transfer efficiency.

Normal and roughness remain PNG because lossy compression can introduce vector/gradient artifacts that are disproportionately visible in physically based rendering.

A later KTX2/Basis texture pipeline can supersede this convention after renderer support and device testing are complete.

## Renderer values

The final material definition receives the values accepted during Material QA:

- texture repeat
- normal scale
- roughness scalar

The promotion validator constrains these values to renderer-safe ranges.

## Output

Promotion produces:

```text
<MATERIAL>-production-material.json
<MATERIAL>-asset-placement.json
```

and normalized production filenames for each selected tier.

Example:

```text
/materials/SCL-005/
  1k/
    basecolor.webp
    normal.png
    roughness.png
  2k/
    basecolor.webp
    normal.png
    roughness.png
```

## Registry rule

The output material has `lifecycle: production-approved` only because a QA approval packet was supplied and validated.

The browser still does not mutate GitHub or the deployed registry. The generated definition must be reviewed/committed separately.

That separation is intentional: capture, processing, QA, and deployment remain auditable independent steps.

## Efficiency rule

The customer renderer should request only the tier selected by device policy.

Do not preload both 1K and 2K.

Do not load internal capture, processing, QA, or promotion applications as part of the customer Studio graph.
