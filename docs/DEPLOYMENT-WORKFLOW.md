# Deployment Workflow

Scorpion Leather Studio uses GitHub Actions as the validation gate and Vercel as the production hosting target.

## Automatic deployment policy

- `main` is the production branch and remains eligible for automatic Vercel deployment.
- `feature/*` branches do not create Vercel deployments.
- GitHub Actions still runs on feature branches, so typecheck, unit tests, production build, bundle budgets, function budgets, and browser QA remain available before promotion to `main`.

This prevents rapid implementation commits from consuming Vercel deployment quota while preserving the repository's existing verification gates.

## Ignored build step

Vercel runs `scripts/vercel-ignore-build.mjs` before a `main` build.

The script compares the current commit with `VERCEL_GIT_PREVIOUS_SHA`, the previous successful Vercel deployment. A Vercel build proceeds when any production input changed:

- `apps/configurator/`
- `packages/`
- `api/`
- `server/`
- `assets/`
- root package manifests
- `tsconfig.json`
- `vercel.json`
- `.vercelignore`
- the ignore-build script itself

Changes limited to documentation, GitHub workflow files, repository notes, or Shopify Liquid integration files do not rebuild the Vercel application.

The script is fail-open: if the previous deployment SHA is missing, Git cannot compare commits, or an unexpected condition occurs, it requests a build rather than risking a stale production deployment.

## Promotion flow

```text
feature/*
  -> GitHub CI
  -> no Vercel preview deployment
  -> verified commit
  -> promote/fast-forward to main
  -> Vercel ignored-build check
  -> production deployment only when runtime/build inputs changed
```

## Manual previews

Feature-branch Vercel previews are intentionally disabled by default. When a hosted preview is genuinely required, create it deliberately through the Vercel CLI/dashboard rather than restoring automatic deployment for every feature commit.
