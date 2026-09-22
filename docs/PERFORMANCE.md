# Performance & Efficiency Contract

The Custom Leather Studio is expected to remain fast even as 3D assets and order features grow.

## Measured V0.7 baseline

Before the V0.8 optimization pass, the production entry bundle was:

- JavaScript: **1,215.91 kB** minified
- JavaScript: **339.35 kB gzip**
- CSS: **28.59 kB** minified
- CSS: **6.87 kB gzip**

The Three.js renderer and the general application shipped together.

## V0.8 architecture

V0.8 isolates the complete welding-hood 3D system behind a lazy component boundary.

The normal product configurator does not load:

- Three.js
- React Three Fiber
- Drei
- the hood GLTF adapter
- hood camera state
- hood material/manifest configuration
- 3D asset validation

unless a 3D-capable product is actually rendered.

Measured V0.8 entry bundle during CI:

- JavaScript: approximately **245 kB** minified
- JavaScript: approximately **75 kB gzip**
- 3D lazy chunk: approximately **974 kB** minified / **266 kB gzip**

This is roughly an 80% reduction in initial minified JavaScript compared with V0.7.

## Runtime rules

1. **3D is opt-in at runtime**
   - non-3D product deep links must not request the 3D renderer;
   - Playwright covers this behavior.

2. **3D renders on demand**
   - the WebGL canvas uses frameloop=demand;
   - idle scenes do not continuously render;
   - camera transitions, visor animations, texture completion, user interaction, and explicit auto-rotate request frames only when required.

3. **Order form state stays local**
   - typing customer/contact information must not rerender the entire configurator or 3D viewer.

4. **Catalog controls are memoized**
   - family, starting-build, and variant selectors do not redraw for unrelated personalization keystrokes.

5. **Persistence is debounced**
   - build/customer localStorage writes are delayed and coalesced rather than occurring on every keystroke.

6. **Artwork persistence is bounded**
   - accepted files are capped at 2 MB;
   - artwork is session-only and is not embedded in public share URLs.

7. **Shopify images are right-sized**
   - small UI cards request small Shopify CDN transformations;
   - the selected-product stage uses responsive srcset sizes;
   - full originals are not downloaded for thumbnail surfaces.

8. **Shopify iframe resize messages are coalesced**
   - ResizeObserver work is scheduled through requestAnimationFrame;
   - unchanged heights are not reposted.

9. **Order transport avoids redundant work**
   - content-length is used to reject oversized requests without re-stringifying a multi-megabyte payload;
   - shop notification and customer confirmation reuse one pooled SMTP connection per request.

10. **Dependency installs are deterministic**
    - package-lock.json is committed;
    - CI uses npm ci.

## Enforced production budgets

scripts/check-build-budget.mjs runs after every production build.

Current hard ceilings:

- initial JS raw: **325 kB**
- initial JS gzip: **100 kB**
- CSS raw: **50 kB**
- CSS gzip: **15 kB**
- any lazy JS chunk raw: **1,100 kB**

These are regression guards, not targets. New work should prefer keeping actual values below the limits rather than consuming the full budget.

## Future 3D asset efficiency

Production digital twins should follow these rules:

- GLB/GLTF geometry should be aggressively optimized without visible silhouette loss;
- use Draco or Meshopt where compatible with the renderer;
- textures should use modern compressed GPU formats (KTX2/Basis) where practical;
- avoid 4K textures for surfaces that never occupy enough screen pixels to justify them;
- reuse material textures between variants whenever physically correct;
- lazy-load optional detail maps and secondary product assets;
- do not preload every product digital twin on first page load.

## Catalog freshness

The current application catalog is a verified Shopify snapshot, not a permanent source of truth.

Before broad public launch, price and availability should be refreshed from a server-side Shopify integration. The browser must not receive Shopify Admin credentials.

Until live catalog refresh exists:

- quote-only products remain QUOTE;
- custom work remains subject to Scorpion confirmation;
- inventory shown in a build packet should be treated as the catalog value captured when the Studio data was refreshed.
