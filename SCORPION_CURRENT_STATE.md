# Scorpion Leather Studio — Current State

Last updated: 2026-09-28

## Repository / production

Repository: `BILGISOLUTIONS/ScorpionLeatherStudio`

V0.27 is the current shipped release on `main` at exact SHA `30f30c644d02026ec7038e39fb9d829f23aab754`. Exact-main CI `36389541282` passed and GitHub Vercel status reported success.\n\nV0.26 was promoted to `main` from the exact green head:

```text
45b773b85cffbca543d8b0a3381f19a5a4330ec1
```

This current-state update is documentation-only and follows that promoted release.

Active development branch: `feature/v028-shopify-bridge`, based on verified V0.27 main `30f30c644d02026ec7038e39fb9d829f23aab754`. V0.28 hardens the Shopify iframe host contract and storefront-native share continuity; it is not shipped until exact-head CI/browser QA pass and the green candidate is promoted.

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
- V0.25 adds `/staff-identity-v025.js` + `/staff-identity-v025.css`, both lazy after successful staff authentication
- V0.26 recovery/diagnostics code lives only in the already-lazy order-capture path; no new API function or polling was added

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



### V0.25 — shipped

Individual staff identity, role enforcement, and authenticated audit attribution.

Shipped to `main` from exact green head `d91c7f1a374be5709cf4ce3d8f444ffa62ca5346`.

Implemented:

- preferred server configuration via `SCORPION_STAFF_IDENTITIES_JSON`
- stable individual staff ID, display name, unique access key, and explicit roles
- roles: `viewer`, `sales`, `workshop`, `qc`, `admin`
- temporary `SCORPION_STAFF_TOKEN` legacy admin fallback for rollback
- server-side role enforcement for order, Shopify, workshop, revision, progress, photo and final-QC actions
- authenticated actor resolution so individual staff cannot spoof another operator name
- workshop audit entries now include actor ID and authenticated roles
- existing human-readable released/QC identity fields remain compatible
- staff API responses expose only public identity metadata, never access keys
- compact authenticated identity chip in the staff console
- individual actor fields are prefilled/read-only
- controls outside the authenticated role are disabled in the browser while server authorization remains authoritative
- V0.25 UI/CSS is lazy and staff-only
- customer Studio never loads V0.25 assets
- initial staff HTML and initial staff JS/CSS stayed inside their pre-existing budgets; no budget increases were used
- desktop/mobile Playwright coverage and dedicated visual QA for the identity chip
- documentation in `docs/STAFF-IDENTITY.md`

Validated V0.25 characteristics:

- exact feature head passed TypeScript, unit/API tests, production build, bundle budgets, Vercel function budget, desktop Chromium and mobile Chromium;
- final desktop/mobile identity chip visual QA passed;
- legacy access remains available for safe rollout but is explicitly identified as non-individual audit access;
- Vercel deployable function count remains within the existing Hobby constraint;
- storefront runtime remains unchanged by staff identity hardening.



### V0.26 — shipped

Customer-safe order recovery, privacy-safe delivery diagnostics, and server correlation tracing.

Shipped to `main` from exact green head `45b773b85cffbca543d8b0a3381f19a5a4330ec1`.

Implemented:

- fresh server correlation UUID on every `/api/order-requests` invocation
- `X-Scorpion-Trace-ID` response header plus matching `traceId` in structured JSON responses
- trace IDs included in server persistence/artwork/email failure logs
- bounded local delivery receipts for prepared/accepted/failed/unavailable states
- bounded session diagnostics containing operational metadata only, not customer contact fields or artwork
- prepared-request recovery by exact deterministic build ID
- accepted requests restore as sent to discourage duplicate submissions
- failed/unavailable requests can be restored after reload and require acknowledgement again before retry
- compact delivery-recovery panel with retry, private recovery-file download, support-reference copy, and existing email fallback
- private recovery file can contain the complete request/artwork and carries an explicit privacy warning
- recovery logic remains inside the lazy `OrderCapture` path
- no third-party telemetry SDK, polling loop, new customer tracking ID, or new Vercel function
- dedicated unit/API/browser coverage
- documentation in `docs/ORDER-RECOVERY.md`

Validated V0.26 characteristics:

- exact feature head passed TypeScript, unit/API tests, production build, all bundle budgets, Vercel function budget, desktop Chromium and mobile Chromium;
- server trace IDs are unique per request and match response headers/bodies;
- failure/recovery UI visual QA passed on desktop and mobile;
- customer diagnostics exclude customer name/email/phone/company and artwork bytes;
- Vercel deployable function count remains within the existing Hobby constraint;
- initial product-browsing path does not load V0.26 recovery code.

## Immediate recovery steps

1. Verify the latest exact-`main` CI is green after this documentation-only state update.
2. Treat V0.25 and V0.26 as shipped.
3. Start the next feature branch from current `main`.
4. Continue preserving customer/runtime isolation, authenticated staff attribution, bounded diagnostics, and dedicated budgets.
5. Next high-value gaps: accessibility/keyboard/focus/reduced-motion audit, production Shopify theme compatibility smoke coverage, and cross-device save/share continuity.

## V0.27 — accessibility release candidate

- Adds a keyboard skip link, manually activated preview tabs with Arrow/Home/End navigation, selected-product state, semantic fieldset legends, labeled tooling notes and visible select/textarea/artwork focus.
- Adds an explicit keyboard path into lazy order capture when intersection observation does not activate it.
- Connects order errors to fields, focuses the first invalid customer field and moves focus to explicitly prepared/restored packets without stealing focus on passive recovery.
- New desktop/mobile browser regression coverage checks keyboard flow, lazy isolation, validation, reduced-motion CSS and overflow.
- Local TypeScript, 79 unit/API tests, production build and raw/gzip budgets pass. Studio initial JS: 238.1 KB raw / 72.9 KB gzip versus 237.0 / 72.5 KB baseline. No dependencies added.
- Correction to earlier function notes: the actual guard currently reports **8 API candidates**, including `api/order-requests.test.ts`, representing 7 endpoint source files plus that test. This remains below 12; the old six-function count is stale. No functions added by V0.27.
- Baseline exact-main CI run `36379000075` verified successful. GitHub Vercel status verifies V0.26 deployment completed; later documentation-only main skipped via ignore step. Direct Vercel connector currently cannot inspect SLS (only EyeFlix listed).
- Local browser installation failed (browser archive download invalid), agent-browser could not start, and cloud Browser blocks localhost. Browser execution/visual QA must use CI artifacts before promotion.


## V0.28 — Shopify host bridge candidate

- Branch: `feature/v028-shopify-bridge`, based on shipped V0.27 main `30f30c644d02026ec7038e39fb9d829f23aab754`.
- Adds exact-origin, versioned host/iframe ready, resize, and history synchronization.
- Embedded share links resolve to the Scorpion Western Wear storefront host page; iframe history remains same-origin.
- Shopify host adds bounded rAF resize, delayed-load retry, no-JavaScript fallback, reduced-motion handling, and Theme Editor unload cleanup.
- Adds `smoke:shopify`, unit trust/URL coverage, and desktop/mobile Playwright host-bridge coverage.
- No dependency, API function, polling loop, or internal-tool payload added.
