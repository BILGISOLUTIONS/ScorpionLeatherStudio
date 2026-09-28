# Customer Build Continuity

V0.29 keeps build continuity intentionally lightweight and privacy-bounded.

## Same-device continuity

The active build is debounced into browser local storage. The Studio exposes a visible save state:

- Saving build…
- Saved on this device
- Device save unavailable

When a Shopify product deep link targets the same catalog product as a saved build, the saved configuration is resumed. A different product target remains authoritative. Explicit incompatible variant targets also remain authoritative.

## Cross-device continuity

A compact Studio share token is the transport mechanism. Customers can:

- use **Share build** to invoke the device share sheet when supported;
- fall back automatically to clipboard copy when native sharing is unavailable;
- use **Copy build link** explicitly.

Embedded Shopify sessions produce a storefront-native URL; standalone Studio sessions produce a Studio URL.

## Privacy boundary

The build link contains product identity, variant, quantity, construction/customization selections and customization notes.

It does **not** contain:

- customer name, email, phone or company;
- order-delivery diagnostics;
- uploaded artwork bytes or files.

Artwork must be reattached on the other device before an order request is submitted.

## Resource policy

This feature adds no API route, polling loop, cloud database dependency, analytics SDK or third-party share service. Native Web Share is progressive enhancement; clipboard remains the fallback.
