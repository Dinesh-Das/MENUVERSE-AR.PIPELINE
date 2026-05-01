from __future__ import annotations

import sys
import shutil
import uuid
from pathlib import Path
from types import SimpleNamespace

import trimesh
from fastapi.testclient import TestClient


WORKER_ROOT = Path(__file__).resolve().parents[1]
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))

import main  # noqa: E402
from services import model_service, thumbnail_service  # noqa: E402


def _test_settings(upload_root: Path) -> SimpleNamespace:
    return SimpleNamespace(
        upload_root=upload_root,
        processed_dir=upload_root / "processed",
        thumbnails_dir=upload_root / "thumbnails",
    )


def test_process_model_returns_processed_path_for_real_glb(monkeypatch):
    runtime_root = WORKER_ROOT / "tests" / ".runtime" / uuid.uuid4().hex
    try:
        upload_root = runtime_root / "uploads"
        models_dir = upload_root / "models"
        models_dir.mkdir(parents=True)

        settings = _test_settings(upload_root)
        settings.processed_dir.mkdir(parents=True)
        settings.thumbnails_dir.mkdir(parents=True)

        monkeypatch.setattr(model_service, "settings", settings)
        monkeypatch.setattr(thumbnail_service, "settings", settings)

        source_glb = models_dir / "dish.glb"
        trimesh.creation.box(extents=(0.2, 0.05, 0.2)).export(source_glb)

        client = TestClient(main.app)
        response = client.post(
            "/process-model",
            json={
                "modelId": "test-dish",
                "name": "Test Dish",
                "originalFilePath": str(source_glb),
                "fileName": source_glb.name,
                "fileType": "model/gltf-binary",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "PROCESSED"
        assert body["processedPath"] == "processed/test-dish.glb"
        assert body["thumbnailPath"] == "thumbnails/test-dish.jpg"
        assert body["metadata"]["faceCount"] is not None
    finally:
        shutil.rmtree(runtime_root, ignore_errors=True)


def test_health_reports_dependency_versions():
    client = TestClient(main.app)
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["trimesh_version"], str)
    assert isinstance(body["pillow_version"], str)
    assert isinstance(body["colmap_available"], bool)
