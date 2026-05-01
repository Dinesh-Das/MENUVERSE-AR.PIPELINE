import fsp from "node:fs/promises";
import path from "node:path";

function bufferStartsWithAscii(buffer, value, offset = 0) {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

async function readHead(filePath, size = 64) {
  const handle = await fsp.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function looksLikeTextJson(filePath) {
  const content = await fsp.readFile(filePath, "utf8");
  const trimmed = content.trimStart();
  return trimmed.startsWith("{");
}

export async function validateUploadedAsset(filePath, assetType) {
  const extension = path.extname(filePath).toLowerCase();
  const head = await readHead(filePath);

  if (assetType === "model") {
    if (extension === ".glb") {
      return bufferStartsWithAscii(head, "glTF");
    }

    if (extension === ".gltf") {
      return looksLikeTextJson(filePath);
    }

    return false;
  }

  if (assetType === "video") {
    if (extension === ".webm") {
      return head.length >= 4
        && head[0] === 0x1a
        && head[1] === 0x45
        && head[2] === 0xdf
        && head[3] === 0xa3;
    }

    if (extension === ".mp4" || extension === ".mov" || extension === ".m4v") {
      return head.length >= 8 && bufferStartsWithAscii(head, "ftyp", 4);
    }

    return false;
  }

  return false;
}
