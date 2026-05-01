import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export function ensureUploadDirs() {
  for (const dir of [env.uploadRoot, env.modelsDir, env.videosDir, env.framesDir, env.processedDir, env.thumbnailsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function normalizeUploadRelativePath(fileReference) {
  if (!fileReference) {
    return null;
  }

  let pathname = fileReference;

  try {
    pathname = new URL(fileReference).pathname;
  } catch {
    pathname = fileReference;
  }

  const normalized = pathname
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//i, "");

  const resolved = path.resolve(env.uploadRoot, normalized);
  if (!resolved.startsWith(env.uploadRoot)) {
    return null;
  }

  return normalized;
}

export function buildUploadPublicUrl(relativePath) {
  const normalized = normalizeUploadRelativePath(relativePath);
  return normalized ? `${env.publicBaseUrl}/uploads/${normalized}` : null;
}

export function createUploadRelativePath(folderName, fileName) {
  // DB records should keep upload-root-relative paths so the API can rebuild public URLs consistently per environment.
  return `${folderName}/${fileName}`;
}

export function fileUrlToAbsolutePath(fileUrl) {
  const relativePath = normalizeUploadRelativePath(fileUrl);
  return relativePath ? path.resolve(env.uploadRoot, relativePath) : null;
}

export async function safeUnlink(fileUrl) {
  const filePath = fileUrlToAbsolutePath(fileUrl);

  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function safeUnlinkAbsolute(filePath) {
  if (!filePath || !filePath.startsWith(env.uploadRoot)) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function safeRemoveDirAbsolute(dirPath) {
  if (!dirPath || !dirPath.startsWith(env.uploadRoot)) {
    return;
  }

  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
