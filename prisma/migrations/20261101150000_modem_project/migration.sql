-- AlterTable: модем висит на проекте, группа необязательна.
ALTER TABLE "Modem" ADD COLUMN "projectId" TEXT;

UPDATE "Modem" "m"
SET "projectId" = "g"."projectId"
FROM "TiGroup" "g"
WHERE "g"."id" = "m"."groupId";

ALTER TABLE "Modem" ALTER COLUMN "projectId" SET NOT NULL,
ALTER COLUMN "groupId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Modem_projectId_idx" ON "Modem"("projectId");

-- AddForeignKey
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
