-- CreateTable
CREATE TABLE "FoodModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "originalFileUrl" TEXT NOT NULL,
    "processedFileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
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

-- CreateIndex
CREATE INDEX "FoodModel_menuItemId_idx" ON "FoodModel"("menuItemId");

-- CreateIndex
CREATE INDEX "FoodModel_status_idx" ON "FoodModel"("status");
