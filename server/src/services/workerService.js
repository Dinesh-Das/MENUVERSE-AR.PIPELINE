import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { fileUrlToAbsolutePath } from "../utils/fileStorage.js";

function workerUnavailableMessage() {
  return `Worker service is unavailable at ${env.workerUrl}. Start the Python worker and confirm ${env.workerUrl}/health is reachable.`;
}

function normalizeWorkerFileUrl(fileUrl) {
  if (!fileUrl) {
    return null;
  }

  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  const normalized = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  return `${env.publicBaseUrl}${normalized}`;
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
  const data = {
    polygonCount: typeof payload.polygonCount === "number" ? payload.polygonCount : null,
    textureCount: typeof payload.textureCount === "number" ? payload.textureCount : null,
    dimensions: serializeWorkerDimensions(payload.dimensions),
    frameCount: typeof payload.frameCount === "number" ? payload.frameCount : null,
    processingNotes: payload.processingNotes ?? null,
    isOptimized: Boolean(payload.isOptimized),
    status: payload.status ?? "PROCESSED",
    errorMessage: null
  };

  if (payload.originalFileUrl) {
    data.originalFileUrl = normalizeWorkerFileUrl(payload.originalFileUrl);
  }

  if (payload.processedFileUrl) {
    data.processedFileUrl = normalizeWorkerFileUrl(payload.processedFileUrl);
  }

  if (payload.thumbnailUrl) {
    data.thumbnailUrl = normalizeWorkerFileUrl(payload.thumbnailUrl);
  }

  if (payload.fileName) {
    data.fileName = payload.fileName;
  }

  if (payload.fileType) {
    data.fileType = payload.fileType;
  }

  if (typeof payload.fileSize === "number") {
    data.fileSize = payload.fileSize;
  }

  if (typeof payload.sourceVideoDuration === "number") {
    data.sourceVideoDuration = payload.sourceVideoDuration;
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

  return prisma.foodModel.update({
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

  return prisma.foodModel.update({
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
