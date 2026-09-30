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


## Structure × Dye × Finish

Scorpion Leather Studio treats three different concepts separately:

1. **Structure** — the physical hide/grain response carried by calibrated base-color/detail, normal, roughness and optional AO maps.
2. **Dye** — a controlled color multiplier that is permitted only when the structure was captured/prepared as a neutral tintable base.
3. **Finish** — bounded changes to roughness, sheen, clearcoat and normal response.

A photographed colored leather is **locked**. The renderer must not recolor it and imply that an arbitrary dye is physically accurate. A dye selection becomes eligible only on a neutral/tintable capture that has passed material QA.

This lets one approved structural capture support multiple verified dye recipes later without storing redundant normal/roughness maps for every color.

The development Material Lab intentionally distinguishes:
- photographed/captured reference structures;
- development-only neutral tint studies;
- production-approved material recipes when those become available.

The Material Lab is visual sandbox state and is not silently written into the customer's order request.

## Automated KTX2 build

Use the repository builder:

```bash
npm run material:ktx2 -- --manifest path/to/material.ktx2.json
```

Dry-run a build plan without requiring the KTX tools:

```bash
npm run material:ktx2 -- --manifest path/to/material.ktx2.json --dry-run
```

The build manifest format is demonstrated in `docs/examples/material-ktx2.example.json`.

Current policy:
- base color -> BasisLZ / ETC1S-compatible KTX2 in sRGB;
- normals -> UASTC LDR 4x4, linear, normalized;
- roughness/AO -> UASTC LDR 4x4, linear data;
- mipmaps generated offline;
- every output passes `ktx validate --gltf-basisu`;
- successful builds emit byte size + SHA-256 provenance in a JSON build report.

The script uses the modern Khronos `ktx` CLI and never shells through interpolated command strings.


## CC0 development texture source library

External PBR libraries may be used to accelerate renderer and material-system development, but they are not physical Scorpion material authority.

TextureCan is currently approved as a **development-source library** because its published Terms of Use state that its PBR textures are released under CC0 1.0, permit commercial use, require no attribution, and may be redistributed with projects.

Initial useful leather candidates:

- TextureCan `Fabrics 0067` — Calf Leather: general leather grain/wrinkle development structure.
- TextureCan `Fabrics 0063` — Synthetic Leather Fabric: fine crack/grain study and a useful candidate for a neutralized tintable development base.
- TextureCan `Fabrics 0073` — Brown Alligator Leather Fabric: exotic-scale development structure.
- TextureCan `Fabrics 0045` — Brown Leather Texture: fine scale/bump structure for general renderer testing.
- TextureCan `Fabrics 0054` — Waxy Reddish-Brown Fabric Leather: optional wear/roughness stress test, not a default customer material.

Source pages:

- https://www.texturecan.com/details/455/
- https://www.texturecan.com/details/404/
- https://www.texturecan.com/details/503/
- https://www.texturecan.com/details/300/
- https://www.texturecan.com/details/386/
- https://www.texturecan.com/terms/

### Ingestion rules

1. Prefer 1K derivatives for initial browser development; promote 2K only after visual QA demonstrates a material benefit on desktop hardware.
2. Download and vendor approved derivatives into the SLS asset pipeline. Do **not** hotlink TextureCan at storefront runtime.
3. Record source site, source asset ID/page, license, acquisition date, original archive checksum, and derivative checksums.
4. Treat source physical tile scale as **unknown** unless the source supplies a reliable measurement. A CC0 texture must not be promoted to production merely because it is seamless or visually convincing.
5. Neutralize/tint source color only for explicitly development-only composition studies. Do not represent generated dyes as photographed Scorpion colors.
6. Stitched, quilted, tufted, woven, padded, nailed, or otherwise construction-bearing textures are not generic leather grain. Use them only when the real product construction contains that physical pattern.
7. Real Scorpion capture, measured scale, material QA, and controlled promotion remain required before a material becomes production-authoritative.

The preferred long-term flow remains:

```text
CC0 / procedural development source
  -> local development material
  -> renderer / UX validation
  -> real Scorpion material capture
  -> measured PBR maps
  -> Material QA
  -> production promotion
```
