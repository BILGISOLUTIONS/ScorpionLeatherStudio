#!/usr/bin/env python3
"""Scorpion Leather Studio conservative raw reconstruction preparation."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
POLICY_DIR = SCRIPT_DIR.parent / "reconstruction"
if str(POLICY_DIR) not in sys.path:
    sys.path.insert(0, str(POLICY_DIR))

from prep_policy import plan_decimation, plan_uniform_scale  # noqa: E402


def parse_args():
    raw = sys.argv
    raw = raw[raw.index("--") + 1:] if "--" in raw else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--handoff", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--save-blend")
    return parser.parse_args(raw)


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_candidate(path):
    extension = Path(path).suffix.lower()
    absolute = os.path.abspath(path)
    if extension in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=absolute)
    elif extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=absolute)
    elif extension == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=absolute)
        else:
            bpy.ops.import_scene.obj(filepath=absolute)
    elif extension == ".ply":
        if hasattr(bpy.ops.wm, "ply_import"):
            bpy.ops.wm.ply_import(filepath=absolute)
        else:
            bpy.ops.import_mesh.ply(filepath=absolute)
    else:
        raise ValueError(f"Unsupported reconstruction input format: {extension or '(none)'}")
    return extension


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def triangle_count(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def world_bounds(meshes):
    if not meshes:
        raise ValueError("Imported candidate contains no mesh objects.")
    points = []
    for obj in meshes:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    maximum = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    return minimum, maximum


def blender_dimensions(minimum, maximum):
    size = maximum - minimum
    return (float(size.x), float(size.z), float(size.y))


def top_level_objects(objects):
    object_set = set(objects)
    return [obj for obj in objects if obj.parent not in object_set]


def apply_uniform_normalization(objects, scale, minimum, maximum):
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    translation = Vector((-center_x * scale, -center_y * scale, -minimum.z * scale))
    transform = Matrix.Translation(translation) @ Matrix.Scale(scale, 4)
    for obj in top_level_objects(objects):
        obj.matrix_world = transform @ obj.matrix_world


def remove_nonproduct_scene_objects():
    removed = []
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            removed.append({"name": obj.name, "type": obj.type})
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def ensure_root(objects):
    existing = bpy.data.objects.get("SLS_ProductRoot")
    if existing is not None:
        existing.name = "Provider_SLS_ProductRoot"

    root = bpy.data.objects.new("SLS_ProductRoot", None)
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    root.scale = (1, 1, 1)
    bpy.context.scene.collection.objects.link(root)

    for obj in top_level_objects([entry for entry in objects if entry != root]):
        matrix = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = matrix
    return root


def apply_decimation(meshes, ratio, blockers, warnings):
    if ratio >= 0.999:
        return
    for obj in meshes:
        count = triangle_count(obj)
        if count < 200:
            continue
        if obj.data.shape_keys is not None:
            blockers.append({
                "code": "shape_keys_prevent_safe_decimation",
                "message": f'Mesh "{obj.name}" has shape keys; automatic destructive decimation was skipped.',
            })
            continue
        modifier = obj.modifiers.new(name="SLS_WebDecimate", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, ratio))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception as exc:
            blockers.append({
                "code": "decimation_failed",
                "message": f'Automatic decimation failed for "{obj.name}": {exc}',
            })
        finally:
            obj.select_set(False)

    warnings.append({
        "code": "automatic_decimation_applied",
        "message": f"Applied conservative global decimation ratio {ratio:.4f}; visual silhouette/detail review is still required.",
    })


def mesh_diagnostics(meshes):
    result = []
    for obj in meshes:
        material_count = len([slot for slot in obj.material_slots if slot.material is not None])
        result.append({
            "nodeName": obj.name,
            "triangleCount": triangle_count(obj),
            "vertexCount": len(obj.data.vertices),
            "materialCount": material_count,
            "hasUv0": bool(obj.data.uv_layers and obj.data.uv_layers.active),
            "hasShapeKeys": obj.data.shape_keys is not None,
            "scale": [float(value) for value in obj.scale],
        })
    return result


def image_diagnostics():
    images = []
    for image in bpy.data.images:
        if image.source == "VIEWER":
            continue
        width, height = int(image.size[0]), int(image.size[1])
        images.append({
            "name": image.name,
            "width": width,
            "height": height,
            "maxEdge": max(width, height),
        })
    return images


def write_report(path, value):
    destination = Path(path).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main():
    options = parse_args()
    handoff = load_json(options.handoff)
    if handoff.get("schemaVersion") != 1:
        raise ValueError("Unsupported SLS processing-handoff schema version.")

    target = handoff.get("authoritativeDimensionsMeters") or {}
    delivery = handoff.get("deliveryTarget") or {}
    target_dimensions = (
        float(target.get("width", 0)),
        float(target.get("height", 0)),
        float(target.get("depth", 0)),
    )
    tolerance = float(delivery.get("dimensionToleranceRatio", 0.08))
    max_triangles = int(delivery.get("maxTriangles", 150000))
    max_model_bytes = int(delivery.get("maxModelBytes", 8 * 1024 * 1024))
    max_meshes = int(delivery.get("maxMeshes", 48))
    max_materials = int(delivery.get("maxMaterials", 16))
    max_textures = int(delivery.get("maxTextures", 24))
    max_texture_edge = int(delivery.get("maxTextureEdge", 2048))

    clear_scene()
    source_extension = import_candidate(options.input)
    removed = remove_nonproduct_scene_objects()
    meshes = mesh_objects()
    minimum, maximum = world_bounds(meshes)
    before_dimensions = blender_dimensions(minimum, maximum)
    scale_plan = plan_uniform_scale(before_dimensions, target_dimensions, tolerance)

    all_imported = list(bpy.context.scene.objects)
    apply_uniform_normalization(all_imported, scale_plan["scale"], minimum, maximum)
    root = ensure_root(list(bpy.context.scene.objects))

    blockers = []
    warnings = []
    authoring = []

    if source_extension not in (".glb", ".gltf"):
        warnings.append({
            "code": "source_axis_requires_manual_verification",
            "message": "Non-glTF provider input orientation is not authoritative; verify physical front/up axes before semantic authoring.",
        })

    if not scale_plan["withinTolerance"]:
        blockers.append({
            "code": "physical_envelope_mismatch",
            "message": (
                "Uniform scaling cannot match the captured physical envelope within "
                f"{tolerance * 100:.1f}% on all axes. Do not non-uniformly stretch the product; "
                "correct the reconstructed geometry manually against capture evidence."
            ),
        })

    before_triangles = sum(triangle_count(obj) for obj in meshes)
    decimation = plan_decimation([triangle_count(obj) for obj in meshes], max_triangles)
    if decimation["extremeReduction"]:
        authoring.append({
            "code": "manual_retopology_required",
            "message": (
                f"Raw candidate has {before_triangles:,} triangles and would require an aggressive "
                f"{decimation['ratio']:.4f} reduction to reach {max_triangles:,}. Automatic decimation was skipped."
            ),
        })
    elif decimation["applyAutomatically"]:
        apply_decimation(meshes, decimation["ratio"], blockers, warnings)

    minimum_after, maximum_after = world_bounds(meshes)
    after_dimensions = blender_dimensions(minimum_after, maximum_after)
    after_triangles = sum(triangle_count(obj) for obj in meshes)

    required_nodes = list((handoff.get("semanticContract") or {}).get("requiredNodeNames") or [])
    present_names = {obj.name for obj in bpy.context.scene.objects}
    missing_nodes = sorted(name for name in required_nodes if name not in present_names)
    if missing_nodes:
        authoring.append({
            "code": "semantic_authoring_required",
            "message": "Required semantic nodes are not guessed automatically: " + ", ".join(missing_nodes),
        })

    material_slots = list((handoff.get("semanticContract") or {}).get("materialSlots") or [])
    unresolved_slots = []
    for slot in material_slots:
        node_names = list(slot.get("nodeNames") or [])
        missing = [name for name in node_names if name not in present_names]
        if missing:
            unresolved_slots.append({"slotId": slot.get("slotId"), "missingNodeNames": missing})
    if unresolved_slots:
        authoring.append({
            "code": "material_slot_authoring_required",
            "message": "Material-slot ownership remains unresolved until semantic mesh authoring is completed.",
        })

    diagnostics = mesh_diagnostics(meshes)
    images = image_diagnostics()
    material_names = {
        slot.material.name
        for obj in meshes
        for slot in obj.material_slots
        if slot.material is not None
    }

    if len(meshes) > max_meshes:
        authoring.append({"code": "mesh_budget_exceeded", "message": f"{len(meshes)} meshes exceed the {max_meshes} production limit."})
    if len(material_names) > max_materials:
        authoring.append({"code": "material_budget_exceeded", "message": f"{len(material_names)} materials exceed the {max_materials} production limit."})
    if len(images) > max_textures:
        authoring.append({"code": "texture_count_exceeded", "message": f"{len(images)} images exceed the {max_textures} production texture limit."})
    oversized_images = [image for image in images if image["maxEdge"] > max_texture_edge]
    if oversized_images:
        authoring.append({
            "code": "texture_resolution_exceeded",
            "message": (
                f"{len(oversized_images)} provider texture(s) exceed {max_texture_edge}px. "
                "Keep them only as reconstruction reference or replace/downsample during material authoring."
            ),
        })
    if after_triangles > max_triangles:
        authoring.append({
            "code": "triangle_budget_exceeded",
            "message": f"{after_triangles:,} triangles remain above the {max_triangles:,} production limit.",
        })

    output = Path(options.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=False,
    )
    output_bytes = output.stat().st_size
    if output_bytes > max_model_bytes:
        authoring.append({
            "code": "model_size_exceeded",
            "message": (
                f"Normalized GLB is {output_bytes / 1024 / 1024:.2f} MB, above the "
                f"{max_model_bytes / 1024 / 1024:.0f} MB production limit."
            ),
        })

    if options.save_blend:
        blend_path = Path(options.save_blend).resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    report = {
        "schemaVersion": 1,
        "stage": "raw-reconstruction-preparation",
        "candidateId": handoff.get("candidateId"),
        "jobId": handoff.get("jobId"),
        "assetId": handoff.get("assetId"),
        "productId": handoff.get("productId"),
        "sourceCaptureSessionId": handoff.get("sourceCaptureSessionId"),
        "sourceModelFile": Path(options.input).name,
        "normalizedModelFile": output.name,
        "productionApproved": False,
        "requiresDigitalTwinQa": True,
        "status": (
            "manual-geometry-correction-required"
            if blockers else
            "manual-authoring-required"
            if authoring else
            "normalized-candidate-ready-for-digital-twin-qa"
        ),
        "authority": {
            "uniformScaleOnly": True,
            "nonUniformGeometryCorrectionApplied": False,
            "realProductRemainsGeometryAuthority": True,
            "providerMaterialsRemainReferenceOnly": True,
        },
        "physicalEnvelope": {
            "targetMeters": dict(zip(("width", "height", "depth"), target_dimensions)),
            "beforeMeters": dict(zip(("width", "height", "depth"), before_dimensions)),
            "afterMeters": dict(zip(("width", "height", "depth"), after_dimensions)),
            "uniformScale": scale_plan["scale"],
            "deviationRatios": dict(zip(("width", "height", "depth"), scale_plan["deviations"])),
            "toleranceRatio": tolerance,
        },
        "geometry": {
            "trianglesBefore": before_triangles,
            "trianglesAfter": after_triangles,
            "targetTriangles": max_triangles,
            "decimationPlan": decimation,
            "meshCount": len(meshes),
            "meshDiagnostics": diagnostics,
        },
        "materials": {
            "materialCount": len(material_names),
            "textureCount": len(images),
            "textures": images,
            "unresolvedSlots": unresolved_slots,
        },
        "semantic": {
            "requiredNodeNames": required_nodes,
            "missingNodeNames": missing_nodes,
            "rootNodeCreated": root.name,
        },
        "removedNonProductObjects": removed,
        "blockers": blockers,
        "authoringRequirements": authoring,
        "warnings": warnings,
        "outputBytes": output_bytes,
    }
    write_report(options.report, report)

    print("\nSLS RAW RECONSTRUCTION PREPARATION")
    print("Input:", os.path.abspath(options.input))
    print("Output:", output)
    print("Report:", os.path.abspath(options.report))
    print(f"Uniform scale: {scale_plan['scale']:.6f}")
    print(f"Triangles: {before_triangles:,} -> {after_triangles:,}")
    print(f"Blockers: {len(blockers)} | Authoring requirements: {len(authoring)} | Warnings: {len(warnings)}")
    print("Status:", report["status"])
    print("Production approved: NO - Digital Twin QA and named human review remain required.")


if __name__ == "__main__":
    main()
