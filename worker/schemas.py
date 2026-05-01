from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProcessModelRequest(BaseModel):
    modelId: str
    name: str
    originalFilePath: str
    fileName: str
    fileType: str


class ProcessVideoRequest(BaseModel):
    modelId: str
    name: str
    sourceVideoPath: str
    fileName: str


class ValidateModelRequest(BaseModel):
    filePath: str


class GenerateThumbnailRequest(BaseModel):
    filePath: str
    name: str = Field(default="Food Model")
    modelId: str = Field(default="preview")


class DimensionsSchema(BaseModel):
    x: float
    y: float
    z: float


class WorkerResult(BaseModel):
    originalFileUrl: str | None = None
    processedFileUrl: str | None = None
    thumbnailUrl: str | None = None
    fileName: str | None = None
    fileType: str | None = None
    fileSize: int | None = None
    polygonCount: int | None = None
    textureCount: int | None = None
    dimensions: DimensionsSchema | None = None
    frameCount: int | None = None
    sourceVideoDuration: float | None = None
    processingNotes: str | None = None
    isOptimized: bool = False
    status: str = "PROCESSED"
    validation: dict[str, Any] | None = None
