import { prisma } from "../lib/prisma.js";
import path from "node:path";
import { buildMenuverseResponse, buildValidatedCreatePayload, sanitizeModelUpdatePayload, serializeModel } from "../services/modelService.js";
import { enqueueModelProcessing } from "../services/processingQueue.js";
import { createUploadPublicUrl, safeRemoveDirAbsolute, safeUnlink, safeUnlinkAbsolute } from "../utils/fileStorage.js";
import { validateUploadedAsset } from "../utils/uploadValidation.js";
import { env } from "../config/env.js";

export async function uploadModel(request, response, next) {
  let createdModel = null;

  try {
    if (!request.file) {
      response.status(400).json({ message: "A .glb or .gltf file is required." });
      return;
    }

    const isValidAsset = await validateUploadedAsset(request.file.path, "model");

    if (!isValidAsset) {
      await safeUnlinkAbsolute(request.file.path);
      response.status(400).json({ message: "Uploaded file contents do not match a valid .glb or .gltf asset." });
      return;
    }

    const payload = buildValidatedCreatePayload(request.body);

    createdModel = await prisma.foodModel.create({
      data: {
        sourceType: "MODEL_UPLOAD",
        status: "QUEUED",
        processingNotes: "Model upload received and queued for background processing.",
        ...payload,
        originalFileUrl: createUploadPublicUrl("models", request.file.filename),
        fileName: request.file.filename,
        fileType: request.file.mimetype || "model/gltf-binary",
        fileSize: request.file.size
      }
    });

    const queuedModel = await enqueueModelProcessing(createdModel.id, {
      note: "Model upload queued for background processing."
    });

    response.status(202).json({
      model: serializeModel(queuedModel),
      processingQueued: true
    });
  } catch (error) {
    if (!createdModel && request.file?.path) {
      await safeUnlinkAbsolute(request.file.path);
    }
    next(error);
  }
}

export async function uploadVideo(request, response, next) {
  let createdModel = null;

  try {
    if (!request.file) {
      response.status(400).json({ message: "A .mp4, .mov, .m4v, or .webm file is required." });
      return;
    }

    const isValidAsset = await validateUploadedAsset(request.file.path, "video");

    if (!isValidAsset) {
      await safeUnlinkAbsolute(request.file.path);
      response.status(400).json({ message: "Uploaded file contents do not match a valid supported video asset." });
      return;
    }

    const payload = buildValidatedCreatePayload(request.body);

    createdModel = await prisma.foodModel.create({
      data: {
        sourceType: "VIDEO_UPLOAD",
        status: "QUEUED",
        ...payload,
        sourceVideoUrl: createUploadPublicUrl("videos", request.file.filename),
        sourceVideoFileName: request.file.filename,
        sourceVideoFileSize: request.file.size,
        processingNotes: "Video uploaded and queued for background processing."
      }
    });

    const queuedModel = await enqueueModelProcessing(createdModel.id, {
      note: "Video upload queued for background processing."
    });

    response.status(202).json({
      model: serializeModel(queuedModel),
      processingQueued: true
    });
  } catch (error) {
    if (!createdModel && request.file?.path) {
      await safeUnlinkAbsolute(request.file.path);
    }
    next(error);
  }
}

export async function listModels(_request, response, next) {
  try {
    const models = await prisma.foodModel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    });

    response.json(models.map(serializeModel));
  } catch (error) {
    next(error);
  }
}

export async function getModelById(request, response, next) {
  try {
    const model = await prisma.foodModel.findUnique({
      where: { id: request.params.id }
    });

    if (!model || !model.isActive) {
      response.status(404).json({ message: "Model not found." });
      return;
    }

    response.json(serializeModel(model));
  } catch (error) {
    next(error);
  }
}

export async function getModelByMenuItemId(request, response, next) {
  try {
    const model = await prisma.foodModel.findFirst({
      where: {
        menuItemId: request.params.menuItemId,
        isActive: true,
        isARReady: true
      },
      orderBy: { updatedAt: "desc" }
    });

    if (!model) {
      response.status(404).json({ message: "AR preview coming soon." });
      return;
    }

    response.json(buildMenuverseResponse(model));
  } catch (error) {
    next(error);
  }
}

export async function updateModel(request, response, next) {
  try {
    const existingModel = await prisma.foodModel.findUnique({
      where: { id: request.params.id }
    });

    if (!existingModel || !existingModel.isActive) {
      response.status(404).json({ message: "Model not found." });
      return;
    }

    const data = sanitizeModelUpdatePayload(request.body, existingModel);

    if (data.isARReady === true && !existingModel.processedFileUrl) {
      response.status(400).json({ message: "Process the model before marking it as AR-ready." });
      return;
    }

    const updatedModel = await prisma.foodModel.update({
      where: { id: request.params.id },
      data
    });

    response.json(serializeModel(updatedModel));
  } catch (error) {
    next(error);
  }
}

export async function deleteModel(request, response, next) {
  try {
    const model = await prisma.foodModel.findUnique({
      where: { id: request.params.id }
    });

    if (!model) {
      response.status(404).json({ message: "Model not found." });
      return;
    }

    if (["QUEUED", "PROCESSING"].includes(model.status)) {
      response.status(409).json({
        message: "Cannot delete a model while it is being processed. Wait for processing to finish or fail first."
      });
      return;
    }

    await prisma.foodModel.delete({
      where: { id: request.params.id }
    });

    await Promise.all([
      safeUnlink(model.sourceVideoUrl),
      safeUnlink(model.originalFileUrl),
      safeUnlink(model.processedFileUrl),
      safeUnlink(model.thumbnailUrl)
    ]);

    await safeRemoveDirAbsolute(path.join(env.framesDir, model.id));

    response.json({ message: "Model deleted." });
  } catch (error) {
    next(error);
  }
}

export async function processModel(request, response, next) {
  try {
    const model = await prisma.foodModel.findUnique({
      where: { id: request.params.id }
    });

    if (!model || !model.isActive) {
      response.status(404).json({ message: "Model not found." });
      return;
    }

    const queuedModel = await enqueueModelProcessing(model.id, {
      force: true,
      note: model.sourceType === "VIDEO_UPLOAD"
        ? "Video reprocessing queued."
        : "Model reprocessing queued."
    });

    response.status(202).json(serializeModel(queuedModel));
  } catch (error) {
    next(error);
  }
}

export async function markArReady(request, response, next) {
  try {
    const model = await prisma.foodModel.findUnique({
      where: { id: request.params.id }
    });

    if (!model || !model.isActive) {
      response.status(404).json({ message: "Model not found." });
      return;
    }

    if (!model.processedFileUrl) {
      response.status(400).json({ message: "Process the model before marking it as AR-ready." });
      return;
    }

    const updatedModel = await prisma.foodModel.update({
      where: { id: request.params.id },
      data: {
        isARReady: true,
        status: "AR_READY",
        errorMessage: null
      }
    });

    response.json(serializeModel(updatedModel));
  } catch (error) {
    next(error);
  }
}
