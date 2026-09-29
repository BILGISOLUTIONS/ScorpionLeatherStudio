# Scorpion Leather Studio — Product-Type Authoring Templates

These are semantic starting points, not invented product specifications. Dimensions, construction, hardware, fit and configurable options still come from the physical product capture.

The machine-readable registry is exported by `@sls/product-capture` as `productTypeAuthoringTemplates`.

## Shared conventions

All templates use:

- root: `SLS_ProductRoot`;
- metric geometry;
- physical UV0 scale: 1 UV unit = 1 meter;
- explicit material slots;
- explicit customization zones instead of freehand runtime placement;
- stable semantic names for runtime-controlled geometry.

## Welding hood

Core roles:

- shell main
- visor pivot
- visor frame
- visor lens

Core slots:

- leather
- hardware
- lens

Typical customization: tooling, text, logo, artwork on confirmed leather panels.

## Radio harness

Core roles:

- body main
- left shoulder
- right shoulder
- radio pocket
- hardware

Core slots:

- leather
- hardware

Potential configurable geometry should remain separate only when the real product supports it.

## Belt

Core roles:

- strap main
- buckle
- keeper

Core slots:

- leather
- hardware

Long tooling/text zones should be defined as measured physical zones instead of being derived from belt UV islands.

## Pouch

Core roles:

- body main
- flap
- hardware

Core slots:

- leather
- hardware

Flap/body customization zones should be separate when seams or folds make one large projected zone unsafe.

## Strap

Core roles:

- strap main
- start hardware
- end hardware

Core slots:

- leather
- hardware

The strap's repeatable leather UV scale and its text/tooling placement zone are separate contracts.

## Adding a new product family

1. capture a real representative product;
2. define semantic roles from actual construction;
3. define material slots;
4. define only real customization surfaces;
5. add the product-type template;
6. create a capture plan with product-specific evidence and dimensions;
7. generate a manifest scaffold;
8. reconstruct and QA the first asset;
9. only then reuse the template for related products.
