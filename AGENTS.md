# Agent Instructions — Scorpion Leather Studio

## Mission

Build a production-grade 3D product configurator for Scorpion Western Wear that ultimately runs directly on the existing Shopify storefront.

This is not a design mockup and not a throwaway demo. Every implementation choice must support a path to production.

## Non-negotiable product behavior

A customer must eventually be able to configure:
- base product/style
- leather type and color
- hardware finish
- stitching color/style
- compatible product-specific components
- size and guided measurements
- personalization/embossing
- optional upgrades/accessories

One authoritative configuration state must drive:
1. the 3D product
2. allowed/disabled choices
3. price
4. configuration summary
5. Shopify cart payload
6. manufacturing/build specification

## Required technical direction

- TypeScript
- React
- Three.js with React Three Fiber
- Drei only where it reduces complexity without hiding core behavior
- glTF/GLB production assets
- PBR materials
- data-driven product definitions
- deterministic pricing
- mobile-first rendering/performance
- Shopify integration using supported current Shopify APIs and a Theme App Extension

Use a small state solution such as Zustand if appropriate. Keep domain logic framework-independent where practical.

## Architecture boundaries

Keep these concerns separate:
- product definitions
- configuration/rules
- pricing
- measurements/fitting
- 3D renderer
- UI
- Shopify adapter
- asset loading/management

Do not hardcode business logic throughout React components.

## Shopify requirements

- Shopify remains the commerce system of record.
- Do not represent every customization combination as a Shopify variant.
- Use variants only when SKU/inventory/fulfillment requires a true merchandise distinction.
- Carry detailed customization data in supported cart/order metadata.
- Architect for server-side price validation before production launch.
- The final user experience must live directly on Scorpion's Shopify storefront, not feel like an unrelated external application.

## 3D requirements

The application must be able to accept professionally authored GLB assets without application rewrites.

Support:
- orbit/touch rotation
- constrained zoom
- camera presets/transitions
- PBR material swaps
- mesh visibility switches
- modular components
- controlled mechanical animations
- environment lighting
- realistic contact/shadow treatment
- screenshot/render capture capability
- reduced-motion accessibility
- graceful loading/failure states

Do not use fake CSS product illustrations as a substitute for real 3D.

## Performance requirements

Target normal modern smartphones, not only desktop GPUs.

Plan for:
- lazy loading
- code splitting
- compressed meshes/textures
- texture resolution budgets
- bounded DPR
- progressive asset loading
- GPU/memory-aware choices
- no unbounded render loops or needless re-renders

## Product fidelity

Scorpion products must be represented faithfully. Never invent decorative elements, seams, pockets, rivets, tooling, materials, logos, or hardware not supported by the real product references.

Real product photography and captured material references are the authority.

## UI direction

Aim for a premium custom leather workshop / high-end automotive configurator feeling.

Avoid:
- generic SaaS-dashboard visual language
- excessive glassmorphism
- neon effects
- giant gradients
- decorative animation without purpose
- excessive rounded-card nesting
- inaccessible tiny controls

Prioritize the product itself, tactile controls, excellent typography, restrained Scorpion gold accents, smooth interaction, and strong mobile ergonomics.

## Development procedure

Before a substantial change:
1. inspect the current architecture and relevant tests;
2. verify current external API behavior when it could have changed;
3. implement the smallest coherent production-quality slice;
4. run typecheck/lint/tests/build;
5. exercise the affected UI in a browser when applicable;
6. inspect desktop and mobile behavior;
7. fix failures before claiming completion.

Do not claim functionality was tested unless it was actually exercised.

## Placeholder assets

Placeholder 3D geometry is allowed during application development only if it is isolated behind the same asset manifest and interfaces that production models will use.

Never build application logic around the placeholder object's accidental mesh names or dimensions.

## Documentation

Update architecture/contracts when behavior changes. Product schemas, GLB conventions, Shopify payload mappings, and pricing semantics are part of the product and must remain documented.
