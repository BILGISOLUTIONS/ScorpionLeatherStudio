# Scorpion Leather Studio — Asset Source Strategy

Updated: 2026-09-30

## Purpose

This document defines the approved research and ingestion strategy for external materials, textures, HDRIs, reusable 3D assets, procedural materials, and reconstruction/generation tools used by Scorpion Leather Studio (SLS).

The objective is to reduce unnecessary LiDAR scanning and bespoke photography while preserving a hard boundary between:

- development/reference assets;
- reusable generic assets;
- customer-facing visual approximations;
- production-authoritative Scorpion captures and measurements.

External assets must never silently become product/manufacturing truth.

## Source classes

### Tier A — preferred open / CC0 sources

These are the best default sources because commercial use is clear and local vendoring is generally permitted.

| Source | Useful content | License / access note | SLS role |
| --- | --- | --- | --- |
| Poly Haven | PBR textures, HDRIs, 3D models | Assets are CC0. Public API is free for commercial use; live-API integration requires lightweight source credit. | Primary automated source. |
| ambientCG | PBR materials, HDRIs, models, some MaterialX/OpenPBR content | Assets are CC0. | Primary manual/vendor source; evaluate API/metadata paths separately. |
| cgbookcase | PBR textures up to high resolution; leather/fabrics available | CC0. | Strong material source. |
| TextureCan | PBR textures, including leather/fabric | CC0; redistribution with projects allowed. | Strong material source. |
| 3DTextures.me | PBR/seamless textures, including leather | CC0. | Secondary material source. |
| Texture Ninja | Public-domain/CC0 source photos and surface references | CC0; mainly photographic texture source rather than full calibrated PBR. | Map-generation/reference input. |
| OpenGameArt CC0 packs | Lightweight texture packs, including leather/synthetics | Per-asset license must be filtered to CC0. | Prototype / low-cost material source. |
| cc0-textures.com | Search/index of CC0 textures, including leather | Treat as discovery/index; verify the linked/original source when practical. | Discovery only unless origin is clear. |

### Tier B — useful but license-constrained sources

These can accelerate SLS but require source-specific handling. Raw files must not be redistributed when the license forbids it.

| Source | Useful content | Key restriction | SLS role |
| --- | --- | --- | --- |
| AITextured | PBR textures and PBR map generation | Commercial project use allowed under FCL, but raw texture redistribution is prohibited; individual source/provenance records may be marked unverified. | Research/development; only ingest records with acceptable provenance. |
| Blendkit / BlenderKit | Large model/material/HDRI/brush library, including procedural leather | Assets may be Royalty Free or CC0. RF assets cannot be resold as assets; per-asset license must be recorded. | Blender authoring/reference; prefer CC0 entries when available. |
| Adobe Substance 3D Assets | Large parametric/scanned material library including leather, suede, fabrics, metals | Commercial use allowed in Larger/Modified Works; standalone asset redistribution prohibited. | High-quality authoring source; do not expose raw SBS/SBSAR files in SLS downloads. |
| Fab / Quixel Megascans | Scanned materials, textures, decals, models | Fab Standard License allows commercial projects but forbids standalone redistribution. | Optional high-fidelity source for baked/embedded derivatives after license review. |
| Textures.com | Photos/PBR/materials/scans | Commercial use supported, but redistribution and some bundling rules are restrictive and asset-type specific. | Selective internal authoring source. |
| Poliigon | Premium textures/models/HDRIs | Commercial use varies by license; redistribution, even modified/baked assets in many cases, is restricted. | Internal reference/render source only unless SLS deployment terms are confirmed compatible. |
| FreePBR | PBR texture library | Free use is non-commercial; a paid commercial license is required and source redistribution remains restricted. | Low-priority optional source. |
| Architextures | Procedural/seamless materials | Commercial use requires active Pro entitlement and content has restrictive publishing/automation terms. | Low priority for SLS. |

### Discovery / aggregation

3Dassets.one is useful as a discovery engine across many free asset providers. It must not become the authority for license metadata: SLS should follow the asset back to the origin and record the original source/license before ingestion.

## Programmatic acquisition opportunities

### Poly Haven

Poly Haven is especially valuable because its public API can return:

- asset listings;
- categories/tags;
- maximum resolution;
- physical dimensions for textures where available;
- thumbnails;
- file manifests and download variants;
- models, textures, and HDRIs.

This makes it a strong candidate for the first automated SLS source connector.

SLS should download chosen assets into its own controlled source store instead of depending on the live API at storefront runtime.

### Sketchfab

Sketchfab exposes a Download API for downloadable models and reports more than one million free models under Creative Commons licenses. The API requires Sketchfab user authentication and asset licenses vary.

SLS may use Sketchfab as an optional geometry-source connector, with these safeguards:

- whitelist commercial-compatible licenses only;
- reject NC licenses for client/commercial use;
- preserve attribution when required;
- store the exact model UID and license;
- never treat a third-party model as a Scorpion product unless it is only a disposable authoring scaffold.

### Manual-only sources

ShareTextures explicitly prohibits automated downloads/scraping even though its assets are CC0-based. Similar website restrictions must be respected independently from the asset license.

SLS must distinguish **asset license** from **site/API access terms**.

## Material authoring / generation tools

### Material Maker

Open-source procedural material authoring with PBR graph workflows and a community library whose entries expose licenses including CC0, CC-BY, and CC-BY-SA.

Use cases:

- neutral leather grain generators;
- procedural micro-grain;
- roughness breakup;
- scratches/creases;
- edge wear masks;
- repeatable structure generation without storing large source bitmaps.

### MaterialX / OpenPBR

MaterialX is an open ASWF standard under Apache 2.0. SLS should treat MaterialX/OpenPBR as an interchange/reference layer rather than replacing the existing web runtime immediately.

Benefits:

- portable material definitions;
- deterministic parameter names;
- easier import from Poly Haven/ambientCG/AMD libraries;
- possible future offline conversion to SLS glTF/KTX2 material recipes.

### AMD GPUOpen MaterialX Library

Free, permissively licensed MaterialX examples can serve as shader/reference content. Verify the license on the exact material before vendoring.

### Adobe Substance 3D Sampler

Image to Material can derive Normal, Height, Roughness and other channels from one source image. This is useful for converting an ordinary phone photo of a Scorpion leather swatch into a first-pass PBR material.

Generated channels remain estimates, not measurements. Physical size and appearance still require SLS calibration/QA before production promotion.

### PhysicallyBased.info

Use as a reference database for physically-based material parameters such as roughness/IOR/coating values. These are starting points and validation aids, not a replacement for measured Scorpion materials.

## Geometry sources and reconstruction shortcuts

The goal is not to eliminate all product-specific capture. The goal is to avoid full scanning when a cheaper input can produce an adequate customer-facing digital twin.

### Reusable asset libraries

- Poly Haven models: CC0; strongest unrestricted option.
- Blendkit models: large library, per-asset RF/CC0 license.
- Sketchfab downloadable models: large Creative Commons catalog; filter strictly by commercial compatibility and attribution requirements.
- Fab assets: commercially usable under Fab Standard License, but no standalone redistribution.

Use generic assets mainly for components, staging, test fixtures, and base shapes. Do not relabel a generic third-party product model as an exact Scorpion product.

### Phone-photo photogrammetry

RealityScan is free for individuals/small businesses under USD 1 million annual revenue and provides the full feature set. This is a strong no-LiDAR fallback when accurate geometry matters.

Polycam Photo Mode can create photogrammetry from uploaded photos/video and can capture finer visual detail than LiDAR in some use cases.

Meshroom is free/open-source photogrammetry and is suitable for offline reconstruction when we want to keep source images local.

A practical SLS capture path can therefore be:

```text
phone camera
  -> 20–80 controlled photos
  -> RealityScan / Meshroom
  -> mesh cleanup + retopo
  -> SLS semantic slots / UV standard
  -> Material QA
```

This still uses photography, but it removes the need for a dedicated LiDAR scanner and can be reserved for products where geometry fidelity justifies it.

### Local image-to-3D AI

#### TripoSR

- MIT licensed.
- Single-image reconstruction.
- Default inference uses roughly 6 GB VRAM.
- Can bake a texture.

This is the best current local SLS experiment for an 8 GB consumer GPU and can quickly create an authoring scaffold from one product image.

#### InstantMesh

- Apache 2.0.
- Single-image mesh generation.
- Useful alternative for local/controlled experimentation.

#### Microsoft TRELLIS

- MIT for the main model/code with submodule caveats.
- Strong image/text-to-3D research path.
- Official requirement is at least 16 GB GPU memory, so it is not the default local SLS option on an 8 GB GPU.

#### Stable Fast 3D

- Stability AI Community License.
- Commercial use is available under the license for organizations under its USD 1 million revenue threshold, with registration/notice requirements.
- Optional alternative where its license terms fit.

### Hosted image-to-3D services

Meshy and Tripo can produce product geometry rapidly from images.

For Meshy, paid users retain private ownership of generated assets; free-plan outputs are CC BY 4.0 and require attribution.

For Tripo's hosted service, paid users receive commercial rights; free-user rights are more restrictive.

Hosted tools should be optional authoring accelerators. Product/source images must be content SLS is authorized to upload.

## Scorpion product-fidelity strategy

SLS should classify geometry into four authority levels.

| Level | Description | Customer use | Manufacturing use |
| --- | --- | --- | --- |
| G0 — generic scaffold | Third-party or procedural base geometry | Development only | Never |
| G1 — AI/reference twin | Image-to-3D or manually fitted approximation | Customer visual preview with disclosure where necessary | Never |
| G2 — calibrated visual twin | Product-specific photos + dimensional calibration + QA | Normal customer configurator | Not manufacturing authority by itself |
| G3 — production twin | Measured/scanned/reconstructed and validated against real product | Customer + internal QA | May support manufacturing only when the workshop contract explicitly authorizes the measured fields |

This lets us avoid expensive capture for every SKU while keeping precision where it matters.

## Recommended family-reuse model

Instead of scanning every product variant:

```text
product family master geometry
  + size/shape parameters
  + interchangeable components
  + material structure
  + dye
  + finish
  + tooling/text/artwork layers
  + SKU-specific measurements/photo calibration
  = SKU visual twin
```

Examples:

- welding hoods: one or a few construction masters, variant visor/hardware/trim/material bindings;
- belts: parametric length/width/taper/hole/buckle families;
- radio harnesses: reusable strap/pouch/hardware components with product-specific dimensions;
- pouches: reusable gusset/flap/closure templates;
- straps: almost entirely parametric;
- gloves/boots/apparel: use family base meshes and product-specific silhouettes/materials, escalating to photogrammetry only for hero/high-volume products.

## V0.35 ingestion architecture

The first implementation should create a source-agnostic manifest rather than hardcoding TextureCan.

Proposed fields:

```text
sourceProvider
sourceAssetId
sourceUrl
sourceLicense
sourceLicenseUrl
sourceAccessMethod
sourceAcquiredAt
sourceArchiveSha256
sourceMapSha256
sourceResolution
sourcePhysicalDimensions
sourcePhysicalScaleConfidence
mapSet
normalConvention
colorSpace
derivativePolicy
productionAuthority
notes
```

Pipeline:

```text
approved source
  -> license/provenance gate
  -> local source archive
  -> map discovery/normalization
  -> optional neutralization / procedural derivation
  -> physical-scale status
  -> 1K development derivative
  -> KTX2 compression + validation
  -> SLS material manifest
  -> Material Lab
  -> QA
  -> optional later 2K promotion
```

## Initial source priority

1. Poly Haven API — automate first because metadata, CC0 license, physical dimensions, textures/models/HDRIs and download manifests are unusually clean.
2. ambientCG — high-value CC0 PBR library and MaterialX/OpenPBR compatibility.
3. cgbookcase — excellent CC0 leather/fabric PBR source.
4. TextureCan — good CC0 leather assortment already identified.
5. 3DTextures.me — secondary CC0 material source.
6. Texture Ninja — source-photo library for building maps/materials.
7. Blendkit — procedural leather and reusable Blender geometry, preferring CC0 entries.
8. Sketchfab — optional model connector after commercial-license filtering/attribution is implemented.
9. Adobe Substance Assets / Sampler — premium parametric/material-generation lane.
10. AITextured — development/PBR-generator lane with per-asset provenance caution.
11. Fab/Megascans, Textures.com, Poliigon — useful selective sources under stricter deployment/redistribution controls.

## Non-negotiable rules

- Never scrape a provider whose terms forbid automated download.
- Never infer that "free" means commercially redistributable.
- Never ship a restricted raw asset merely because SLS transformed its filename or format.
- Never claim a generated/third-party material is a photographed Scorpion material.
- Never use an AI/reference mesh as manufacturing authority.
- Prefer CC0 sources for anything that must ship inside a browser bundle.
- Store provenance/checksums before processing.
- Prefer 1K web derivatives first; only promote to 2K/4K when visual QA justifies the resource cost.
- Source physical scale is authoritative only when the provider supplies dimensions or Scorpion calibrates it.
- Product-family reuse should be preferred over per-SKU full reconstruction.
