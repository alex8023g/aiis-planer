-- CreateTable
CREATE TABLE "SpecificationItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecificationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecificationItem_groupId_idx" ON "SpecificationItem"("groupId");

-- AddForeignKey
ALTER TABLE "SpecificationItem" ADD CONSTRAINT "SpecificationItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
