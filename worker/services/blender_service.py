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
        
        # Calculate bounding box
        bounds = scene.bounds
        extents = scene.extents
        
        # Scale to 25cm (0.25 units) along the longest dimension
        max_extent = extents.max()
        scale_factor = 0.25 / max_extent if max_extent > 0 else 1.0
        
        # Center the model at X=0, Z=0, and place the bottom at Y=0
        center = scene.centroid
        bottom_y = bounds[0][1] # min Y
        
        translation = [-center[0], -bottom_y, -center[2]]
        
        # Apply transformation
        matrix = trimesh.transformations.scale_and_translate(
            scale=scale_factor,
            translate=translation
        )
        scene.apply_transform(matrix)
        
        # Save back
        path.write_bytes(scene.export(file_type="glb"))
        
        return {
            "available": True,
            "step": "normalize_scale",
            "message": "Model scaled to 25cm and aligned to ground plane."
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
