# Scorpion Leather Studio Blender preflight
# Usage:
# blender --background product.blend --python scripts/blender/sls_asset_preflight.py -- --manifest path/to/manifest.json
# Optional export after a clean check:
# blender --background product.blend --python scripts/blender/sls_asset_preflight.py -- --manifest manifest.json --export output.glb

import argparse
import json
import math
import os
import sys

import bpy


def parse_args():
    args = sys.argv
    args = args[args.index("--") + 1:] if "--" in args else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--export")
    return parser.parse_args(args)


def close(a, b, epsilon=1e-4):
    return abs(a - b) <= epsilon


def main():
    options = parse_args()
    with open(options.manifest, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    errors = []
    warnings = []

    objects = list(bpy.context.scene.objects)
    names = {}
    for obj in objects:
        names.setdefault(obj.name, []).append(obj)

    duplicates = [name for name, entries in names.items() if len(entries) > 1]
    if duplicates:
        errors.append("Duplicate object names: " + ", ".join(sorted(duplicates)))

    root_name = manifest.get("rootNode", "")
    root = bpy.data.objects.get(root_name)
    if root is None:
        errors.append(f'Missing root object "{root_name}".')
    else:
        if not all(close(value, 1.0) for value in root.scale):
            errors.append(f'Root "{root_name}" scale must be applied to 1,1,1; found {tuple(round(v, 6) for v in root.scale)}.')

    profiles = manifest.get("materialSlotProfiles", {})
    slots = manifest.get("materialSlots", {})
    for slot_id, node_names in slots.items():
        profile = profiles.get(slot_id)
        if profile is None:
            errors.append(f'Material slot "{slot_id}" has no materialSlotProfiles entry.')
            continue

        for node_name in node_names:
            obj = bpy.data.objects.get(node_name)
            if obj is None:
                errors.append(f'Material slot "{slot_id}" references missing object "{node_name}".')
                continue
            if obj.type != "MESH":
                errors.append(f'Material slot "{slot_id}" object "{node_name}" is not a mesh.')
                continue

            if profile.get("requiresUv0"):
                if not obj.data.uv_layers:
                    errors.append(f'Mesh "{node_name}" requires UV0 but has no UV map.')
                elif obj.data.uv_layers.active is None:
                    errors.append(f'Mesh "{node_name}" has UV layers but no active UV0 layer.')

            if any(value < 0 for value in obj.scale):
                warnings.append(f'Mesh "{node_name}" has negative object scale.')
            if not close(obj.scale.x, obj.scale.y) or not close(obj.scale.y, obj.scale.z):
                warnings.append(f'Mesh "{node_name}" has non-uniform object scale; verify physical UV scale after export.')

    for zone_id, zone in manifest.get("customizationZones", {}).items():
        node_name = zone.get("node", "")
        obj = bpy.data.objects.get(node_name)
        if obj is None:
            errors.append(f'Customization zone "{zone_id}" references missing object "{node_name}".')
        elif obj.type != "MESH":
            errors.append(f'Customization zone "{zone_id}" must target a mesh object, not {obj.type}.')

        size = zone.get("sizeMeters", [])
        if len(size) != 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in size):
            errors.append(f'Customization zone "{zone_id}" has invalid physical size.')

    print("\nSLS ASSET PREFLIGHT")
    print(f"Manifest: {os.path.abspath(options.manifest)}")
    print(f"Errors: {len(errors)} | Warnings: {len(warnings)}")
    for message in errors:
        print("ERROR:", message)
    for message in warnings:
        print("WARN:", message)

    if errors:
        raise SystemExit(2)

    if options.export:
        destination = os.path.abspath(options.export)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=destination,
            export_format="GLB",
            export_yup=True,
            export_apply=False,
            export_animations=False,
        )
        print("Exported:", destination)


if __name__ == "__main__":
    main()
