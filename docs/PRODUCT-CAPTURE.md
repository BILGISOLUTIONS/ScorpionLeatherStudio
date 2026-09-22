# Product Capture and Construction Specification

## Purpose

V0.18 introduces the physical-product capture gate for Scorpion Leather Studio.

The material pipeline proves what a surface should look like. Product Capture proves what the actual product is: its dimensions, silhouettes, construction, moving parts, and semantic model contract.

The tool is intentionally local-first. Selected photographs stay on the operator's device. The browser stores only file metadata in the draft session and exports JSON packets for controlled handoff.

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

The browser can export two artifacts:

1. the raw product-capture session;
2. a validated construction packet with status `ready-for-digital-twin-reconstruction`.

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
