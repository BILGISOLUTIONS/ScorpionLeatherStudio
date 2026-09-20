# Scorpion Leather Studio — 3D Asset Standard

## Core rule

Digitize the real Scorpion product. Do not redesign it.

The purpose of the 3D asset is to let a customer inspect and configure an authentic Scorpion Western Wear product, not an AI interpretation of one.

## Product fidelity

Preserve the confirmed real-world:
- overall silhouette and proportions
- panel construction
- leather thickness/behavior
- seams and stitch paths
- rivets/snaps
- buckles and other hardware
- pockets
- embossing/tooling
- visor/frame assemblies
- straps
- edges
- material/color variation
- other identifiable construction details

Do not invent:
- logos
- stitching patterns
- hardware
- decorative tooling
- pockets
- labels
- materials
- seams
- geometry that is not supported by the reference product

When references are ambiguous, preserve only what can be confirmed.

## Reference capture

For each production product, capture enough reference material to reconstruct the object reliably:
- front
- rear
- left
- right
- three-quarter views
- top/bottom when relevant
- interior
- hardware close-ups
- seams/stitching
- key dimensions
- component open/closed states
- leather/material samples

Use consistent lighting for material capture where possible.

## Model format

Production web assets should be delivered as glTF 2.0 / GLB.

The asset pipeline may use Blender or other authoring formats internally, but the application-facing contract is GLB plus an asset manifest.

## Coordinate conventions

Adopt one convention for every product:
- Y up
- product centered around a documented logical origin
- real-world scale
- front direction documented in the manifest
- pivots located at real mechanical rotation points when animated

Never repair orientation/scale independently in arbitrary UI code per product.

## Mesh naming

Mesh and node names are an API contract. Use stable semantic names rather than Blender defaults.

Example:

```
SLS_ProductRoot
  LeatherShell
    Shell_Front
    Shell_Left
    Shell_Right
    Shell_Rear
  Visor
    Visor_Pivot
      Visor_Frame
      Visor_Lens
  Hardware
    Rivets
    Buckles
  Stitching
  NeckGuard
```

The exact hierarchy will vary by product; semantic stability is mandatory.

## Configurable components

Any geometry controlled by the configurator must be independently addressable through the manifest.

Examples:
- short vs extended neck guard
- alternate pocket
- visor type
- strap assembly
- hardware set
- reinforcement panel

Do not make runtime code traverse meshes by guessed substring unless explicitly supported by the manifest contract.

## Materials

Use physically based materials.

Typical maps:
- base color
- normal
- roughness
- metallic where relevant
- ambient occlusion where it materially helps
- optional height/displacement only when performance permits

Leather must retain authentic grain and variation without exaggerated gloss or procedural noise that changes the product's identity.

Black remains true black; brown/tan variants must reproduce photographed samples accurately.

Hardware must retain the correct finish rather than generic mirror-metal behavior.

## Material variants

Equivalent variants should keep:
- UV layout
- model scale
- camera framing
- lighting assumptions
- material slot naming

so customers can compare colors/materials without visual jumps.

## Texture budget

Author high-quality masters, then produce web-optimized derivatives.

The asset manifest should declare production texture tiers. Avoid making every texture 4K by default; resolution should be driven by on-screen texel density and mobile memory budgets.

Use modern compression/transcoding where supported by the finalized toolchain.

## Geometry budget

Keep silhouette-defining geometry. Spend polygons on:
- edges that affect silhouette
- folds/shape that affect identity
- hardware
- mechanical components

Bake micro-detail such as grain and fine surface relief into material maps where appropriate.

LOD strategy should be introduced if real product meshes require it.

## Mechanical animation

Prefer deterministic application-controlled mechanical motion over canned decorative animation.

Examples:
- visor rotating around its real hinge
- component separation for exploded view
- buckle/strap state changes where needed

Animation pivots and valid ranges must be documented in the manifest.

## QA before acceptance

A production asset is not accepted until checked for:
- real-world proportions
- product reference fidelity
- correct scale/orientation
- correct pivots
- stable node names
- missing/inverted normals
- UV problems
- texture seams
- material realism
- mobile rendering performance
- configuration-state correctness
- no invented product features

Final acceptance is visual and functional, not merely “the GLB loads.”
