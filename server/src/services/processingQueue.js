import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { markModelFailed, processAsset } from "./workerService.js";

const queuedModelIds = [];
const queuedModelIdSet = new Set();
const activeModelIds = new Set();

function queueNoteForModel(model) {
  if (model.sourceType === "VIDEO_UPLOAD") {
    return "Video upload queued for background processing.";
  }

  return "Model upload queued for background processing.";
}

function scheduleDrain() {
  setImmediate(() => {
    void drainQueue();
  });
}

async function runModelJob(modelId) {
  const model = await prisma.foodModel.findUnique({
    where: { id: modelId }
  });

  if (!model || !model.isActive) {
    return;
  }

  await prisma.foodModel.update({
    where: { id: model.id },
    data: {
      status: "PROCESSING",
      errorMessage: null,
      processingNotes: model.sourceType === "VIDEO_UPLOAD"
        ? "Background video processing started."
        : "Background model processing started."
    }
  });

  try {
    const freshModel = await prisma.foodModel.findUnique({
      where: { id: model.id }
    });

    if (!freshModel || !freshModel.isActive) {
      return;
    }

    await processAsset(freshModel);
  } catch (error) {
    await markModelFailed(model.id, error.message);
  }
}

async function drainQueue() {
  while (activeModelIds.size < env.processingConcurrency && queuedModelIds.length > 0) {
    const nextModelId = queuedModelIds.shift();

    if (!nextModelId) {
      continue;
    }

    queuedModelIdSet.delete(nextModelId);

    if (activeModelIds.has(nextModelId)) {
      continue;
    }

    activeModelIds.add(nextModelId);

    void runModelJob(nextModelId)
      .catch((err) => {
        /* # FIX: swallowing queue-level failures made stuck PROCESSING jobs impossible to diagnose when the failure handler itself broke. */
        console.error(
          `[queue] Unhandled error for model ${nextModelId}:`,
          err?.message ?? err
        );
      })
      .finally(() => {
        activeModelIds.delete(nextModelId);
        scheduleDrain();
      });
  }
}

export async function enqueueModelProcessing(modelId, options = {}) {
  const { force = false, note } = options;

  const model = await prisma.foodModel.findUnique({
    where: { id: modelId }
  });

  if (!model || !model.isActive) {
    throw new Error("Model not found.");
  }

  if (!force && (activeModelIds.has(modelId) || queuedModelIdSet.has(modelId))) {
    return prisma.foodModel.findUnique({
      where: { id: modelId }
    });
  }

  const updatedModel = await prisma.foodModel.update({
    where: { id: modelId },
    data: {
      status: "QUEUED",
      errorMessage: null,
      processingNotes: note ?? queueNoteForModel(model)
    }
  });

  if (!queuedModelIdSet.has(modelId) && (!activeModelIds.has(modelId) || force)) {
    queuedModelIdSet.add(modelId);
    queuedModelIds.push(modelId);
  }

  scheduleDrain();
  return updatedModel;
}

export function getQueueSnapshot() {
  return {
    concurrency: env.processingConcurrency,
    queued: queuedModelIds.length,
    active: activeModelIds.size
  };
}

export async function initializeProcessingQueue() {
  await prisma.foodModel.updateMany({
    where: {
      isActive: true,
      status: "PROCESSING"
    },
    data: {
      status: "QUEUED",
      processingNotes: "Server restarted while processing. The asset was returned to the background queue."
    }
  });

  const pendingModels = await prisma.foodModel.findMany({
    where: {
      isActive: true,
      status: {
        in: ["QUEUED", "UPLOADED", "VIDEO_UPLOADED"]
      }
    },
    select: {
      id: true
    },
    orderBy: {
      updatedAt: "asc"
    }
  });

  for (const model of pendingModels) {
    if (!queuedModelIdSet.has(model.id)) {
      queuedModelIdSet.add(model.id);
      queuedModelIds.push(model.id);
    }
  }

  scheduleDrain();
}
