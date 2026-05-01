import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { fileUrlToAbsolutePath, normalizeUploadRelativePath } from "../utils/fileStorage.js";

function workerUnavailableMessage() {
  return `Worker service is unavailable at ${env.workerUrl}. Start the Python worker and confirm ${env.workerUrl}/health is reachable.`;
}

function normalizeWorkerRelativePath(filePath) {
  if (!filePath) {
    return null;
  }

  return normalizeUploadRelativePath(filePath);
}

function serializeWorkerDimensions(dimensions) {
  if (!dimensions) {
    return null;
  }

  return JSON.stringify(dimensions);
}

async function postToWorker(path, payload, fallbackMessage) {
  let response;

  try {
    response = await fetch(`${env.workerUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const message = error?.cause?.code === "ECONNREFUSED"
      ? workerUnavailableMessage()
      : error?.message === "fetch failed"
        ? workerUnavailableMessage()
        : `${fallbackMessage} ${error?.message ?? ""}`.trim();

    throw new Error(message);
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || fallbackMessage);
  }

  return data;
}

export async function markModelFailed(modelId, errorMessage) {
  return prisma.foodModel.update({
    where: { id: modelId },
    data: {
      status: "FAILED",
      errorMessage,
      processingNotes: `Processing failed. ${errorMessage}`
    }
  });
}

function buildProcessingUpdate(payload) {
  const metadata = payload.metadata ?? {};
  const failedStatus = payload.status === "FAILED";
  const processingNotes = payload.processingNotes
    ?? (failedStatus ? `Processing failed. ${payload.error ?? "Unknown worker error."}` : null);

  const data = {
    polygonCount: typeof metadata.faceCount === "number" ? metadata.faceCount : null,
    textureCount: null,
    dimensions: serializeWorkerDimensions(metadata.boundingBox),
    frameCount: typeof payload.frameCount === "number" ? payload.frameCount : null,
    processingNotes,
    isOptimized: Boolean(payload.isOptimized),
    status: payload.status ?? "PROCESSED",
    errorMessage: failedStatus ? (payload.error ?? "Worker processing failed.") : null
  };

  if (payload.processedPath) {
    data.processedFileUrl = normalizeWorkerRelativePath(payload.processedPath);
  }

  if (payload.thumbnailPath) {
    data.thumbnailUrl = normalizeWorkerRelativePath(payload.thumbnailPath);
  }

  if (typeof payload.sourceVideoDuration === "number") {
    data.sourceVideoDuration = payload.sourceVideoDuration;
  }

  if (typeof metadata.fileSize === "number") {
    data.fileSize = metadata.fileSize;
  }

  return data;
}

export async function processUploadedModel(model) {
  const absoluteOriginalPath = fileUrlToAbsolutePath(model.originalFileUrl);

  if (!absoluteOriginalPath) {
    throw new Error("Could not resolve the uploaded model path.");
  }

  await prisma.foodModel.update({
    where: { id: model.id },
    data: {
      status: "PROCESSING",
      errorMessage: null,
      processingNotes: "Worker request started for uploaded 3D model."
    }
  });

  const payload = await postToWorker(
    "/process-model",
    {
      modelId: model.id,
      name: model.name,
      originalFilePath: absoluteOriginalPath,
      fileName: model.fileName,
      fileType: model.fileType
    },
    "Worker processing failed."
  );

  // Await the Prisma write here so queued jobs do not resolve while the DB still says PROCESSING.
  return await prisma.foodModel.update({
    where: { id: model.id },
    data: buildProcessingUpdate(payload)
  });
}

export async function processUploadedVideo(model) {
  const absoluteVideoPath = fileUrlToAbsolutePath(model.sourceVideoUrl);

  if (!absoluteVideoPath) {
    throw new Error("Could not resolve the uploaded video path.");
  }

  await prisma.foodModel.update({
    where: { id: model.id },
    data: {
      status: "PROCESSING",
      errorMessage: null,
      processingNotes: "Worker request started for uploaded video."
    }
  });

  const payload = await postToWorker(
    "/process-video",
    {
      modelId: model.id,
      name: model.name,
      sourceVideoPath: absoluteVideoPath,
      fileName: model.sourceVideoFileName
    },
    "Worker video processing failed."
  );

  // FAILED worker responses should only update the row once; we do not schedule implicit retries here.
  return await prisma.foodModel.update({
    where: { id: model.id },
    data: buildProcessingUpdate(payload)
  });
}

export async function processAsset(model) {
  if (model.sourceType === "VIDEO_UPLOAD") {
    return processUploadedVideo(model);
  }

  return processUploadedModel(model);
}
