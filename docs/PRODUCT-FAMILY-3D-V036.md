# V0.36 Product-Family 3D and Procedural Leather

V0.36 extends Interactive 3D from the welding hood to every current Scorpion Leather Studio family: welding hood, tool belt, tool pouch set, work harness, radio harness, carpenter pouch, thigh protector, and cooler strap.

The seven newly generated models are **G1 visual-reference twins**. They provide product-family silhouette, material visualization, camera controls, and mapped customization zones. They are not measurements, cut patterns, manufacturing geometry, fit guarantees, or proof that a requested construction is available. The photographed Scorpion catalog product remains visual authority.

The family assemblies reuse compact UV-mapped box/cylinder geometry embedded in each tiny glTF. Each family still has semantic named nodes, material ownership, cameras, and customization zones.

Two deterministic development PBR structures are included: Fine Grain Development Leather and Pebbled Grain Development Leather. The renderer generates neutral base-color microvariation, tangent-space normal detail, and roughness variation from a fixed seed; the existing Structure × Dye × Finish compositor applies development dye/finish concepts over those surfaces.

These structures remain reference-only/unverified and can later be replaced by locally vendored CC0 or calibrated Scorpion captures without changing the UI/material-slot contract.

Replacement path: G1 visual reference -> G2 calibrated visual twin -> G3 production twin only where justified.
