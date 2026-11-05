from __future__ import annotations

import logging
import shutil
from pathlib import Path

import trimesh

from core.config import settings
from schemas import GenerateThumbnailRequest, ProcessModelRequest
from services.thumbnail_service import generate_placeholder_thumbnail


ALLOWED_EXTENSIONS = {".glb", ".gltf"}
GLB_MAGIC = b"glTF"
logger = logging.getLogger(__name__)


def relative_upload_path(file_path: Path) -> str:
    # The worker must return upload-root-relative paths so the Express API can build the public URL consistently.
    return file_path.resolve().relative_to(settings.upload_root.resolve()).as_posix()


def resolve_upload_path(file_path: str) -> Path:
    path = Path(file_path).resolve()
    root = settings.upload_root.resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError("The source file must be inside the configured upload directory.")
    return path


def _is_valid_model_signature(path: Path) -> bool:
    try:
        if path.suffix.lower() == ".glb":
            with path.open("rb") as handle:
                # GLB files must start with the 4-byte magic 0x676C5446 at offset 0, not later in the file.
                return handle.read(4) == GLB_MAGIC

        if path.suffix.lower() == ".gltf":
            return path.read_text(encoding="utf8").lstrip().startswith("{")
    except OSError:
        return False

    return False


def _coerce_loaded_to_mesh(loaded: object) -> trimesh.Trimesh | None:
    if isinstance(loaded, trimesh.Scene):
        concatenated = loaded.dump(concatenate=True)
        return concatenated if isinstance(concatenated, trimesh.Trimesh) else None

    if isinstance(loaded, trimesh.Trimesh):
        return loaded

    return None


def _inspect_mesh(file_path: Path) -> trimesh.Trimesh | None:
    loaded = trimesh.load(file_path, force="mesh")
    # Some GLBs still come back as Scene objects, so flatten them before reading vertices/faces.
    return _coerce_loaded_to_mesh(loaded)


def validate_model_path(file_path: str) -> dict:
    path = resolve_upload_path(file_path)
    exists = path.exists()
    extension = path.suffix.lower()

    return {
        "exists": exists,
        "filePath": str(path),
        "fileName": path.name,
        "extension": extension,
        "isSupported": extension in ALLOWED_EXTENSIONS and exists and _is_valid_model_signature(path),
        "fileSize": path.stat().st_size if exists else 0,
    }


def inspect_model(file_path: Path) -> dict:
    try:
        mesh = _inspect_mesh(file_path)
        if mesh is None:
            return {
                "vertexCount": None,
                "faceCount": None,
                "fileSize": file_path.stat().st_size if file_path.exists() else None,
                "boundingBox": None,
            }

        extents = mesh.bounding_box.extents if mesh.bounding_box is not None else None
        bounding_box = None
        if extents is not None:
            bounding_box = {
                "x": round(float(extents[0]), 4),
                "y": round(float(extents[1]), 4),
                "z": round(float(extents[2]), 4),
            }

        return {
            "vertexCount": int(len(mesh.vertices)) if mesh.vertices is not None else None,
            "faceCount": int(len(mesh.faces)) if mesh.faces is not None else None,
            "fileSize": file_path.stat().st_size if file_path.exists() else None,
            "boundingBox": bounding_box,
        }
    except Exception:
        # FIX: trimesh inspection failures used to disappear silently, leaving the dashboard with no clue why metadata was missing.
        logger.warning("inspect_model: trimesh failed to inspect %s", file_path, exc_info=True)
        return {
            "vertexCount": None,
            "faceCount": None,
            "fileSize": file_path.stat().st_size if file_path.exists() else None,
            "boundingBox": None,
        }


def generate_thumbnail(payload: GenerateThumbnailRequest) -> dict:
    thumbnail_path = generate_placeholder_thumbnail(
        model_id=payload.modelId,
        dish_name=payload.name,
        file_name=Path(payload.filePath).name,
    )

    return {
        "thumbnailPath": relative_upload_path(thumbnail_path)
    }


def process_model(payload: ProcessModelRequest) -> dict:
    validation = validate_model_path(payload.originalFilePath)

    if not validation["exists"]:
        raise FileNotFoundError("Uploaded model file was not found.")

    if not validation["isSupported"]:
        raise ValueError("Only .glb and .gltf files are supported.")

    source_path = Path(validation["filePath"])
    metadata = inspect_model(source_path)
    if not metadata["vertexCount"] or not metadata["faceCount"]:
        raise ValueError("The model must contain readable, nonempty geometry.")
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    processed_name = f"{payload.modelId}{source_path.suffix.lower()}"
    processed_path = settings.processed_dir / processed_name
    shutil.copy2(source_path, processed_path)

    thumbnail = generate_thumbnail(
        GenerateThumbnailRequest(
            filePath=str(source_path),
            name=payload.name,
            modelId=payload.modelId,
        )
    )

    return {
        "status": "PROCESSED",
        "processedPath": relative_upload_path(processed_path),
        "thumbnailPath": thumbnail["thumbnailPath"],
        "metadata": metadata,
        "processingNotes": "Uploaded model validated and copied into the processed directory.",
        "validation": validation,
        "isOptimized": False,
    }
