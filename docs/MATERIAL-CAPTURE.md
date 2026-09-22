# Scorpion Material Capture Standard

## Purpose

This document defines how a physical Scorpion material sample becomes a reusable digital material for the Leather Studio.

A material is **not** production-approved simply because a color or texture looks plausible in the renderer. Production approval requires a documented source and a material definition whose lifecycle is `production-approved`.

## Material lifecycle

### reference-only

Used for the current catalog-photo approximations and development placeholders.

These materials may establish rough color/roughness for UI development, but they are **not color-authoritative** and must not be represented to customers as a calibrated physical sample.

### captured-master

A physical sample has been captured with the field rig and source files are archived, but the resulting PBR maps have not yet passed visual/technical QA.

### production-approved

The capture, maps, physical metadata, and rendering have passed review. Production-approved leather must have at least one web texture tier and field-capture or supplier-reference provenance.

## Field capture sequence

Use the same physical setup and camera geometry for the entire material session.

Recommended sequence per swatch:

1. identification frame — material ID, ruler/scale, color target
2. cross-polarized diffuse frame — base-color source
3. parallel/reflective frame — surface-response reference
4. directional north
5. directional east
6. directional south
7. directional west
8. macro grain detail
9. edge/thickness reference
10. optional reverse/backside reference

Do not change white balance, focal length, camera height, sample position, or exposure strategy midway through a comparable swatch set unless the session notes explicitly record the change.

## Physical labeling

Assign the digital ID before capture.

Example:

```text
Material ID: SCL-005
Client: Scorpion Western Wear
Commercial name: Saddle Brown Full Grain
Material type: Cowhide
Supplier: ______
Supplier item: ______
Thickness: 2.1 mm
Availability: Confirmed / Quote / Unverified
```

Never derive an authoritative supplier, hide type, thickness, or finish from appearance alone.

## Capture folder

Archive raw source images outside the web bundle.

```text
captures/
  SC-2026-001/
    SCL-005/
      00-identification.dng
      01-cross-polarized.dng
      02-parallel.dng
      03-north.dng
      04-east.dng
      05-south.dng
      06-west.dng
      07-macro.dng
      08-edge.dng
      capture.json
```

The repository should contain metadata and optimized web derivatives, not huge RAW archives.

## Production web material

Recommended output:

```text
apps/configurator/public/materials/
  SCL-005/
    1k/
      basecolor.webp
      normal.webp
      roughness.webp
      ao.webp
    2k/
      basecolor.webp
      normal.webp
      roughness.webp
      ao.webp
```

Add 4K only when visual QA proves it materially improves the real customer view. Mobile should normally select the 1K tier; capable desktop devices may select 2K.

## Map rules

### Base color

- derived from calibrated diffuse/cross-polarized capture
- no baked directional highlights or cast shadows
- sRGB texture

### Normal

- tangent-space normal
- no exaggerated grain depth
- linear texture

### Roughness

- white = rougher, black = smoother
- preserve wax/oil/polish differences without baking lighting
- linear texture

### Ambient occlusion

Use only where it contributes real micro-occlusion. Do not use AO as a substitute for proper base-color correction.

### Height/displacement

Keep as an authoring master unless the production mesh has enough tessellation and visual QA proves runtime displacement is worth the memory/GPU cost. Fine leather grain usually belongs in the normal map.

## Seamlessness

Production leather maps must tile without visible borders. Remove obvious repeating scars/marks that become a wallpaper pattern, while retaining believable low-frequency color and grain variation.

## Color

A calibrated target should be present in the identification frame. The renderer still needs a customer-facing disclaimer that monitor/phone color varies.

Do not approve a material solely from an uncalibrated phone image.

## QA

Before changing a material lifecycle to `production-approved`, verify:

- ID matches the physical sample
- source/provenance is recorded
- color target/session metadata exists
- base color contains no baked glare
- tile edges are invisible
- normal direction is correct
- roughness response resembles the physical swatch
- 1K and 2K tiers use the same crop/orientation
- texture scale is believable on the product
- mobile GPU memory and frame rate remain acceptable
- the material is actually available or explicitly quote-only

## Runtime policy

The application selects texture tier conservatively:

- constrained/mobile/high-density devices: 1K
- capable desktop: 2K
- reference-only materials without maps: scalar/color approximation

A material definition is shared across products. Do not copy the same leather maps into separate hood, harness, belt, or pouch folders.
