# Scorpion Material QA Standard

## Purpose

Material QA is the explicit gate between a processed captured-master and a production-approved material.

The browser QA tool does not alter the material registry. It creates an approval packet that can be reviewed and applied separately.

## Required inputs

- processing manifest from `/process.html`
- base-color map
- roughness map
- tangent-space normal map
- physical material swatch
- controlled reference lighting

The three maps must have matching dimensions.

## 3D inspection

Use the QA viewer to inspect the material on:

- sphere — broad highlight/roughness behavior
- cylinder — curved leather/harness-like response
- flat swatch — direct texture/tile inspection

Cycle through:

- studio lighting
- left raking light
- right raking light
- top light

Raking light is especially important for detecting:

- inverted or weak normals
- exaggerated grain
- baked directional lighting
- roughness artifacts
- incorrect surface scale

## Texture repeat

Texture repeat is a QA control, not a production guarantee.

Adjust it until the apparent grain scale matches the physical sample. Record the accepted repeat/tile scale in the approval packet and then transfer the approved value to the material registry/renderer configuration.

## Approval checklist

Every approval packet requires explicit confirmation that:

1. color matches the physical swatch under controlled light
2. seams/repetition are acceptable
3. grain scale is physically believable
4. normal direction/strength is correct
5. roughness matches the physical finish
6. target-device performance is acceptable

A reviewer identity is required.

## Decision semantics

A successful QA session exports:

```text
decision: approved-for-registry-promotion
automaticRegistryMutation: false
```

This means the material **may now be promoted deliberately**. It does not mean the browser changed the registry automatically.

## Promotion sequence

```text
captured-master
    ↓
processor output
    ↓
Material QA approval packet
    ↓
registry update/review
    ↓
production-approved
```

Keep the approval packet with the material's capture and processing records so the provenance chain remains auditable.
