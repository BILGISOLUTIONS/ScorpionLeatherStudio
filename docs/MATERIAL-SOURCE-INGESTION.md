# SLS Material Source Ingestion

V0.35 adds a source-agnostic provenance contract and the first provider adapter: **Poly Haven**.

## Why Poly Haven first

Poly Haven publishes CC0 assets and exposes a public API with:

- ranked search via `/search`;
- per-asset metadata via `/info/{id}`;
- file trees/checksums via `/files/{id}`;
- physical texture dimensions in millimeters when available.

That combination lets SLS preserve provenance and real-world scale instead of scraping pages or guessing filenames.

The live Poly Haven API requests a visible "Powered by Poly Haven" credit for applications built on it. SLS records that requirement in generated manifests. The customer storefront does not call the API at runtime; approved files are vendored locally.

## Search

```bash
npm run material:source -- --query "leather grain" --limit 12
```

Search is restricted to published texture assets. Output includes ranked slugs and Poly Haven asset URLs.

## Inspect / plan an asset

```bash
npm run material:source -- --asset <polyhaven-slug> --resolution 1k --dry-run
```

Dry-run fetches metadata and file structure, then prints the deterministic source manifest without writing files.

## Vendor the asset

```bash
npm run material:source -- --asset <polyhaven-slug> --resolution 1k --download
```

Default output:

```text
.sls-material-sources/
  poly-haven/
    <asset-id>/
      source-manifest.json
      material.ktx2.json
      raw/
        baseColor.*
        normal.*
        roughness.*
        ambientOcclusion.*   # when available
        height.*             # provenance/reference only in V0.35
        metalness.*          # provenance/reference only in V0.35
      runtime/
        1k/
          ... generated later by the KTX2 builder
```

The downloader:

1. selects the requested resolution;
2. prefers Poly Haven's OpenGL normal map and excludes DirectX normals;
3. requires base-color, OpenGL normal, and roughness for a usable PBR development material;
4. verifies provider byte size when available;
5. verifies provider MD5 when available;
6. records a local SHA-256 for every downloaded map;
7. records Poly Haven's `files_hash`;
8. records provider physical dimensions when supplied;
9. writes a KTX2 build manifest for the channels supported by the existing builder.

Then run:

```bash
npm run material:ktx2 -- --manifest .sls-material-sources/poly-haven/<asset-id>/material.ktx2.json
```

## Authority boundary

A generated external source manifest is always:

```text
authority = development-reference
```

The ingestion validator rejects attempts to label an external library texture as production authority.

Provider dimensions are useful for development scale and UV evaluation, but an external material still does **not** become a real Scorpion material merely because its scale is known. Real Scorpion color/material availability still requires the existing material QA/promotion process.

## CI

The provider adapter has an offline self-test:

```bash
npm run material:source:selftest
```

CI exercises URL construction, recursive Poly Haven file-tree parsing, resolution/format selection, OpenGL-normal preference, source-manifest validation, physical dimensions, authority isolation, and checksum primitives without making an external network request.

## Next providers

The manifest deliberately does not encode Poly Haven-specific fields as the global contract. Future adapters can map ambientCG, cgbookcase, TextureCan, 3DTextures.me, approved AITextured records, or locally generated/scanned sources into the same provenance model while preserving their own license/access restrictions.
