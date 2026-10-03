# Product Capture and Construction Specification

## Purpose

V0.18 introduces the physical-product capture gate for Scorpion Leather Studio.

The material pipeline proves what a surface should look like. Product Capture proves what the actual product is: its dimensions, silhouettes, construction, moving parts, and semantic model contract.

The tool is intentionally local-first. Selected photographs stay on the operator's device. Draft persistence stores only file metadata; source-photo bytes remain attached only in the active browser session. V0.44 can package those live source files with the validated capture metadata into one local field-evidence ZIP without uploading them to SLS.

## Pipeline

```
Physical Scorpion product
        ↓
Product Capture
        ↓
Validated construction packet
        ↓
Digital-twin reconstruction / Blender
        ↓
GLB + asset manifest
        ↓
Asset QA / promotion
        ↓
Customer configurator
```

A validated capture packet does not modify production assets and does not claim the 3D model is approved.

## First capture plan

The first plan targets the Scorpion leather welding hood described in `FIRST-PRODUCT-CAPTURE.md`.

Required reference coverage includes:

- full front, rear, left and right views
- four 45-degree views
- high and low front/rear views
- visor fully closed and fully open
- both visor hinges
- interior construction
- at least one ruler/tape scale reference

Optional close-ups cover seams, hardware and leather edges.

## Physical dimensions

All authoritative dimensions are stored in millimeters in the exported packet.

The welding-hood plan requires:

- maximum width, height and depth
- visor frame width, height and depth
- lens-opening width and height
- rear/neck-guard width and length
- strap width
- leather thickness
- rivet diameter
- one key hardware-spacing measurement

A required measurement must be a positive finite value. No dimension is inferred from photographs.

## Semantic node contract

The capture plan also establishes the minimum semantic nodes the production model must expose:

- product root
- main shell
- visor pivot
- visor frame
- visor lens

Suggested node names are starting conventions only. The operator/modeler must explicitly confirm them before the construction packet can be exported.

This prevents application code from depending on accidental Blender or reconstruction-tool names.

## Validation behavior

The validator refuses a reconstruction-ready packet when:

- capture-plan identity does not match
- product ID, label, category, operator or timestamp is missing
- any required reference photograph is absent
- required dimensions are absent or invalid
- required semantic nodes are not confirmed
- confirmed node names collide
- component or material-slot evidence points at a missing capture frame
- confirmed component/material records omit their required IDs or node references

## Export

The browser can export four controlled artifacts:

1. the raw product-capture session;
2. a validated construction packet with status `ready-for-digital-twin-reconstruction`;
3. a physical-capture `production-candidate` asset-manifest scaffold;
4. a local field-evidence ZIP containing the actual attached source photographs plus the three metadata artifacts above and a deterministic capture-file index.

The packet preserves:

- capture session provenance
- reference-file coverage
- authoritative dimensions in millimeters
- semantic node contract
- component records
- material-slot records
- operator notes

It always sets:

```json
{
  "automaticAssetMutation": false
}
```

Production GLB/manifests remain subject to their own asset validation and QA gate.


## V0.44 field evidence bundle

The field-evidence ZIP closes the gap between "capture metadata exists" and "the actual source photographs are still available."

### Live-file rule

Browser storage cannot safely persist arbitrary local photo bytes. Therefore:

- draft metadata may survive a reload;
- the UI distinguishes live attached source files from restored metadata-only entries;
- a metadata-only reference must be reattached before the evidence ZIP can be built;
- selected optional reference slots are held to the same rule so the bundle cannot claim a source file that is absent;
- supplemental reconstruction photos are also reattached as a set after a reload.

This prevents a capture record from appearing complete while its source evidence has silently disappeared from the active browser session.

### Supplemental reconstruction set

The fixed welding-hood capture-plan roles remain the minimum evidence contract. V0.44 also supports a multi-file supplemental set for overlapping orbit photographs and construction details.

For the first real hood, use the required role photos plus enough sharp supplemental images to reach roughly 60–120 source photographs when practical. Supplemental coverage does not replace required views or physical measurements.

### ZIP contents

A bundle contains:

```text
README.txt
metadata/
  capture-session.json
  construction-packet.json
  asset-manifest-scaffold.json
  capture-bundle-index.json
references/
  01-front.jpg
  ...
supplemental/
  001-...
  ...
```

The index records original filenames, deterministic archive paths, byte sizes, MIME types and modification timestamps. The ZIP uses stored/uncompressed entries because camera images are already compressed; recompressing them would waste field-device CPU and battery for little or no size reduction.

The ZIP writer is dependency-free and loaded only when the operator requests a bundle, so ordinary Product Capture startup remains lightweight.
