import path from "node:path";
import multer from "multer";
import { env } from "../config/env.js";
import { slugify } from "../utils/fileStorage.js";

const allowedModelExtensions = new Set([".glb", ".gltf"]);
const allowedVideoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function createStorage(destinationDir) {
  return multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, destinationDir);
    },
    filename: (request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const baseName = slugify(request.body?.name || path.parse(file.originalname).name || "food-asset");
      callback(null, `${baseName}-${Date.now()}${extension}`);
    }
  });
}

function createFileFilter(allowedExtensions, message) {
  return (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      callback(new Error(message));
      return;
    }

    callback(null, true);
  };
}

export const uploadModelMiddleware = multer({
  storage: createStorage(env.modelsDir),
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: createFileFilter(allowedModelExtensions, "Only .glb and .gltf files are allowed.")
});

export const uploadVideoMiddleware = multer({
  storage: createStorage(env.videosDir),
  limits: {
    fileSize: 250 * 1024 * 1024
  },
  fileFilter: createFileFilter(allowedVideoExtensions, "Only .mp4, .mov, .m4v, and .webm files are allowed.")
});
