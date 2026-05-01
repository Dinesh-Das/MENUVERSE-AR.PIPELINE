import { buildUploadPublicUrl } from "../utils/fileStorage.js";

const numericFields = [
  "scale",
  "rotationX",
  "rotationY",
  "rotationZ",
  "positionX",
  "positionY",
  "positionZ"
];

const booleanFields = ["isARReady", "isActive"];
const stringFields = ["name", "description", "category", "menuItemId"];
const stringLengthLimits = {
  name: 120,
  description: 2000,
  category: 80,
  menuItemId: 120
};

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
}

function parseDimensions(dimensions) {
  if (!dimensions) {
    return null;
  }

  if (typeof dimensions === "object") {
    return dimensions;
  }

  try {
    return JSON.parse(dimensions);
  } catch {
    return dimensions;
  }
}

function normalizeOptionalString(value, field) {
  if (value == null || value === "") {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > stringLengthLimits[field]) {
    throw new Error(`${field} must be ${stringLengthLimits[field]} characters or fewer.`);
  }

  return normalized;
}

function normalizeRequiredName(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error("name is required.");
  }

  if (normalized.length > stringLengthLimits.name) {
    throw new Error(`name must be ${stringLengthLimits.name} characters or fewer.`);
  }

  return normalized;
}

function normalizeNumber(value, field) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${field} must be a valid number.`);
  }

  if (field === "scale" && number <= 0) {
    throw new Error("scale must be greater than 0.");
  }

  return number;
}

export function serializeModel(model) {
  return {
    ...model,
    dimensions: parseDimensions(model.dimensions),
    // Asset paths stay relative in the DB; expand them here so every API response uses stable public URLs.
    sourceVideoUrl: buildUploadPublicUrl(model.sourceVideoUrl),
    originalFileUrl: buildUploadPublicUrl(model.originalFileUrl),
    processedFileUrl: buildUploadPublicUrl(model.processedFileUrl),
    thumbnailUrl: buildUploadPublicUrl(model.thumbnailUrl),
  };
}

export function buildValidatedCreatePayload(payload) {
  return {
    name: normalizeRequiredName(payload?.name),
    description: normalizeOptionalString(payload?.description, "description"),
    category: normalizeOptionalString(payload?.category, "category"),
    menuItemId: normalizeOptionalString(payload?.menuItemId, "menuItemId")
  };
}

export function sanitizeModelUpdatePayload(payload, currentModel) {
  const data = {};

  for (const field of stringFields) {
    if (field in payload) {
      if (field === "name") {
        data[field] = normalizeRequiredName(payload[field]);
      } else {
        data[field] = normalizeOptionalString(payload[field], field);
      }
    }
  }

  for (const field of numericFields) {
    if (field in payload) {
      data[field] = normalizeNumber(payload[field], field);
    }
  }

  for (const field of booleanFields) {
    if (field in payload) {
      data[field] = parseBoolean(payload[field]);
    }
  }

  if ("isARReady" in data) {
    data.status = data.isARReady ? "AR_READY" : currentModel.status === "AR_READY" ? "PROCESSED" : currentModel.status;
  }

  return data;
}

export function buildMenuverseResponse(model) {
  return {
    id: model.id,
    menuItemId: model.menuItemId,
    name: model.name,
    modelUrl: buildUploadPublicUrl(model.processedFileUrl ?? model.originalFileUrl),
    thumbnailUrl: buildUploadPublicUrl(model.thumbnailUrl),
    isARReady: model.isARReady,
    scale: model.scale,
    rotation: {
      x: model.rotationX,
      y: model.rotationY,
      z: model.rotationZ
    },
    position: {
      x: model.positionX,
      y: model.positionY,
      z: model.positionZ
    }
  };
}

export function humanizeSourceType(sourceType) {
  if (sourceType === "VIDEO_UPLOAD") {
    return "Video upload";
  }

  return "Model upload";
}
