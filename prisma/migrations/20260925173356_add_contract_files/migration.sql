-- CreateTable
CREATE TABLE "contract_file" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_file_objectKey_key" ON "contract_file"("objectKey");

-- CreateIndex
CREATE INDEX "contract_file_contractId_idx" ON "contract_file"("contractId");

-- AddForeignKey
ALTER TABLE "contract_file" ADD CONSTRAINT "contract_file_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
