from __future__ import annotations

from PIL import __version__ as pillow_version
from fastapi import FastAPI, HTTPException
from starlette.concurrency import run_in_threadpool
import trimesh

from schemas import GenerateThumbnailRequest, ProcessModelRequest, ProcessVideoRequest, ValidateModelRequest, WorkerResult
from services.model_service import generate_thumbnail, process_model, validate_model_path
from services.video_pipeline_service import get_video_pipeline_health, process_video


app = FastAPI(
    title="MenuVerse AR Pipeline Worker",
    version="0.1.0",
    description="MVP worker for model validation, thumbnail generation, and lightweight processing.",
)


@app.get("/health")
def health() -> dict:
    video_pipeline = get_video_pipeline_health()
    return {
        "ok": True,
        "service": "menuverse-ar-pipeline-worker",
        "videoPipeline": video_pipeline,
        # Operators need dependency versions here so broken worker environments are obvious from a single health call.
        "trimesh_version": trimesh.__version__,
        "pillow_version": pillow_version,
        "colmap_available": bool(video_pipeline["colmapAvailable"]),
    }


@app.post("/validate-model", response_model=WorkerResult)
def validate_model(payload: ValidateModelRequest) -> WorkerResult:
    validation = validate_model_path(payload.filePath)

    if not validation["exists"]:
        raise HTTPException(status_code=404, detail="Model file not found.")

    if not validation["isSupported"]:
        raise HTTPException(status_code=400, detail="Only .glb and .gltf files are supported.")

    return WorkerResult(status="VALIDATED", validation=validation)


@app.post("/generate-thumbnail", response_model=WorkerResult)
async def create_thumbnail(payload: GenerateThumbnailRequest) -> WorkerResult:
    try:
        result = await run_in_threadpool(generate_thumbnail, payload)
        return WorkerResult(status="THUMBNAIL_READY", **result)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {error}") from error


@app.post("/process-model", response_model=WorkerResult)
async def process_model_endpoint(payload: ProcessModelRequest) -> WorkerResult:
    try:
        result = await run_in_threadpool(process_model, payload)
        return WorkerResult(**result)
    except Exception as error:
        # The Express queue inspects the body, so processing failures must still come back as HTTP 200 + FAILED.
        return WorkerResult(
            status="FAILED",
            error=f"Model processing failed: {error}",
            processingNotes=f"Model processing failed: {error}",
        )


@app.post("/process", response_model=WorkerResult)
async def process_model_alias(payload: ProcessModelRequest) -> WorkerResult:
    return await process_model_endpoint(payload)


@app.post("/process-video", response_model=WorkerResult)
async def process_video_endpoint(payload: ProcessVideoRequest) -> WorkerResult:
    try:
        result = await run_in_threadpool(process_video, payload)
        return WorkerResult(**result)
    except Exception as error:
        return WorkerResult(
            status="FAILED",
            error=f"Video processing failed: {error}",
            processingNotes=f"Video processing failed: {error}",
        )
