from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProcessModelRequest(BaseModel):
    modelId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    name: str
    originalFilePath: str
    fileName: str
    fileType: str


class ProcessVideoRequest(BaseModel):
    modelId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    name: str
    sourceVideoPath: str
    fileName: str


class ValidateModelRequest(BaseModel):
    filePath: str


class GenerateThumbnailRequest(BaseModel):
    filePath: str
    name: str = Field(default="Food Model")
    modelId: str = Field(default="preview", pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


class DimensionsSchema(BaseModel):
    x: float
    y: float
    z: float


class MetadataSchema(BaseModel):
    vertexCount: int | None = None
    faceCount: int | None = None
    fileSize: int | None = None
    boundingBox: DimensionsSchema | None = None


# The server patches Prisma records from this camelCase contract, so keep these field names stable.
class WorkerResult(BaseModel):
    status: str = "PROCESSED"
    processedPath: str | None = None
    thumbnailPath: str | None = None
    metadata: MetadataSchema | None = None
    error: str | None = None
    frameCount: int | None = None
    sourceVideoDuration: float | None = None
    processingNotes: str | None = None
    isOptimized: bool = False
    validation: dict[str, Any] | None = None
