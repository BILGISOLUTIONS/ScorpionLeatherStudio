# Scorpion Leather Studio — Blender Asset Authoring Standard

## Purpose

This document is the modeling-side contract between physical Product Capture and the web Digital Twin QA/runtime.

The physical product and its validated construction packet remain the source of truth. Blender is an authoring tool, not an authority for dimensions, materials, or product options.

## Scene units and axes

- Blender scene units: Metric.
- Unit scale: 1.0.
- 1 Blender unit = 1 meter.
- Production root object: `SLS_ProductRoot`.
- Root location and rotation should be intentionally authored.
- Production root scale must be applied/frozen to `1, 1, 1`.
- Do not use negative scale on runtime-controlled objects.
- SLS manifests use Y-up glTF coordinates and front axis `-Z` unless the specific asset manifest says otherwise.

## Naming

Semantic names come from the construction packet / manifest. Do not rename them because another name looks cleaner in Blender.

Examples:

- `SLS_ProductRoot`
- `Shell_Main`
- `Visor_Pivot`
- `Visor_Frame`
- `Visor_Lens`

Configurable product families should use stable semantic names rather than Blender-generated names such as `Cube.001`.

## Physical UV convention

Material-ready SLS surfaces use physical-scale UV0.

**Default convention: 1 UV coordinate unit = 1 meter of physical surface distance.**

This lets one captured leather material preserve the same grain size on a hood, harness, belt, pouch, or strap.

Do not scale UV islands merely to fill the 0–1 square. Repeatable material UVs are allowed to extend outside 0–1. The Digital Twin QA tool estimates meters-per-UV-unit from the actual candidate model and compares it to the manifest tolerance.

Material capture records the physical width/height represented by one texture tile. The runtime derives texture repeat from that physical tile size rather than guessing grain scale per product.

## UV sets

### UV0

Use for production material mapping.

- required when the material-slot profile says `requiresUv0: true`;
- physical-scale;
- clean seams;
- no unexplained nonuniform stretch;
- leather grain orientation should follow the real cut/orientation when known.

### UV1

Reserved for future lightmap/secondary workflows. Do not depend on UV1 for core material swaps.

## Material slots

A mesh node has one unambiguous runtime material-slot owner.

Typical slots:

- `LeatherPrimary`
- `HardwarePrimary`
- `Lens`

Do not make runtime code infer slots from object-name substrings or Blender material names.

## Customization / tooling zones

Tooling, text, logos and artwork use manifest-defined planar placement zones.

A zone declares:

- semantic target mesh;
- local-space origin;
- local-space surface normal;
- local-space up direction;
- physical width and height in meters;
- safe inset;
- supported purposes.

Placement zones are independent of the repeatable leather UV map. This prevents changing the leather grain scale from moving a name/logo/tooling region.

The Digital Twin QA viewer can render the zones directly over the candidate model. Before approval, verify that each zone:

- lies on the intended physical panel;
- does not cross seams, hinges, rivets, lens openings or fold boundaries;
- has a safe inset appropriate to the real construction;
- has enough usable physical area for the supported customization.

## Geometry

Model enough detail to reproduce the real silhouette and configurable construction, but do not spend triangles on invisible micro-grain that belongs in material maps.

Current production policy is enforced by Digital Twin QA. Keep semantic/configurable pieces separate only when the runtime actually needs them separate.

Use actual thickness where it materially affects silhouette, edge behavior, folds, fit, or construction. Do not convert every photographed seam into geometry if a normal map or texture is the correct representation.

## Mechanical parts

Mechanical motion is manifest-controlled.

For a hinged part:

1. put the pivot at the real physical pivot;
2. keep the moving assembly under a stable semantic pivot node;
3. model open/closed limits from captured mechanical-state references;
4. do not bake a customer-facing animation clip as the only motion source.

## Export

Preferred production delivery: GLB.

Before export:

1. save the Blender source;
2. run `scripts/blender/sls_asset_preflight.py` with the candidate manifest;
3. resolve all reported errors;
4. export GLB with transforms preserved as authored;
5. load the exact exported GLB into Digital Twin QA;
6. inspect Original, UV checker, Normals and Placement zones;
7. pass automated and named human review before promotion.

The Blender script does not approve the asset. Digital Twin QA remains the promotion gate.
