# Scorpion Leather Studio — Production PBR Material Pack

## Purpose

This is the file-delivery contract for real swappable leather materials used by Scorpion Leather Studio.

The renderer already supports dynamic material replacement. The quality of the result therefore depends on two independent assets:

1. a correct real-world-scale UV-mapped product GLB;
2. a calibrated material pack.

Neither may be replaced by an AI concept image.

## Master material capture

Capture the actual leather under controlled conditions. For field-captured Scorpion material, preserve the existing six-frame capture workflow:

- cross-polarized diffuse frame;
- parallel/reflective frame;
- directional north;
- directional east;
- directional south;
- directional west;
- physical scale reference.

Keep the full-resolution master capture outside the web bundle.

## Production maps

Required for production leather:

- `basecolor` — shadow-free diffuse color in sRGB;
- `normal` — tangent-space normal in linear data space;
- `roughness` — linear grayscale/data texture.

Optional when physically justified:

- `ao` — local occlusion/cavity response. Do not use AO to fake lighting that should come from geometry/environment.

Metallic leather should normally remain zero. Hardware is a separate material slot.

## Physical scale

Every material stores the physical width/height represented by one tile. SLS product UV0 uses the convention:

```text
1 UV unit = 1 meter of real surface distance
```

For a 250 mm × 250 mm captured tile, runtime repeat is derived as 4 × 4 per meter. Do not hand-tune repeat separately on each product.

## Web derivatives

Keep lossless/high-bit-depth masters for authoring and QA. Produce separate web derivatives after approval.

Recommended runtime hierarchy:

```text
/materials/<MATERIAL-ID>/
  1k/
    basecolor.ktx2
    normal.ktx2
    roughness.ktx2
    ao.ktx2              # optional
  2k/
    basecolor.ktx2
    normal.ktx2
    roughness.ktx2
    ao.ktx2              # optional
```

Fallback WebP/PNG derivatives may be kept while the KTX2 conversion pipeline is being proven. Do not delete master maps.

### KTX2 encoding guidance

- Base color: ETC1S can be appropriate when visual QA passes; use sRGB sampling.
- Normal maps: prefer UASTC or another quality-preserving KTX2 path; compression artifacts in normals are immediately visible under raking light.
- Roughness/AO: data maps; preserve linear values.
- Never ship a compressed derivative until it has been compared against the approved master in Material QA and on the real product model.

## Runtime behavior

Changing leather must not reload the GLB. The existing semantic leather material slot remains on the model while Three.js asynchronously loads and replaces its maps.

The renderer:

- keeps the product mesh loaded;
- applies the selected material to the declared slot;
- configures physical texture repeat from material measurements;
- supports standard image textures and `.ktx2`;
- uses local Basis transcoder assets;
- renders against a PMREM studio environment;
- invalidates only when async texture state changes.

## Exotic hides

Gator, caiman/crocodilian, ostrich and other strongly structured hides need special authoring attention.

A single blindly tiled square is not always sufficient. If the real product uses distinct regions of a hide, author separate material zones or a product-specific mapped texture where required by the actual cut. Do not procedurally invent scale-size transitions that are not supported by the physical product.

Normal maps carry most web-scale relief. Use geometry only for silhouette-relevant relief; avoid dense displacement for micro-grain on the customer storefront.

## Acceptance

A leather pack is not production-ready because the maps load.

Approval requires:

- measured tile size;
- color match to physical sample;
- seam/tile review;
- normal direction/strength review;
- roughness response review under PBR environment lighting;
- compressed-vs-master comparison;
- mobile memory/performance check;
- real product GLB review at multiple camera angles.
