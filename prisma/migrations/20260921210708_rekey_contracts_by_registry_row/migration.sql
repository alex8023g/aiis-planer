-- DropIndex
DROP INDEX "contract_source_registryYear_number_key";

-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "sourceRow" INTEGER NOT NULL,
ADD COLUMN     "sourceSheet" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "contract_number_idx" ON "contract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "contract_source_registryYear_sourceSheet_sourceRow_key" ON "contract"("source", "registryYear", "sourceSheet", "sourceRow");

