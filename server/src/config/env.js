import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "../..");
const projectRoot = path.resolve(serverRoot, "..");
const uploadRoot = path.resolve(serverRoot, process.env.UPLOAD_DIR ?? "../uploads");

export const env = {
  serverRoot,
  projectRoot,
  uploadRoot,
  modelsDir: path.join(uploadRoot, "models"),
  videosDir: path.join(uploadRoot, "videos"),
  framesDir: path.join(uploadRoot, "frames"),
  processedDir: path.join(uploadRoot, "processed"),
  thumbnailsDir: path.join(uploadRoot, "thumbnails"),
  serverPort: Number(process.env.SERVER_PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5184",
  workerUrl: process.env.WORKER_URL ?? "http://localhost:8001",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:4000",
  // Queue concurrency comes from env, so parse it as base-10 before applying bounds.
  processingConcurrency: Math.max(1, parseInt(process.env.PROCESSING_CONCURRENCY ?? "1", 10)),
  uploadRateLimitWindowMs: Math.max(60_000, Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000)),
  uploadRateLimitMax: Math.max(1, Number(process.env.UPLOAD_RATE_LIMIT_MAX ?? 12))
};
