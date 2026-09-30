# Scorpion Leather Studio — Current State

Last updated: 2026-09-28

## Repository / production

Repository: `BILGISOLUTIONS/ScorpionLeatherStudio`

V0.28 is the current shipped release on `main` at exact SHA `00b65d6f0ab4910a5af289dde7cc7a722ced6519`. Exact-main CI `36393027691` passed and GitHub Vercel status reported success.\n\nV0.26 was promoted to `main` from the exact green head:

```text
45b773b85cffbca543d8b0a3381f19a5a4330ec1
```

This current-state update is documentation-only and follows that promoted release.

Active development branch: `feature/v029-build-continuity`, based on shipped V0.28 main `00b65d6f0ab4910a5af289dde7cc7a722ced6519`. V0.29 improves local resume and cross-device share continuity without adding a backend dependency or Vercel function.

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


## V0.28 — Shopify host bridge — shipped

- Branch: `feature/v028-shopify-bridge`, based on shipped V0.27 main `30f30c644d02026ec7038e39fb9d829f23aab754`.
- Adds exact-origin, versioned host/iframe ready, resize, and history synchronization.
- Embedded share links resolve to the Scorpion Western Wear storefront host page; iframe history remains same-origin.
- Shopify host adds bounded rAF resize, delayed-load retry, no-JavaScript fallback, reduced-motion handling, and Theme Editor unload cleanup.
- Adds `smoke:shopify`, unit trust/URL coverage, and desktop/mobile Playwright host-bridge coverage.
- No dependency, API function, polling loop, or internal-tool payload added.


## V0.29 — customer build continuity candidate

- Branch: `feature/v029-build-continuity`, based on shipped V0.28 main `00b65d6f0ab4910a5af289dde7cc7a722ced6519`.
- Adds explicit customer-facing device-save state plus a compact continuity/privacy explanation in the build summary.
- Adds native Web Share support with clipboard fallback and a separate Copy build link action. Shopify iframe permission policy now allows `web-share` in addition to clipboard write.
- Same-product Shopify deep links can resume the locally saved configuration instead of resetting it on reload; explicit incompatible variant targets remain authoritative.
- Share links continue to carry configuration only. Contact details and uploaded artwork are intentionally not serialized into the build token.
- Adds pure unit coverage for share/copy outcomes and desktop/mobile Playwright coverage that saves, reloads, shares, clears browser storage, opens the shared URL, and verifies configuration restoration with customer fields absent.
- No new dependency, API function, polling loop, cloud persistence, or global internal-tool payload.


## SLS V0.30 material-ready digital twin framework — SHIPPED 2026-09-29

- Active branch: `feature/v030-digital-twin-framework`, based on shipped V0.29 main `5db2951b40249627ab48160068eac33884d0bcf2`.
- Goal: make Scorpion product assets materially swappable and reconstruction-ready without turning the 3D layer into a second source of product truth.
- Product-schema manifest now supports explicit material-slot profiles: expected material kind, UV0 requirement, normals requirement, tangent policy, plus per-asset ground/shadow/orbit presentation values.
- Renderer now validates explicit material-slot assignments, accepts controlled material/component overrides, and reads orbit/shadow presentation from the manifest instead of requiring product-specific renderer edits.
- Product Capture now includes welding-hood material-slot requirements and validation. It can emit a deterministic asset-manifest authoring scaffold from a validated construction packet, carrying semantic nodes, confirmed material slots, material IDs, mapping requirements, components, measured-envelope camera starts, and presentation defaults.
- Digital Twin QA now records per-mesh UV0/UV1, normals, tangents, triangles and material counts; production QA blocks required UV/normal/tangent failures according to the manifest profile.
- Digital Twin QA local viewer adds Original / UV checker / Normals diagnostic modes for mapping and shading inspection.
- Customer welding-hood preview now routes supported construction hardware preferences through explicit `HardwarePrimary` material-slot overrides, demonstrating that customer configuration can change the 3D material state without guessed mesh traversal.
- Welding-hood development manifest advanced to v4 with material-slot profiles and manifest-owned presentation settings. The geometry remains a development scaffold and is not represented as a production-fidelity model.
- `docs/3D-ASSET-STANDARD.md` now documents the material-ready surface contract, capture-to-authoring scaffold, diagnostic QA, and runtime configuration binding.
- Final production SHA: `f33be2a01332f07cd75ae664ebe07cb5c15f60e0`.
- Final branch CI `36519258405`: PASS — TypeScript, 94/94 unit/API tests, build, budgets, Shopify smoke, function guard 8/12, browser suite 60/60.
- Exact-main CI `36519509818`: PASS; Vercel status on the same SHA: success.
- Browser QA artifact `11011878865` reviewed on desktop/mobile.
- No new Vercel function, database dependency, polling loop, third-party 3D service, or Shopify theme publication.


## SLS V0.31 asset-authoring framework — CANDIDATE

- Active branch: `feature/v031-asset-authoring`, based on shipped V0.30 main `f33be2a01332f07cd75ae664ebe07cb5c15f60e0`.
- Adds a real-world UV convention for material-ready product surfaces: default `1 UV unit = 1 meter`, with per-slot `metersPerUvUnit` and `uvScaleToleranceRatio` in the asset manifest.
- Material definitions can now carry `physical.textureTileSizeMm`; production leather with maps requires this physical scale. Runtime repeat is derived from measured tile size instead of being manually tuned per product.
- Material QA now requires measured physical texture-tile width/height in millimeters before approval. Its repeat slider is explicitly preview-only. Material Promotion preserves calibrated tile dimensions and removes product-specific production repeat overrides.
- Asset manifests now support explicit customization placement zones for tooling, text, logos and artwork, with semantic target mesh, local origin/normal/up, physical size and safe inset.
- Product Capture exports the physical UV and placement-zone contract in the 3D manifest scaffold and displays the authoring rules in the operator UI.
- Digital Twin QA estimates meters-per-UV-unit from candidate geometry, detects uneven scale, enforces manifest tolerances, and adds a Placement zones diagnostic overlay.
- Reusable product-type authoring templates now define semantic starting conventions for welding hoods, radio harnesses, belts, pouches and straps without inventing product-specific construction.
- Added `docs/BLENDER-ASSET-AUTHORING.md`, `docs/PRODUCT-TYPE-AUTHORING-TEMPLATES.md`, and `scripts/blender/sls_asset_preflight.py` for repeatable Blender preflight/export workflow.
- Welding-hood development manifest advanced to v5. Placeholder geometry remains development-only and is expected to expose QA blockers until real reconstruction meets the new physical-UV/fidelity contract.
- No new API function, backend/database dependency, polling loop, analytics SDK, or third-party 3D service. Shopify development theme remains unpublished.
- Promotion requires exact-head CI plus desktop/mobile QA review.


## SLS V0.34 composited leather system — CANDIDATE

- Active branch: `feature/v034-composited-leather-system`, based on shipped V0.33 main `5327f6925a4c97c56227675dc7453c402e32c7c2`.
- Goal: turn the PBR renderer into a disciplined Structure × Dye × Finish material system while preserving physical-scale texture authority and avoiding fake recoloring of photographed leather.
- Material library now defines leather structures, dyes, finishes, composition selections/results and a deterministic compositor.
- Photographed/captured colored structures are locked: non-captured dyes/finishes are not applied and generate warnings. Tint/finish composition is allowed only on explicitly tintable neutral bases.
- Added a development-only neutral leather material base solely for testing the composition engine; it is clearly synthetic/reference-only and is not a production material claim.
- Welding-hood 3D adds a premium Material Lab UI with surface structure, dye and finish controls, clear captured-vs-development states, and reset-to-photographed behavior. Material Lab state is visual-only and is not silently added to the order request.
- Current dye concepts: Black, Cognac, Oxblood, Emerald and Midnight Navy. Current finish concepts: Matte, Satin and Polished. These remain development concepts until physical material capture/QA confirms actual availability and appearance.
- Existing semantic material-slot architecture remains; the composed recipe is supplied through `LeatherPrimary` without reloading the GLB.
- Added modern Khronos KTX2 build automation at `scripts/build-material-ktx2.mjs` with manifest validation, dry-run mode, safe spawn argument arrays, channel-specific compression profiles, `ktx validate --gltf-basisu`, SHA-256/byte-size reports, and CI self-test.
- Added `docs/examples/material-ktx2.example.json` and expanded `docs/PBR-MATERIAL-DELIVERY.md`.
- No new API function, database dependency, polling loop, analytics SDK, runtime third-party service, or Shopify publication.
- Promotion requires exact-head CI and desktop/mobile browser QA review.


## Agent protocol resilience hardening — 2026-09-30

- Canonical agent protocol now explicitly states that pull requests are optional unless branch protection/repository policy requires them.
- Scorpion's normal promotion path is feature-branch exact-head CI + QA artifact review + non-forced fast-forward to `main` + exact-main verification.
- A PR-endpoint failure must not be treated as a repository-wide write blocker when branch writes and safe promotion remain available.
- Added an autonomous fallback ladder: classify failures precisely, check established workflow, inspect available capabilities, correct schema/invocation errors, use equivalent authorized paths, preserve safety invariants, and escalate only when user action is genuinely required.
- Added interaction/usage-efficiency rules to minimize redundant retrieval, dead-end calls, repeated questions, and unnecessary user steering.
- Browser/deployment fallback guidance now explicitly permits CI QA artifacts and GitHub deployment/status evidence when a direct local/Vercel path is unavailable, without fabricating verification.
- This protocol hardening was committed on the active V0.34 feature branch so `main` remains stable until V0.34 itself passes release gates.
- Previous V0.34 implementation commit was `b9ea9bdb1970c74b1df16801243d4d11015ef666`; protocol/state documentation commits advance the feature-branch head and therefore the final exact V0.34 candidate must be revalidated before promotion.
