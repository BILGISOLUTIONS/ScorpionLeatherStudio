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
- extraction face target: SLS web triangle target, clamped to the hosted TRELLIS.2 extraction range
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
