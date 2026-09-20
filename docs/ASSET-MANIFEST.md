# 3D Asset Manifest Contract

## Purpose

The application must never depend on accidental Blender node names or model-specific code.

Each production GLB is accompanied by a versioned manifest that tells the renderer how to interpret it.

## Example shape

```json
{
  "schemaVersion": 1,
  "assetId": "welding-hood-001-v1",
  "model": "/assets/models/welding-hood-001.glb",
  "units": "meters",
  "upAxis": "Y",
  "frontAxis": "-Z",
  "rootNode": "SLS_ProductRoot",

  "materialSlots": {
    "LeatherPrimary": ["Shell_Front", "Shell_Left", "Shell_Right", "Shell_Rear"],
    "StitchPrimary": ["Stitching"],
    "HardwarePrimary": ["Rivets", "Buckles"],
    "Lens": ["Visor_Lens"]
  },

  "components": {
    "neckGuard.standard": ["NeckGuard_Standard"],
    "neckGuard.extended": ["NeckGuard_Extended"],
    "visor.standard": ["Visor_Frame", "Visor_Lens"]
  },

  "animations": {
    "visor.open": {
      "target": "Visor_Pivot",
      "property": "rotation.x",
      "from": 0,
      "to": 1.9548,
      "durationMs": 420,
      "easing": "easeInOutCubic"
    }
  },

  "cameraPresets": {
    "hero": {
      "target": [0, 0.12, 0],
      "position": [0.48, 0.23, 0.68],
      "fov": 34
    },
    "rear": {
      "target": [0, 0.12, 0],
      "position": [0, 0.22, -0.82],
      "fov": 34
    }
  }
}
```

## Requirements

### Stable semantic identifiers

Product definitions reference logical manifest keys such as:
- `LeatherPrimary`
- `neckGuard.extended`
- `visor.open`

They must not directly reference arbitrary Blender-generated names.

### Materials

Material variants are separate resources keyed by Scorpion material IDs.

Example:
- SCL-001 — Black Full Grain
- SCL-002 — Brown Full Grain
- SCH-001 — Nickel Hardware
- SCH-002 — Antique Brass

A material variant may define texture URIs and PBR scalar values.

### Components

Every customer-configurable geometric component must have a logical key.

Changing a component should resolve to visibility or replacement behavior through the manifest.

### Mechanical motion

Animation targets must use real pivots and bounded ranges. Application-controlled transitions are preferred for mechanical state.

### Cameras

Camera presets are product metadata, not hardcoded coordinates in React components.

### Validation

At development time, validate that:
- every declared node exists
- every material slot resolves to at least one mesh
- every component target exists
- animation targets exist
- camera presets contain valid values
- no two mutually exclusive components are accidentally visible by default

A bad asset should fail loudly in development instead of silently rendering the wrong product.
