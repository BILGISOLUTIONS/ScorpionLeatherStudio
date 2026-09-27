# Scorpion Agent Protocol

## Continuity

At the start of every Scorpion work session:

1. Read `00_SCORPION_AGENT_PROTOCOL.md`.
2. Read `SCORPION_CURRENT_STATE.md`.
3. Confirm current GitHub `main` and latest exact-main CI before changing code.

After every material project change, update `SCORPION_CURRENT_STATE.md` in the same session. This file is the canonical recovery point across chats and context resets.

## Repository

Primary repository:

```text
BILGISOLUTIONS/ScorpionLeatherStudio
```

Treat `main` as the stable production branch. Use feature branches for meaningful batches, validate the exact branch head, visually inspect relevant QA artifacts, then fast-forward to `main` only when clean.

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
