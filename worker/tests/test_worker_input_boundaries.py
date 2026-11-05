"""Worker boundary regressions using original models in temporary folders only."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import trimesh
from fastapi.testclient import TestClient


WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

import main
from schemas import ProcessModelRequest
from services import model_service, thumbnail_service


@pytest.fixture
def isolated_uploads(tmp_path, monkeypatch):
    upload_root = tmp_path / "uploads"
    models_dir = upload_root / "models"
    models_dir.mkdir(parents=True)
    settings = SimpleNamespace(
        upload_root=upload_root,
        processed_dir=upload_root / "processed",
        thumbnails_dir=upload_root / "thumbnails",
    )
    monkeypatch.setattr(model_service, "settings", settings)
    monkeypatch.setattr(thumbnail_service, "settings", settings)
    source = models_dir / "original-box.glb"
    trimesh.creation.box(extents=(0.2, 0.05, 0.2)).export(source)
    return settings, source


def request_payload(source: Path, model_id: str = "synthetic-dish") -> dict:
    return {
        "modelId": model_id,
        "name": "Synthetic Dish",
        "originalFilePath": str(source),
        "fileName": source.name,
        "fileType": "model/gltf-binary",
    }


def test_valid_local_model_still_processes(isolated_uploads):
    settings, source = isolated_uploads

    result = model_service.process_model(ProcessModelRequest(**request_payload(source)))

    assert result["status"] == "PROCESSED"
    assert result["processedPath"] == "processed/synthetic-dish.glb"
    assert result["metadata"]["faceCount"] == 12
    assert (settings.processed_dir / "synthetic-dish.glb").is_file()


def test_validation_rejects_model_outside_upload_root(isolated_uploads, tmp_path):
    _, source = isolated_uploads
    external_source = tmp_path / "outside-upload-root.glb"
    external_source.write_bytes(source.read_bytes())

    with pytest.raises(ValueError):
        model_service.validate_model_path(str(external_source))


def test_model_id_traversal_is_rejected_before_any_output_write(isolated_uploads, tmp_path):
    _, source = isolated_uploads

    with pytest.raises(ValueError):
        model_service.process_model(
            ProcessModelRequest(**request_payload(source, model_id="../../escaped"))
        )

    # Both paths are inside the pytest-owned temporary directory. A late
    # relative-path error is insufficient if an output already escaped uploads.
    assert not (tmp_path / "escaped.glb").exists()
    assert not (tmp_path / "escaped.jpg").exists()


def test_glb_magic_without_valid_geometry_is_not_reported_processed(isolated_uploads):
    _, source = isolated_uploads
    malformed = source.with_name("malformed.glb")
    malformed.write_bytes(b"glTFthis-is-not-a-valid-glb")

    response = TestClient(main.app).post("/process-model", json=request_payload(malformed))

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"
