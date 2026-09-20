# First Production Asset — Scorpion Leather Welding Hood

## Objective

Create the first production-grade digital twin for Scorpion Leather Studio from a real Scorpion Western Wear leather welding hood.

The final 3D model must reproduce the real product closely enough that a customer can make purchasing and customization decisions from it.

## What to collect from Scorpion

Bring one complete production hood in the exact construction style we intend to sell through the configurator.

Also collect separate physical samples of every leather and hardware finish that should be available in the first launch.

Record the actual SKU/name used internally by Scorpion if one exists.

## Measurement pass

Before photography, record physical dimensions in inches and millimeters where practical.

Minimum hood measurements:
- maximum width
- maximum height
- maximum depth
- visor frame width/height/depth
- lens opening width/height
- visor hinge/pivot location
- rear/neck guard width and length
- strap widths
- leather thickness
- major seam offsets
- rivet diameter
- distance between key hardware points

Photograph the tape/ruler in-frame for several reference dimensions.

## Geometry photography

Use diffuse, even lighting. Avoid strong sunlight, moving shadows, reflective clutter, and portrait-mode processing.

Place the product against a visually simple background with enough contrast to separate the leather edge.

Lock exposure and white balance if the phone/camera allows it.

Capture:

### Full object
- straight front
- front-left 45°
- left
- rear-left 45°
- straight rear
- rear-right 45°
- right
- front-right 45°
- high front
- high rear
- low front
- low rear

### Mechanical states
- visor fully closed
- visor partially opened
- visor fully opened
- close-up of hinge/pivot from both sides

### Construction details
- each seam
- stitch spacing
- rivets/snaps
- visor frame corners
- straps/closures
- interior
- leather edges
- reinforcement layers
- labels or marks actually present on the product

Take overlapping photos around the full object rather than only the minimum views. The first reconstruction target should have 60–120 sharp photographs if practical.

## Material capture

The configurator should eventually use real Scorpion material references rather than generic procedural leather.

For each leather option:

1. Lay a flat sample under soft, even light.
2. Photograph straight-on with the camera parallel to the surface.
3. Include a neutral gray/color reference in at least one calibration shot.
4. Capture a clean high-resolution area without seams or hardware.
5. Capture additional raking-light photographs that reveal grain height.
6. Record the leather's physical type, supplier/code if available, thickness/weight, and customer-facing name.

For each hardware finish:
- photograph front-facing
- photograph at several light angles
- record whether it is nickel, brass, antique brass, blackened metal, etc.
- capture scratches/patina only if they are representative of the actual new product finish

## Capture rules

Do not:
- use beauty filters
- use portrait blur
- heavily sharpen
- alter leather color
- remove real construction features
- photograph a prototype whose construction differs from the product being sold
- mix photographs from different versions of the hood without documenting the difference

## Reconstruction pipeline

Preferred zero/low-cost path:

```
Physical hood
   ↓
Reference photography + dimensions
   ↓
AI/photogrammetry reconstruction trial
   ↓
Blender
   ├── geometry correction
   ├── real-world scale
   ├── topology cleanup
   ├── component separation
   ├── pivots
   ├── UV cleanup
   └── material slots
   ↓
Scorpion PBR materials
   ↓
Web optimization
   ↓
glTF/GLB
   ↓
Asset manifest validation
   ↓
Scorpion Leather Studio
```

AI reconstruction is a starting point, not the authority. The photographs and physical measurements are the authority.

## Required node contract for first hood

The final model should expose stable semantic nodes approximating:

```
SLS_ProductRoot
├── Shell_Main
├── NeckGuard_Standard
├── NeckGuard_Extended
├── Visor_Pivot
│   ├── Visor_Frame
│   └── Visor_Lens
├── Rivets
└── [other verified real components]
```

The final hierarchy can change to reflect the real product, but every configurable or animated component must have a stable manifest-addressable node.

## Acceptance test

The production hood asset is accepted only when:
- proportions match recorded dimensions
- front/rear/side silhouettes match reference photos
- visor rotates around the real hinge location
- configurable components can be independently shown/hidden
- leather colors are calibrated against real samples
- leather looks like leather at close range without exaggerated procedural noise
- hardware reads correctly under the studio lighting
- no invented seams/hardware/details appear
- asset-manifest validation passes
- desktop and mobile browser QA pass
- visual performance remains smooth on a normal smartphone

The current block model in V0.1/V0.2 is not a visual target. It exists only to exercise this contract.
