# SLS Digital Twin Ingestion

## Purpose

Digital Twin Ingestion bridges real Scorpion product capture and the existing production GLB QA pipeline.

It is intentionally provider-agnostic. TRELLIS.2, Meshy, Stable Fast 3D, SPAR3D, manual Blender reconstruction, or a future provider may create the raw candidate. The provider is never the production authority.

## Controlled sequence

\`\`\`
physical product
  -> Product Capture
  -> geometry-preserving photo preparation
  -> reconstruction job packet
  -> external reconstruction provider
  -> raw candidate provenance packet
  -> Blender / cleanup / retopology
  -> semantic nodes + material slots + physical UV0
  -> customization zones
  -> GLB export
  -> Blender preflight
  -> Digital Twin QA
  -> explicit production promotion
  -> customer renderer
\`\`\`

## Authority rules

1. Real measured product dimensions are geometry authority.
2. Capture photographs are construction/silhouette evidence.
3. Photo cleanup may remove background, normalize exposure/color, and improve presentation, but must not alter geometry.
4. AI reconstruction is an accelerator and may hallucinate hidden construction.
5. AI-generated baked materials are reference-only unless independently captured and promoted through the Scorpion material pipeline.
6. Production leather comes from approved Scorpion material assets.
7. Provider output never bypasses Blender preflight, Product Asset QA, Digital Twin QA, or named human fidelity review.
8. Provider credentials/tokens are never stored in job/candidate packets.

## V0.39 internal tool

Entry point:

\`/digital-twin-ingestion.html\`

The tool runs local-first in the browser. It does not upload selected images or candidate models to SLS.

### Stage 1 — Physical provenance

Load the validated construction packet exported by Product Capture.

The packet supplies:

- product identity
- source capture session
- capture plan
- authoritative dimensions
- capture-view provenance
- confirmed semantic node contract
- confirmed material-slot contract

### Stage 2 — Reconstruction job

Choose a provider and the exact prepared source views to send.

The generated job packet records:

- provider identity/mode
- source capture role for every prepared image
- original capture filename plus prepared derivative filename
- geometry-preserving retouch attestation
- target asset ID
- output preference
- SLS web triangle/texture targets
- explicit rule that physical evidence remains authority

For single-image providers the tool permits one source view. For configured multi-image providers it enforces the bounded source-set policy.

### Stage 3 — Candidate intake

After reconstruction, select the raw model locally and record the provider result/task reference.

Production candidate intake requires explicit confirmation that:

- source photos are authorized
- commercial use is permitted
- export/use rights are available
- provider terms/license were reviewed

Raw provider models may be large. This stage does not pretend they already satisfy the customer-web budget.

### Stage 4 — Processing handoff

The processing handoff carries:

- authoritative physical envelope in meters
- required semantic node names
- required material slots
- final GLB delivery policy
- model/mesh/material/texture budgets
- physical UV requirement
- the deterministic cleanup/QA sequence

The next operator uses this alongside \`docs/BLENDER-ASSET-AUTHORING.md\` and \`scripts/blender/sls_asset_preflight.py\`.

## Provider automation boundary

V0.39 deliberately does not embed a third-party token or call a public reconstruction service from the customer runtime.

A future provider adapter may automate submission when:

- the provider has a stable production API
- commercial/export terms are acceptable
- credentials can remain server-side
- the extra Vercel/API cost is justified
- rate limits/queue failures have explicit recovery
- provider failure cannot corrupt SLS production state

The adapter must consume/emit the same reconstruction job and candidate provenance contracts so providers remain interchangeable.

## Pilot

Use the leather welding hood first. It already has the deepest SLS contract coverage and is the best end-to-end test of:

- multi-angle capture
- authoritative measurements
- provider reconstruction quality
- cleanup/retopology
- real-world UV scale
- leather/material swapping
- hardware/lens slots
- customization-zone projection
- mobile web performance


## V0.40 executable provider adapters

V0.40 keeps reconstruction execution off the customer runtime but makes two upstream provider paths reproducible from the exported SLS reconstruction job.

### TRELLIS.2 runner

Runner:

\`scripts/reconstruction/trellis2_gradio.py\`

The runner uses the same stateful Gradio client session for:

1. \`/image_to_3d\`
2. \`/extract_glb\`

It consumes exactly one prepared source image from a \`provider.id=trellis2\` SLS job.

Default SLS production-candidate settings:

- resolution: 1024
- sparse structure: guidance 7.5 / rescale 0.7 / 12 steps / rescale T 5
- shape: guidance 7.5 / rescale 0.5 / 12 steps / rescale T 3
- material: guidance 1 / rescale 0 / 12 steps / rescale T 3
- extraction face target: SLS web triangle target, clamped to the current hosted TRELLIS.2 100,000-500,000 extraction range
- texture: current SLS texture target, normalized to 1024 / 2048 / 4096

Install once:

\`python -m pip install --upgrade gradio_client\`

An optional \`HF_TOKEN\` environment variable can be used. It is never placed in the SLS job JSON.

### Meshy Multi-Image runner

Runner:

\`scripts/reconstruction/meshy_multi_image.mjs\`

The runner:

1. reads the exact prepared images named by the SLS job;
2. converts them locally to data URIs;
3. creates \`POST /openapi/v1/multi-image-to-3d\`;
4. polls \`GET /openapi/v1/multi-image-to-3d/:id\`;
5. downloads \`model_urls.glb\` after \`SUCCEEDED\`;
6. writes a sibling provider metadata JSON containing the task ID, status, timing and credit metadata.

The API key is read only from \`MESHY_API_KEY\`.

Default production-candidate settings:

- \`ai_model: meshy-7.1\`
- \`geometry_resolution: 2k\`
- \`should_texture: true\`
- \`enable_pbr: true\`
- \`target_formats: ["glb"]\`

Draft jobs default to \`standard\` geometry resolution to conserve provider cost.

### Execution recipe

After SLS creates a reconstruction job, Digital Twin Ingestion now renders and can export a provider execution recipe. The recipe records:

- runner path
- exact job filename
- expected source filenames
- expected output filename
- one-time install commands
- required/optional environment variables
- provider settings
- safe runner command
- explicit assurance that credentials are not stored in the job

Unvetted providers remain manual. SLS does not invent an API contract simply because a provider is listed.


## V0.41 raw reconstruction preparation

Provider generation and SLS production QA are separated by a conservative preparation stage.

Runner: scripts/blender/sls_reconstruction_prepare.py
Planning policy: scripts/reconstruction/prep_policy.py

The browser emits a deterministic Blender command after raw-candidate intake. It consumes the exact raw provider model plus the downloaded SLS processing handoff.

### Automatic operations

- import GLB/glTF/FBX/OBJ/PLY into a clean Blender scene;
- remove imported cameras/lights that are not product geometry;
- measure the world-space product envelope;
- calculate one uniform physical scale against Product Capture dimensions;
- center the product horizontally and place its lowest point on Blender ground;
- create an identity SLS_ProductRoot;
- apply conservative triangle decimation when the reduction ratio is not extreme;
- preserve provider UV/material data as reconstruction reference;
- export a normalized GLB and optionally save an editable Blender file;
- emit a machine-readable preparation JSON report.

### Operations that remain human-authoritative

The batch step does not non-uniformly stretch the product to force a dimensional match. It does not guess semantic mesh names, material-slot ownership, hinge pivots, mechanical motion, tooling/text/logo zones, or Scorpion production materials.

If uniform scaling cannot match the physical envelope within the SLS tolerance, the report marks manual geometry correction required. If reaching the triangle target would retain less than 8 percent of the raw triangles, automatic destructive decimation is skipped and manual retopology is required.

The report records physical envelope before/after, uniform scale, per-axis deviation, triangle counts, mesh/UV/material/texture diagnostics, missing semantic nodes, unresolved material slots, web-budget violations, blockers, manual authoring requirements, and warnings. It always states productionApproved false and requiresDigitalTwinQa true.

The normalized GLB must still pass the existing Blender asset preflight, Digital Twin QA automated gate, diagnostic views, and named human fidelity review.

### Meshy production-candidate refinement

Meshy production candidates and drafts now ask the provider to remesh to the SLS requested web target, clamped to the current 100-300,000 target-polycount range. Source-master intent keeps provider remeshing off. Texture resolution is 2K, image enhancement is disabled because SLS inputs are already controlled prepared captures, and lighting removal remains enabled. SLS still measures the actual returned model because provider target counts are not guarantees.

## V0.42 preparation provenance bridge into Digital Twin QA

V0.42 closes the provenance gap between V0.41 raw-model preparation and final Product Asset QA.

Digital Twin QA accepts the `*.prep.json` emitted by `scripts/blender/sls_reconstruction_prepare.py` as an optional fourth local input. It is recommended for reconstructed assets and remains optional for hand-authored or legacy assets that never passed through the V0.41 preparation runner.

### What is validated

The preparation report must retain the V0.41 authority contract:

- `stage: raw-reconstruction-preparation`
- `productionApproved: false`
- `requiresDigitalTwinQa: true`
- uniform-scale-only preparation
- no non-uniform geometry correction performed automatically
- real product remains geometry authority
- provider materials remain reference-only

Digital Twin QA cross-checks preparation lineage against the active Product Capture packet and runtime manifest:

- asset ID
- product ID
- capture-session ID
- authoritative width / height / depth target

A mismatch in those identity/physical-authority fields is a production blocker.

### Historical findings versus current final state

V0.41 preparation findings describe the state of the raw/normalized reconstruction before final authoring. They are therefore not blindly treated as permanent blockers after manual correction.

Instead:

- preparation blockers and authoring requirements appear as QA warnings;
- the final inspected GLB must independently satisfy dimensions, semantics, material lifecycle, UV requirements, customization zones, geometry budgets and human fidelity review;
- `manual-geometry-correction-required` is surfaced prominently so the named reviewer knows the reconstruction required manual shape correction;
- when the inspected model filename differs from the normalized preparation output, QA warns that the current GLB must be confirmed as a deliberate authored derivative.

This allows a real Blender correction/retopology pass to resolve earlier reconstruction defects without deleting the historical evidence that those defects existed.

### Approval and production provenance

When a valid preparation report is supplied, the QA approval packet records a compact reconstruction-preparation summary:

- source preparation report filename
- reconstruction candidate ID
- reconstruction job ID
- normalized model filename
- preparation status
- number of blockers reported during preparation
- number of manual authoring requirements
- number of preparation warnings

Production promotion carries that summary into the production asset record and adds the preparation report to the deterministic placement plan as:

`reconstruction-preparation.json`

This keeps the chain:

`physical capture -> provider job -> raw candidate -> V0.41 preparation -> authored final GLB -> Digital Twin QA -> production promotion`

auditable without making the third-party reconstruction provider or automated preparation step the production authority.
