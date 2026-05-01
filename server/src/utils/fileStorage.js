import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export function ensureUploadDirs() {
  for (const dir of [env.uploadRoot, env.modelsDir, env.videosDir, env.framesDir, env.processedDir, env.thumbnailsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createPublicUrl(relativePath) {
  const normalized = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${env.publicBaseUrl}${normalized}`;
}

export function createUploadPublicUrl(folderName, fileName) {
  return createPublicUrl(`/uploads/${folderName}/${fileName}`);
}

export function fileUrlToAbsolutePath(fileUrl) {
  if (!fileUrl) {
    return null;
  }

  let pathname = fileUrl;

  try {
    pathname = new URL(fileUrl).pathname;
  } catch {
    pathname = fileUrl;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const fullPath = path.resolve(env.projectRoot, relativePath);

  if (!fullPath.startsWith(env.uploadRoot)) {
    return null;
  }

  return fullPath;
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
