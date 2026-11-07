"""Untrusted model resources stay contained and processed assets are portable."""
import json
import struct
import builtins
import io
from pathlib import Path

import pytest
import trimesh

from test_worker_input_boundaries import isolated_uploads, request_payload
from schemas import ProcessModelRequest
from services import model_service


def triangle_gltf(path, uri):
    data = {
        "asset": {"version": "2.0"},
        "buffers": [{"uri": uri, "byteLength": 42}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 36},
                        {"buffer": 0, "byteOffset": 36, "byteLength": 6}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3",
             "min": [0, 0, 0], "max": [1, 1, 0]},
            {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "nodes": [{"mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0,
    }
    path.write_text(json.dumps(data), encoding="utf8")


@pytest.mark.parametrize("uri", ["../../outside.bin", "%2e%2e/%2e%2e/outside.bin"])
def test_gltf_cannot_read_secondary_buffer_outside_uploads(isolated_uploads, tmp_path, monkeypatch, uri):
    settings, original = isolated_uploads
    source = original.with_suffix(".gltf")
    outside = tmp_path / "outside.bin"
    outside.write_bytes(struct.pack("<9f3H", 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2))
    triangle_gltf(source, uri)
    opened_outside = []
    original_open = builtins.open

    def observe_open(file, *args, **kwargs):
        if not isinstance(file, int) and Path(file).resolve() == outside.resolve():
            opened_outside.append(file)
        return original_open(file, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", observe_open)
    monkeypatch.setattr(io, "open", observe_open)
    with pytest.raises(ValueError):
        model_service.process_model(ProcessModelRequest(**request_payload(source)))
    assert opened_outside == [], "reject a reference before reading it"
    assert not settings.processed_dir.exists()


def test_relative_sidecars_become_self_contained_processed_glb(isolated_uploads):
    settings, original = isolated_uploads
    source = original.with_suffix(".gltf")
    buffer = source.with_suffix(".bin")
    buffer.write_bytes(struct.pack("<9f3H", 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2))
    triangle_gltf(source, buffer.name)
    result = model_service.process_model(ProcessModelRequest(**request_payload(source)))
    output = settings.upload_root / result["processedPath"]
    assert output.suffix == ".glb"
    # Removing source dependencies must not affect the public output.
    buffer.unlink()
    source.unlink()
    loaded = trimesh.load(output, force="mesh")
    assert len(loaded.vertices) == 3
    assert len(loaded.faces) == 1


def test_disallowed_texture_cannot_be_silently_ignored(isolated_uploads, tmp_path):
    from PIL import Image
    settings, original = isolated_uploads
    source = original.with_suffix(".gltf")
    buffer = source.with_suffix(".bin")
    buffer.write_bytes(struct.pack("<9f3H", 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2))
    triangle_gltf(source, buffer.name)
    Image.new("RGB", (1, 1)).save(tmp_path / "outside.png")
    data = json.loads(source.read_text(encoding="utf8"))
    data["images"] = [{"uri": "../../outside.png"}]
    data["textures"] = [{"source": 0}]
    data["materials"] = [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]
    data["meshes"][0]["primitives"][0]["material"] = 0
    source.write_text(json.dumps(data), encoding="utf8")
    with pytest.raises(ValueError):
        model_service.process_model(ProcessModelRequest(**request_payload(source)))
    assert not settings.processed_dir.exists()
