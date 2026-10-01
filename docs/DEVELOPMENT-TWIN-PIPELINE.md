# Scorpion Leather Studio — Development Digital-Twin Pipeline

## Purpose

This pipeline gives Scorpion Leather Studio useful product-specific 3D geometry before a product has enough physical evidence for a production digital twin.

It is intentionally conservative: generated geometry improves customer-preview silhouette and material behavior, but it never becomes manufacturing authority by implication.

## Authority levels

- **G1 development twin** — coarse blockout used to prove renderer, material, camera, and configuration contracts.
- **G2 development twin** — product-family-specific approximation with plausible leather thickness, rounded panels, bowed straps, pouch volume/openings, and explicit hardware placeholders.
- **G3 evidence-backed twin** — reconstructed from sufficient multi-angle photography, measured dimensions, verified construction, and named review. G3 is the first level intended to approach production-grade product fidelity.

Photographed Scorpion products and verified physical measurements remain authoritative until an asset has passed the evidence and Digital Twin QA gates.

## V0.37 generated G2 assets

`scripts/generate-development-product-twins.mjs` deterministically generates one glTF per current non-hood leather family:

- tool belt
- tool pouch set
- work harness
- radio harness
- carpenter pouch
- thigh protector
- cooler strap

Generated assets live under `apps/configurator/public/models/development-g2-*.gltf` during dev/build and are intentionally ignored by Git.

The split is deliberate. A customer opening one family's 3D tab downloads only that family's twin instead of a combined all-products payload.

## Runtime/resource contract

The generator runs offline during development/build; no geometry is synthesized in the customer browser.

Use:

```bash
npm run twins:generate
npm run twins:check
npm run gltf:validate
```

`npm run dev` and `npm run build` generate the assets automatically. CI also regenerates, verifies deterministic output, and runs the embedded-buffer/bounds validator over the generated glTF files.

The runtime remains lazy: photographed product imagery is still the default customer view, and Three.js/model loading starts only when Interactive 3D is requested.

## Geometry rules

G2 may use reusable procedural primitives only where the reference product supports the class of construction being represented. Current primitives include:

- thin rounded leather panels;
- bowed straps with real thickness;
- tapered/convex pouch bodies with an opening edge;
- simple buckle/frame hardware;
- rivet clusters where the current product references/manifests already establish rivet hardware.

Do not add decorative stitch paths, logos, tooling, pockets, hardware, seams, or construction details merely to make the model look more finished.

## Scale and UV policy

G2 uses approximate meter-scale dimensions for coherent camera/material behavior; those dimensions are not verified product measurements.

Generated leather surfaces carry UV0 coordinates in an approximate physical-scale convention so one material recipe does not arbitrarily change grain size between product families. Exact production UV scale must still be validated against evidence-backed geometry during G3 authoring.

## Customization zones

G2 does not expand customization authority. Each manifest maps only the placement surface currently represented with enough confidence. Other customer-requested placements remain order-only/unmapped until the corresponding surface is properly modeled and reviewed.

## Promotion to G3

A family should move from G2 to G3 only when enough evidence exists to improve fidelity without inventing details. Prefer:

1. front/rear/side/three-quarter product photographs;
2. overall width/height/depth and important strap/panel measurements;
3. close-ups of openings, folds, seams, edges, buckles, rivets/snaps, and attachment points;
4. Blender reconstruction or validated scan/retopology where justified;
5. applied/frozen transforms and semantic mesh names;
6. exact material-slot ownership and physical UV0 review;
7. customization zones fitted to the actual surface;
8. automated Digital Twin QA plus named visual review on desktop/mobile.

LiDAR/photogrammetry is optional, not a prerequisite. Use it when it materially increases fidelity or dimensional confidence.
