-- DropIndex
DROP INDEX "SimCard_modemId_key";

-- AlterTable
ALTER TABLE "SimCard" ADD COLUMN     "slot" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "SimCard_modemId_slot_key" ON "SimCard"("modemId", "slot");

-- Не больше двух карт на модем.
ALTER TABLE "SimCard" ADD CONSTRAINT "SimCard_slot_check" CHECK ("slot" IN (1, 2));
