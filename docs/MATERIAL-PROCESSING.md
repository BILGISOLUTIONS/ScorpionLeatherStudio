# Scorpion Material Processing Standard

## Scope

The browser Material Processor is a **draft-map generator and review aid**, not an automatic production-approval system.

Production authority remains:

1. physical sample
2. capture provenance
3. processed master
4. visual/technical QA
5. explicit Material Lab approval

## Input chain

Keep RAW/DNG capture files as the archive master.

Browser processing uses neutral working exports because browser RAW support is inconsistent:

```text
RAW / DNG archive
      ↓
neutral PNG / JPEG / WebP working export
      ↓
/process.html
      ↓
draft base color
draft roughness proxy
draft normal
      ↓
physical-swatch comparison
      ↓
optimized 1K / 2K production derivatives
```

Do not crop or reframe directional exports independently. All six working frames must represent the same sample region.

## Base color

Source: cross-polarized frame.

The processor provides exposure and RGB gain controls for review. These are not a substitute for a proper color-target calibration profile.

The generated average color is useful as a registry preview color only after the image has been visually/calibrationally checked.

## Roughness

The browser processor creates a **roughness proxy** from the normalized luminance difference between:

- cross-polarized diffuse frame
- parallel/reflective frame

It is intentionally tunable and must be compared against the physical sample.

Do not treat the first generated roughness map as measured BRDF data.

## Normal

The draft tangent-space normal is derived from the four directional frames:

- north
- east
- south
- west

The algorithm normalizes the mean exposure of the four frames, computes opposing-light differences, and encodes the result into tangent RGB.

This is suitable for a first web-material draft and texture-scale review. It does not claim calibrated photometric-stereo reconstruction.

## Resolution

Default: **1K**.

2K is available for capable desktop review.

Do not create 4K web maps merely because the source image supports it. Add a higher tier only when on-model QA proves a visible benefit.

## Seam QA

The processor shows a 2×2 repeated base-color preview.

A material is not ready if the repeat reveals:

- hard tile borders
- obvious repeated scars
- directional lighting baked into color
- abrupt color drift
- edge contamination from the capture board

Seamless correction remains an authoring/QA step.

## Export

The processor exports:

- `<material>-1k-basecolor.png`
- `<material>-1k-roughness.png`
- `<material>-1k-normal.png`
- `<material>-processing.json`

or equivalent 2K names.

The processing manifest records:

- material ID
- capture session
- input filenames
- processor parameters
- output filenames
- derived preview color
- mandatory review steps

## Promotion rule

Generated output remains:

```text
captured-master / draft-pbr-review-required
```

until physical comparison and Material Lab QA are complete.

No browser action in the processor may automatically change a material lifecycle to `production-approved`.
