# Scorpion Leather Studio Blender preflight
# Usage:
# blender --background product.blend --python scripts/blender/sls_asset_preflight.py -- --manifest path/to/manifest.json
# Optional export after a clean check:
# blender --background product.blend --python scripts/blender/sls_asset_preflight.py -- --manifest manifest.json --export output.glb

import argparse
import json
import math
import os
import statistics
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


def estimate_meters_per_uv_unit(obj):
    mesh = obj.data
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return None

    ratios = []
    polygons = list(mesh.polygons)
    stride = max(1, len(polygons) // 2000)

    for polygon in polygons[::stride]:
        loops = list(polygon.loop_indices)
        if len(loops) < 3:
            continue
        for index, loop_index in enumerate(loops):
            next_loop_index = loops[(index + 1) % len(loops)]
            vertex_index = mesh.loops[loop_index].vertex_index
            next_vertex_index = mesh.loops[next_loop_index].vertex_index

            left = obj.matrix_world @ mesh.vertices[vertex_index].co
            right = obj.matrix_world @ mesh.vertices[next_vertex_index].co
            physical = (right - left).length

            uv_left = uv_layer.data[loop_index].uv
            uv_right = uv_layer.data[next_loop_index].uv
            uv_distance = (uv_right - uv_left).length

            if physical > 1e-5 and uv_distance > 1e-5:
                ratios.append(physical / uv_distance)

    return statistics.median(ratios) if ratios else None


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

            expected_uv_scale = profile.get("metersPerUvUnit")
            if expected_uv_scale is not None and obj.data.uv_layers.active is not None:
                actual_uv_scale = estimate_meters_per_uv_unit(obj)
                if actual_uv_scale is None:
                    errors.append(f'Mesh "{node_name}" physical UV scale could not be measured.')
                else:
                    tolerance = profile.get("uvScaleToleranceRatio", 0.2)
                    delta = abs(actual_uv_scale - expected_uv_scale) / expected_uv_scale
                    if delta > tolerance:
                        errors.append(
                            f'Mesh "{node_name}" UV scale is {actual_uv_scale:.4f} m/unit; '
                            f'expected {expected_uv_scale:.4f} m/unit ±{tolerance * 100:.0f}%.'
                        )
                    else:
                        print(
                            f'UV SCALE: {node_name}: {actual_uv_scale:.4f} m/unit '
                            f'(target {expected_uv_scale:.4f})'
                        )

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
