-- CreateEnum
CREATE TYPE "WiringScheme" AS ENUM ('direct', 'semiIndirect', 'indirect');

-- AlterEnum
ALTER TYPE "VoltageClass" ADD VALUE 'kv0_2' BEFORE 'kv0_4';

-- DropIndex
DROP INDEX "Tn_tiId_key";

-- DropIndex
DROP INDEX "Tt_tiId_key";

-- AlterTable
ALTER TABLE "Ti" ADD COLUMN     "freeRs485" BOOLEAN,
ADD COLUMN     "isPolled" BOOLEAN,
ADD COLUMN     "technicalSolutionId" TEXT,
ADD COLUMN     "wiring" "WiringScheme";

-- CreateTable
CREATE TABLE "TechnicalSolution" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TechnicalSolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ti_technicalSolutionId_idx" ON "Ti"("technicalSolutionId");

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_technicalSolutionId_fkey" FOREIGN KEY ("technicalSolutionId") REFERENCES "TechnicalSolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
