-- CreateTable
CREATE TABLE "EquipmentKit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentKitItem" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "modelId" TEXT,
    "quantity" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKit_name_key" ON "EquipmentKit"("name");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_kitId_idx" ON "EquipmentKitItem"("kitId");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_kindId_idx" ON "EquipmentKitItem"("kindId");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_modelId_idx" ON "EquipmentKitItem"("modelId");

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "EquipmentKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "EquipmentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_modelId_kindId_fkey" FOREIGN KEY ("modelId", "kindId") REFERENCES "EquipmentModel"("id", "kindId") ON DELETE RESTRICT ON UPDATE CASCADE;
