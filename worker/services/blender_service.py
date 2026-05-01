from __future__ import annotations

from pathlib import Path


def reduce_mesh(model_path: str | Path) -> dict:
    return {
        "available": False,
        "step": "reduce_mesh",
        "message": "Blender-based mesh reduction is not enabled in the MVP."
    }


import trimesh
import numpy as np

def normalize_scale(model_path: str | Path) -> dict:
    try:
        path = Path(model_path)
        scene = trimesh.load(path, force="scene")

        if not isinstance(scene, trimesh.Scene) or len(scene.geometry) == 0:
            return {
                "available": False,
                "step": "normalize_scale",
                "message": "Loaded object is not a non-empty Scene.",
            }

        extents = scene.extents
        max_extent = float(extents.max())
        if max_extent <= 0:
            return {
                "available": False,
                "step": "normalize_scale",
                "message": "Scene extents are zero — cannot scale.",
            }

        # FIX: the old combined scale/translate matrix used pre-scale bounds, which made AR models float above the table.
        scale_factor = 0.25 / max_extent
        scene.apply_scale(scale_factor)

        bounds = scene.bounds
        centroid = scene.centroid
        bottom_y = float(bounds[0][1])

        scene.apply_translation([
            -float(centroid[0]),
            -bottom_y,
            -float(centroid[2]),
        ])

        path.write_bytes(scene.export(file_type="glb"))

        return {
            "available": True,
            "step": "normalize_scale",
            "message": (
                f"Model scaled to 25 cm (factor {scale_factor:.4f}) and aligned to ground plane."
            ),
        }
    except Exception as e:
        return {
            "available": False,
            "step": "normalize_scale",
            "message": f"Scale normalization failed: {str(e)}"
        }

def bake_textures(model_path: str | Path) -> dict:
    return {
        "available": False,
        "step": "bake_textures",
        "message": "Blender-based texture baking is not enabled in the MVP."
    }


def export_glb(model_path: str | Path) -> dict:
    return {
        "available": False,
        "step": "export_glb",
        "message": "Blender-based GLB export is not enabled in the MVP."
    }
