-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FoodModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MODEL_UPLOAD',
    "sourceVideoUrl" TEXT,
    "sourceVideoFileName" TEXT,
    "sourceVideoFileSize" INTEGER,
    "sourceVideoDuration" REAL,
    "frameCount" INTEGER,
    "processingNotes" TEXT,
    "originalFileUrl" TEXT,
    "processedFileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "scale" REAL NOT NULL DEFAULT 1,
    "rotationX" REAL NOT NULL DEFAULT 0,
    "rotationY" REAL NOT NULL DEFAULT 0,
    "rotationZ" REAL NOT NULL DEFAULT 0,
    "positionX" REAL NOT NULL DEFAULT 0,
    "positionY" REAL NOT NULL DEFAULT 0,
    "positionZ" REAL NOT NULL DEFAULT 0,
    "polygonCount" INTEGER,
    "textureCount" INTEGER,
    "dimensions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "isOptimized" BOOLEAN NOT NULL DEFAULT false,
    "isARReady" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FoodModel" ("category", "createdAt", "description", "dimensions", "errorMessage", "fileName", "fileSize", "fileType", "id", "isARReady", "isActive", "isOptimized", "menuItemId", "name", "originalFileUrl", "polygonCount", "positionX", "positionY", "positionZ", "processedFileUrl", "rotationX", "rotationY", "rotationZ", "scale", "status", "textureCount", "thumbnailUrl", "updatedAt") SELECT "category", "createdAt", "description", "dimensions", "errorMessage", "fileName", "fileSize", "fileType", "id", "isARReady", "isActive", "isOptimized", "menuItemId", "name", "originalFileUrl", "polygonCount", "positionX", "positionY", "positionZ", "processedFileUrl", "rotationX", "rotationY", "rotationZ", "scale", "status", "textureCount", "thumbnailUrl", "updatedAt" FROM "FoodModel";
DROP TABLE "FoodModel";
ALTER TABLE "new_FoodModel" RENAME TO "FoodModel";
CREATE INDEX "FoodModel_menuItemId_idx" ON "FoodModel"("menuItemId");
CREATE INDEX "FoodModel_status_idx" ON "FoodModel"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
