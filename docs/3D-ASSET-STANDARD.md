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


## Material-ready surface contract

A production digital twin is not considered material-ready merely because a texture can be assigned in Three.js. Every runtime-swappable surface must have an explicit contract.

For each material slot:

- mesh ownership must be unambiguous; one semantic mesh node cannot belong to multiple material slots;
- the manifest declares the expected material kind: leather, metal, glass, or generic;
- the manifest declares whether UV0 coordinates are required;
- the manifest declares whether vertex normals are required;
- tangent policy is explicit: optional, recommended, or required;
- runtime material assignments are validated against the declared material kind;
- Digital Twin QA inspects the actual loaded model attributes instead of trusting authoring notes.

The current web renderer uses UV0 for texture mapping. Do not depend on product-specific substring matching or corrective UV logic in the customer application.

## Capture-to-authoring scaffold

The Product Capture tool now records required material slots alongside semantic construction nodes. Once the physical-evidence gate passes, the capture package can generate a deterministic asset-manifest scaffold that carries:

- the confirmed product root;
- confirmed material slot ownership;
- default material registry IDs;
- UV/normal/tangent readiness requirements;
- confirmed configurable component mappings;
- camera starting points derived from the measured physical envelope;
- ground, shadow, and orbit-control starting values.

The scaffold is an authoring contract, not an approval. Product silhouette, topology, UV quality, camera composition, mechanical pivots, and real material response must still be authored and reviewed.

## Diagnostic material QA for 3D assets

Digital Twin QA now records mesh-level readiness data:

- triangle count by mesh;
- material count by mesh;
- UV0 presence;
- UV1 presence;
- vertex-normal presence;
- tangent presence.

The local model viewer also supports UV-checker and normal diagnostic views. These exist specifically to catch stretched mapping, missing coordinates, bad seams, and shading problems before a GLB is promoted.

## Runtime configuration binding

Customer construction choices may affect the 3D view only through explicit material-slot or component bindings. The renderer accepts controlled overrides on top of the photographed starting build and validates the resulting material assignment.

Development examples such as brass/nickel hardware previews remain visual references until the physical availability and production material records are confirmed.

The long-term product path is therefore:

**physical product → evidence-backed capture packet → material-slot contract → authored GLB → automated/human Digital Twin QA → controlled production promotion → customer configuration**


## Physical UV scale

Scorpion Leather Studio material-ready meshes use a real-world UV convention:

**1 UV coordinate unit = 1 meter of physical surface distance.**

This is intentionally different from the common practice of scaling every island to fill the 0–1 square. Repeatable leather UVs may extend outside 0–1.

The asset manifest can declare:

- `metersPerUvUnit`;
- `uvScaleToleranceRatio`.

Digital Twin QA estimates physical meters per UV unit from the exported model and blocks material surfaces that fall outside the declared tolerance. It also reports uneven UV scale so stretched leather grain is visible before promotion.

The physical material record separately stores the millimeter dimensions represented by one texture tile. Those two contracts combine to keep one leather's grain at the same real-world size across a hood, harness, belt, pouch, strap, or other product.

## Customization placement zones

Repeatable material UVs are not the coordinate system for tooling, names, logos, or uploaded artwork.

Customization is authored through manifest placement zones that declare:

- target semantic mesh;
- local origin;
- local surface normal;
- local up direction;
- physical width/height;
- safe inset;
- allowed purposes: tooling, text, logo, artwork.

This keeps material scale independent from personalization placement and lets Digital Twin QA visualize the intended usable area directly on the candidate model.
