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


## V0.45 capture evidence integrity

V0.45 makes a field-capture handoff verifiable, not merely complete-looking.

### Local SHA-256 identity

Every newly selected reference and supplemental photograph receives a SHA-256 fingerprint in the browser using the Web Crypto API. The digest is stored beside the existing filename/size/timestamp metadata and carried into the validated construction packet.

No source image is uploaded to calculate the digest.

Supplemental files are hashed sequentially rather than in one parallel batch so a field phone does not need to retain multiple full image buffers for hashing at the same time.

### Reattachment verification

After a page reload, source bytes are still detached just as in V0.44. Reattachment now requires identity verification:

- when a saved SHA-256 fingerprint exists, the selected file must reproduce that exact digest;
- a wrong file is rejected even if its filename resembles the original;
- legacy V0.44 drafts without SHA-256 may be upgraded only when filename, byte size and available timestamp metadata match, after which a SHA-256 fingerprint is recorded;
- supplemental sets are reconciled by fingerprint, so the operator may select the same saved files in a different picker order without corrupting their original evidence ordering.

### Verified evidence ZIP

The field bundle index now records the SHA-256 digest for each reference and supplemental source file.

The ZIP also contains SHA256SUMS.txt. That ledger records the SHA-256 digest of every bundle member present before the ledger itself is added, including source images and metadata artifacts. This allows the handoff to be checked after copying, archiving, reconstruction-provider upload/download, or transfer between operators.

The ZIP itself remains a local, stored/uncompressed archive. V0.45 does not add a backend, database, source-photo upload, analytics SDK, or third-party integrity service.


## V0.46 capture quality preflight

V0.46 adds a deterministic local preflight before the first real hood evidence bundle is exported. It intentionally avoids AI blur/exposure scoring until real Scorpion field captures provide evidence for useful thresholds.

### Internal field guidance

The current SLS guidance is:

- first-hood working target: roughly 60–120 sharp source photographs when practical;
- warn below 2 megapixels or a 1080 px short edge;
- recommended resolution level: at least 4 megapixels and a 1440 px short edge;
- JPEG, PNG and WebP are preferred for reconstruction-provider portability;
- unusually tiny files are flagged as possible thumbnails/aggressively compressed derivatives;
- source sets above 1.5 GB receive a device-storage/performance warning;
- source evidence approaching the classic ZIP 4 GB boundary is blocked so the local field archive cannot be represented as safely exportable when it is not.

These thresholds are operational guidance, not claims about universal photogrammetry requirements. Low resolution, cautious format and source-count findings remain warnings so an otherwise valuable field capture is not discarded automatically.

### Objective duplicate blocker

V0.45 already assigns each source image an exact SHA-256 identity. V0.46 uses that identity to detect an important field error: one photograph being reused to satisfy multiple required capture roles.

If the same SHA-256 image is assigned to two or more required roles, Product Capture blocks the field bundle until the evidence is corrected. A duplicate involving an optional/supplemental image is reported as a warning instead because supplemental overlap may be intentional and should not invalidate the authoritative required-role set.

### Local image inspection

When a file is selected or reattached, Product Capture attempts to decode only enough of the local image to record pixel width and height. The result is stored beside its fingerprint and carried into the construction packet and bundle index.

Dimension inspection remains local. If the browser cannot decode a format, the source is retained and flagged for review rather than silently rewritten or uploaded for analysis.

### Field-bundle quality provenance

`capture-bundle-index.json` now records a quality-preflight summary containing the active policy thresholds and observed blocker/warning/resolution/format/duplicate counts. Source index records can also include the measured pixel dimensions.

The evidence ZIP README repeats the preflight summary. Existing source SHA-256 values are reused when generating `SHA256SUMS.txt`, avoiding a second full read/hash pass over 60–120 camera files during export.

The preflight remains dependency-free, local-first and advisory except for objectively invalid evidence conditions such as repeated required-role source identity or archive-size risk.
