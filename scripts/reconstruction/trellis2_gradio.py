#!/usr/bin/env python3
"""Run a validated SLS TRELLIS.2 reconstruction job through the hosted Gradio Space.

Credentials are environment-only. The SLS job JSON never contains HF tokens.
The returned GLB remains a raw reconstruction candidate and must pass SLS cleanup/QA.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any

SPACE = "microsoft/TRELLIS.2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run an SLS TRELLIS.2 reconstruction job.")
    parser.add_argument("--job", required=True, type=Path)
    parser.add_argument("--input-dir", default=Path("."), type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--resolution", type=int, choices=(512, 1024, 1536))
    parser.add_argument("--faces", type=int)
    parser.add_argument("--texture", type=int, choices=(1024, 2048, 4096))
    parser.add_argument("--seed", type=int)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_job(path: Path) -> dict[str, Any]:
    job = json.loads(path.read_text(encoding="utf-8"))
    if job.get("schemaVersion") != 1 or job.get("status") != "ready-for-external-reconstruction":
        raise ValueError("Job is not a supported SLS reconstruction packet.")
    provider = job.get("provider") or {}
    if provider.get("id") != "trellis2":
        raise ValueError("This runner only accepts provider.id=trellis2 jobs.")
    sources = job.get("sourceImages") or []
    if len(sources) != 1:
        raise ValueError("TRELLIS.2 SLS jobs must contain exactly one prepared source image.")
    return job


def stable_seed(job_id: str) -> int:
    digest = hashlib.sha256(job_id.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


def find_glb(value: Any) -> Path | None:
    if value is None:
        return None
    if isinstance(value, (str, Path)):
        candidate = Path(value)
        return candidate if candidate.suffix.lower() == ".glb" and candidate.exists() else None
    path = getattr(value, "path", None)
    if path:
        candidate = Path(path)
        if candidate.suffix.lower() == ".glb" and candidate.exists():
            return candidate
    if isinstance(value, dict):
        for item in value.values():
            found = find_glb(item)
            if found:
                return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = find_glb(item)
            if found:
                return found
    return None


def main() -> int:
    args = parse_args()
    job = load_job(args.job)
    source = job["sourceImages"][0]
    image_path = (args.input_dir / source["preparedFileName"]).resolve()
    if not image_path.is_file():
        raise FileNotFoundError(f"Prepared source image not found: {image_path}")

    intent = job.get("intent", "production-candidate")
    resolution = args.resolution or (512 if intent == "draft" else 1536 if intent == "source-master" else 1024)
    requested = job.get("outputRequest") or {}
    faces = args.faces or int(requested.get("targetWebTriangles") or 150000)
    faces = max(100000, min(1000000, int(round(faces / 10000) * 10000)))
    texture = args.texture or int(requested.get("targetTextureEdge") or 2048)
    texture = 1024 if texture <= 1024 else 4096 if texture >= 4096 else 2048
    seed = args.seed if args.seed is not None else stable_seed(str(job["jobId"]))

    plan = {
        "space": SPACE,
        "jobId": job["jobId"],
        "sourceImage": str(image_path),
        "resolution": resolution,
        "seed": seed,
        "decimationTarget": faces,
        "textureSize": texture,
        "output": str(args.output.resolve()),
        "hfTokenConfigured": bool(os.environ.get("HF_TOKEN")),
    }

    if args.dry_run:
        print(json.dumps(plan, indent=2))
        return 0

    try:
        from gradio_client import Client, handle_file
    except ImportError as exc:
        raise RuntimeError("gradio_client is required. Run: python -m pip install --upgrade gradio_client") from exc

    args.output.parent.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("HF_TOKEN") or None

    with tempfile.TemporaryDirectory(prefix="sls-trellis2-") as temp_dir:
        client = Client(SPACE, token=token, download_files=temp_dir, verbose=True)
        print(f"[SLS] Generating TRELLIS.2 candidate for {job['jobId']} at {resolution}px…")
        client.predict(
            image=handle_file(str(image_path)),
            seed=seed,
            resolution=str(resolution),
            ss_guidance_strength=7.5,
            ss_guidance_rescale=0.7,
            ss_sampling_steps=12,
            ss_rescale_t=5,
            shape_slat_guidance_strength=7.5,
            shape_slat_guidance_rescale=0.5,
            shape_slat_sampling_steps=12,
            shape_slat_rescale_t=3,
            tex_slat_guidance_strength=1,
            tex_slat_guidance_rescale=0,
            tex_slat_sampling_steps=12,
            tex_slat_rescale_t=3,
            api_name="/image_to_3d",
        )
        print(f"[SLS] Extracting GLB at ~{faces:,} faces / {texture}px texture…")
        result = client.predict(
            decimation_target=faces,
            texture_size=texture,
            api_name="/extract_glb",
        )
        glb = find_glb(result)
        if glb is None:
            raise RuntimeError("TRELLIS.2 completed but no downloaded GLB path was returned by the current Gradio API.")
        shutil.copy2(glb, args.output)

    metadata = {
        "schemaVersion": 1,
        "provider": "trellis2",
        "jobId": job["jobId"],
        "space": SPACE,
        "seed": seed,
        "resolution": resolution,
        "decimationTarget": faces,
        "textureSize": texture,
        "outputFile": args.output.name,
    }
    metadata_path = args.output.with_suffix(args.output.suffix + ".provider.json")
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"[SLS] Raw candidate: {args.output}")
    print(f"[SLS] Provider metadata: {metadata_path}")
    print("[SLS] Next: intake as raw candidate, then Blender cleanup/preflight and Digital Twin QA.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[SLS] Cancelled.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"[SLS] TRELLIS.2 runner failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
