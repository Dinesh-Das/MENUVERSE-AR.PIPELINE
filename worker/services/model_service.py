from __future__ import annotations

import shutil
from pathlib import Path

import trimesh

from core.config import settings
from schemas import GenerateThumbnailRequest, ProcessModelRequest
from services.thumbnail_service import generate_placeholder_thumbnail


ALLOWED_EXTENSIONS = {".glb", ".gltf"}


def _public_path(folder_name: str, file_name: str) -> str:
    return f"/uploads/{folder_name}/{file_name}"


def validate_model_path(file_path: str) -> dict:
    path = Path(file_path).resolve()
    exists = path.exists()
    extension = path.suffix.lower()

    return {
        "exists": exists,
        "filePath": str(path),
        "fileName": path.name,
        "extension": extension,
        "isSupported": extension in ALLOWED_EXTENSIONS,
        "fileSize": path.stat().st_size if exists else 0,
    }


def inspect_model(file_path: Path) -> dict:
    polygon_count = None
    texture_count = None
    dimensions = None

    try:
        loaded = trimesh.load(file_path, force="scene")
        geometries = list(getattr(loaded, "geometry", {}).values()) if hasattr(loaded, "geometry") else [loaded]

        polygon_count = 0
        texture_count = 0

        extents = []

        for geometry in geometries:
            if hasattr(geometry, "faces") and geometry.faces is not None:
                polygon_count += int(len(geometry.faces))

            if hasattr(geometry, "visual") and getattr(geometry.visual, "material", None) is not None:
                texture_count += 1

            if hasattr(geometry, "extents") and geometry.extents is not None:
                extents.append(geometry.extents)

        if extents:
            max_x = max(float(extent[0]) for extent in extents)
            max_y = max(float(extent[1]) for extent in extents)
            max_z = max(float(extent[2]) for extent in extents)
            dimensions = {
                "x": round(max_x, 4),
                "y": round(max_y, 4),
                "z": round(max_z, 4),
            }
    except Exception:
        polygon_count = None
        texture_count = None
        dimensions = None

    return {
        "polygonCount": polygon_count,
        "textureCount": texture_count,
        "dimensions": dimensions,
    }


def generate_thumbnail(payload: GenerateThumbnailRequest) -> dict:
    thumbnail_path = generate_placeholder_thumbnail(
        model_id=payload.modelId,
        dish_name=payload.name,
        file_name=Path(payload.filePath).name,
    )

    return {
        "thumbnailUrl": _public_path("thumbnails", thumbnail_path.name)
    }


def process_model(payload: ProcessModelRequest) -> dict:
    validation = validate_model_path(payload.originalFilePath)

    if not validation["exists"]:
        raise FileNotFoundError("Uploaded model file was not found.")

    if not validation["isSupported"]:
        raise ValueError("Only .glb and .gltf files are supported.")

    source_path = Path(validation["filePath"])
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    processed_name = f"{payload.modelId}{source_path.suffix.lower()}"
    processed_path = settings.processed_dir / processed_name
    shutil.copy2(source_path, processed_path)

    metadata = inspect_model(source_path)
    thumbnail = generate_thumbnail(
        GenerateThumbnailRequest(
            filePath=str(source_path),
            name=payload.name,
            modelId=payload.modelId,
        )
    )

    return {
        "processedFileUrl": _public_path("processed", processed_path.name),
        "thumbnailUrl": thumbnail["thumbnailUrl"],
        "fileName": processed_path.name,
        "fileType": payload.fileType,
        "fileSize": processed_path.stat().st_size,
        "polygonCount": metadata["polygonCount"],
        "textureCount": metadata["textureCount"],
        "dimensions": metadata["dimensions"],
        "isOptimized": False,
        "status": "PROCESSED",
        "processingNotes": "Uploaded model validated and copied into the processed directory.",
        "validation": validation,
    }
