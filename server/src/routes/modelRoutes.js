import { Router } from "express";
import {
  deleteModel,
  getModelById,
  getModelByMenuItemId,
  listModels,
  markArReady,
  processModel,
  updateModel,
  uploadModel,
  uploadVideo
} from "../controllers/modelController.js";
import { env } from "../config/env.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import { uploadModelMiddleware, uploadVideoMiddleware } from "../middleware/upload.js";

export const modelRoutes = Router();
const uploadRateLimit = createRateLimit({
  windowMs: env.uploadRateLimitWindowMs,
  max: env.uploadRateLimitMax,
  message: "Too many upload requests from this client. Please wait a few minutes and try again."
});

modelRoutes.post("/upload", uploadRateLimit, uploadModelMiddleware.single("model"), uploadModel);
modelRoutes.post("/upload-video", uploadRateLimit, uploadVideoMiddleware.single("video"), uploadVideo);
modelRoutes.get("/", listModels);
modelRoutes.get("/menu-item/:menuItemId", getModelByMenuItemId);
modelRoutes.get("/:id", getModelById);
modelRoutes.put("/:id", updateModel);
modelRoutes.delete("/:id", deleteModel);
modelRoutes.post("/:id/process", processModel);
modelRoutes.post("/:id/mark-ar-ready", markArReady);
