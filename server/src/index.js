import express from "express";
import cors from "cors";
import path from "node:path";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { modelRoutes } from "./routes/modelRoutes.js";
import { getQueueSnapshot, initializeProcessingQueue } from "./services/processingQueue.js";
import { ensureUploadDirs } from "./utils/fileStorage.js";

ensureUploadDirs();
await initializeProcessingQueue();

const app = express();

const allowedOrigins = new Set([env.clientUrl, env.publicBaseUrl]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error(`Origin ${origin} is not allowed to access this API.`);
    error.status = 403;
    callback(error);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(env.uploadRoot)));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "menuverse-ar-pipeline-server",
    queue: getQueueSnapshot(),
    workerUrl: env.workerUrl
  });
});

app.use("/api/models", modelRoutes);

app.use((_request, response) => {
  response.status(404).json({ message: "Route not found." });
});

app.use(errorHandler);

const server = app.listen(env.serverPort, () => {
  console.log(`MenuVerse AR Pipeline server listening on http://localhost:${env.serverPort}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
