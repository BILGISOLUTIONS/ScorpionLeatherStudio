# Scorpion Leather Studio — Current State

Last updated: 2026-09-27

## Repository / production

Repository: `BILGISOLUTIONS/ScorpionLeatherStudio`

V0.24 was promoted to `main` from the exact green head:

```text
9ec15838b4ca96395dc817dc9561eb880903cd21
```

This current-state update is documentation-only and follows that promoted release.

Active development branch: none. Start the next material batch from current `main`.

## Current product scope

Scorpion Leather Studio is a Shopify-connected custom-leather configuration/order platform with:

- customer configurator and shareable builds
- real Shopify product/variant identity
- live Shopify price/inventory reconciliation for catalog-priced items
- quote-safe handling of development/custom products
- artwork intake and structured order packets
- server-side order delivery
- staff quote/draft/invoice/payment workflow
- material capture, processing, 3D QA, promotion pipeline
- product capture and product-asset QA pipeline
- workshop manufacturing release, controlled revisions, progress, final QC and audit trail
- scan-first workshop identity / local QR workflow

## Performance architecture

Customer storefront work is isolated from internal tooling.

Key internal tools are separate/lazy entries or modules:

- `/capture.html` — material field capture
- `/process.html` — local material processing
- `/material-qa.html` — 3D material QA
- `/materials.html` — material registry
- `/promote.html` — controlled material promotion
- product capture / product-asset QA entries
- `/staff-workshop-v022.js` — lazy workshop revision/QC operations
- `/staff-scan-v023.js` — lazy scan/QR workflow
- V0.24 adds `/staff-focus-v024.js` + `/staff-focus-v024.css`, both lazy

Vercel function count is enforced below the Hobby limit; current architecture uses 6 deployable API functions.

## Material pipeline

Current controlled sequence:

```text
Field Capture
  -> Material Processor
  -> 3D Material QA
  -> approval packet
  -> controlled registry promotion
  -> production-approved material
  -> customer renderer
```

Reference-only colors must not be treated as calibrated physical materials.

## Product digital-twin pipeline

Product capture and Product Asset QA exist as controlled internal tooling. Real Scorpion product geometry/photos remain visual authority.

## Workshop state

### V0.20

Added production release gate, deterministic work-order/revision identity, durable source-artwork provenance, released manufacturing packet and privacy boundary.

### V0.21

Added controlled revisions, persisted manufacturing/final-QC checklist progress, private final-QC photo, completion gate and workshop audit attribution.

### V0.22

Added revision history comparison, manufacturing-field diff and printable scan-first revision change sheet. Workshop browser logic remains lazy staff-only.

### V0.23

Added strict workshop scanner payload:

```text
SLS:WORKSHOP:1:<REQUEST-ID>:<REVISION-ID>
```

Staff can open exact workshop orders by scanner/paste/camera QR, verify scanned revision against active released revision, and render QR locally without a third-party QR service.

Exact V0.23 main CI passed.

### V0.24 — shipped

Low-distraction Workshop Focus Station over the existing released-production authority.

Shipped to `main` from exact green head `9ec15838b4ca96395dc817dc9561eb880903cd21`.

Implemented:

- `Workshop focus` entry point enabled only for released packets
- lazy `staff-focus-v024.js`
- lazy `staff-focus-v024.css` so initial staff CSS did not grow
- pinned work-order/revision/product identity
- manufacturing and final-QC progress counters
- next-required-step surface
- session-only operator memory
- opt-in 650 ms debounced checklist auto-save using existing validated Save progress action
- Ctrl/Cmd+S shortcut for validated progress save
- Escape exits focus without closing order
- low-distraction view hides general admin/Shopify controls while preserving workshop packet + QC authority
- reduced-motion support
- dedicated bundle budgets
- Playwright coverage including lazy-load isolation and auto-save batching
- documentation in `docs/WORKSHOP-FOCUS.md`

Final V0.24 visual QA passed on desktop and mobile. The focus layout was further simplified after inspection so released production resolutions/revision controls are hidden in Focus mode while the QR/packet actions and production/final-QC controls remain visible.

Validated V0.24 characteristics:

- customer Studio does not load V0.24 staff JS/CSS;
- initial staff CSS remained within its existing budget because focus CSS is lazy;
- focus JS and CSS have dedicated budgets;
- optional auto-save is debounced and reuses the existing validated workshop-progress action;
- released build/revision identity remains pinned;
- desktop/mobile Playwright QA is green.

## Immediate recovery steps

1. Verify the latest exact-`main` CI is green after this documentation-only state update.
2. Treat V0.24 as shipped.
3. Start the next feature branch from current `main`.
4. Continue preserving customer/runtime isolation and dedicated budgets for internal staff tooling.
