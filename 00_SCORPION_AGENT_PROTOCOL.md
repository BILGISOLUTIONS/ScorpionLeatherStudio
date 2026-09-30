# Scorpion Agent Protocol

## Continuity

At the start of every Scorpion work session:

1. Read `00_SCORPION_AGENT_PROTOCOL.md`.
2. Read `SCORPION_CURRENT_STATE.md`.
3. Confirm current GitHub `main` and latest exact-main CI before changing code.

After every material project change, update `SCORPION_CURRENT_STATE.md` in the same session. This file is the canonical recovery point across chats, execution resets, and context-limit resets.

Do not reinterpret the established workflow merely because a new chat or execution session starts. Recover from the repository/state files and continue from the last verified exact branch/commit unless live state proves it changed.

## Repository

Primary repository:

```text
BILGISOLUTIONS/ScorpionLeatherStudio
```

Treat `main` as the stable production branch. Use feature branches for meaningful batches, validate the exact branch head, visually inspect relevant QA artifacts, then fast-forward to `main` only when clean.

### Pull requests are optional

A pull request is a collaboration/review surface, not a required Scorpion release gate unless GitHub branch protection or an explicit repository policy requires one.

The normal Scorpion release path is:

1. develop on a feature branch;
2. push the exact candidate;
3. let CI validate the `feature/**` branch head;
4. inspect browser/QA artifacts;
5. confirm `main` has not moved incompatibly;
6. fast-forward `main` to the exact clean candidate;
7. verify exact-main CI/deployment.

If the PR API is unavailable but branch writes, CI, and non-forced fast-forward promotion are available, continue through the normal release path. Do not elevate a PR-specific failure into a repository-wide blocker.

Never force-update `main` as a workaround. If a clean fast-forward is not possible, resolve the divergence explicitly.

## Release gates

A release is not complete until the exact head passes:

- TypeScript
- unit/API tests
- production build
- enforced bundle/resource budgets
- Vercel Hobby function budget
- Chromium browser QA
- mobile Chromium QA where applicable

Do not weaken a failing test merely to obtain green CI. Determine whether the test exposed a product defect, test-fixture defect, or obsolete assumption.

## Autonomous problem-solving and fallback ladder

A failure of one tool call, endpoint, connector feature, browser path, or API method is not automatically a blocker.

Before asking the user to intervene, work through the smallest safe recovery path:

1. **Classify the failure precisely.** Distinguish repository permission, endpoint permission, connector limitation, schema mismatch, transient failure, branch divergence, CI failure, deployment failure, and browser/QA availability.
2. **Check the established Scorpion workflow.** Do not introduce a new mandatory step when the protocol or prior releases already provide a valid path.
3. **Inspect the available capability surface.** Check relevant connected accounts, tool contracts, branch state, workflow triggers, commit statuses, artifacts, and repository settings before concluding the task cannot continue.
4. **Correct recoverable invocation errors yourself.** For schema/argument mismatches, inspect the tool contract and retry with the correct shape rather than escalating.
5. **Use an equivalent authorized path when safe.** Examples: feature-branch CI instead of PR-triggered CI; exact GitHub deployment/status checks when direct Vercel project access is unavailable; CI browser artifacts when a local browser cannot run.
6. **Preserve invariants.** Never bypass release gates, manufacturing/order safety, access control, branch protection, or production authority just to avoid a tooling inconvenience.
7. **Escalate only when user action is genuinely required.** State the exact blocked capability and evidence, not a broader claim that the project is unwritable or inaccessible.

When multiple valid recovery paths exist, prefer the path that is reversible, deterministic, lowest-risk, and least wasteful of user interaction.

## Interaction and usage efficiency

The user's interaction budget is limited. Treat unnecessary back-and-forth, redundant retrieval, and avoidable dead-end tool calls as defects in the workflow.

- Preserve and reuse exact SHAs, run IDs, branch names, artifact IDs, and verified facts across the session.
- Fetch targeted files/ranges instead of repeatedly retrieving large histories when a narrow read is sufficient.
- Batch independent read-only checks when practical.
- Do not ask the user to reconfirm information already available in the current conversation, canonical state, or live repository.
- Do not stop at the first recoverable tool failure.
- Provide progress updates with concrete findings during long operations, but avoid narrating low-level mechanics.
- If a path fails, attempt the next safe path before reporting a blocker.
- A blocker report must include what still works, what exact operation failed, and why no safe equivalent path remains.

## Engineering priorities

Treat these as continuous release criteria:

1. correctness and manufacturing/order safety
2. low resource usage and bounded bundle growth
3. customer/staff UI clarity
4. responsive/mobile behavior
5. restrained motion with reduced-motion support
6. maintainability and deterministic data contracts
7. privacy/security boundaries
8. graceful degradation

Prefer lazy staff-only/internal modules over adding weight to the customer Studio.

## Product authority

The real Scorpion product, physical material, Shopify catalog, and released workshop revision are authoritative. Do not let AI approximations, catalog-photo material guesses, stale revision sheets, or browser convenience state silently override those authorities.

## Production workflow safety

Do not bypass:

- Shopify/payment validation
- workshop release gates
- deterministic revision identity
- controlled-revision rules
- source-artwork provenance
- production checklist validation
- final-QC photo/signoff
- material/product QA promotion gates

## Hosting constraint

Vercel Hobby supports at most 12 Serverless Functions for this project. Shared server libraries/tests stay outside `/api`. CI enforces the function count.

## Communication

Execute requested development work rather than only outlining it. Report completion only after implementation and validation, or report a concrete blocker with evidence.

When a tooling mishap is recoverable, solve it first. The user should not have to steer routine diagnostic reasoning that can be resolved from the repository, connected tools, prior verified state, or an equivalent safe workflow.
