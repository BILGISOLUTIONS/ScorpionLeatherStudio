# Shopify Embed Contract

Scorpion Leather Studio remains independently deployable, but its customer-facing production experience is designed to live inside the Scorpion Western Wear Shopify storefront.

## Host -> Studio query contract

The Shopify section loads the Studio iframe with `embed=1`, an exact `parent_origin`, a stable `host_page`, and optional `studio`, `product`, `family`, `reference`, or `variant` deep-link state.

The Studio only trusts `host_page` when its origin exactly matches the resolved parent origin. A cross-origin override falls back to a standalone Studio share URL.

## Studio -> Host messages

Protocol messages use `version: 1`. The Shopify host validates both `event.source` and `event.origin`.

- `scorpion-leather-studio:ready` removes the loading/recovery overlay.
- `scorpion-leather-studio:resize` updates iframe height through requestAnimationFrame and bounded height limits.
- `scorpion-leather-studio:history` synchronizes the compact build token into the storefront URL without navigation.

The Studio targets the exact parent origin when available; wildcard postMessage is retained only as backward-compatible fallback.

## Share continuity

Standalone sessions share a Studio URL. Embedded sessions share the stable Shopify host page with the compact `studio` token. The iframe keeps separate same-origin history so order preparation never attempts cross-origin history replacement.

Share tokens contain configuration state, not customer contact fields or uploaded artwork bytes.

## Failure / Theme Editor behavior

The Shopify host has an accessible loading status, 12-second delayed-load recovery state, explicit retry, no-JavaScript fallback, reduced-motion handling, and cleanup on `shopify:section:unload`.

## Verification

Run `npm run smoke:shopify` for static Liquid/schema/protocol checks. Playwright also exercises the host bridge on desktop and mobile.
