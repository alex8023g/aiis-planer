-- Поля опроса ТИ и группы ТИ: УСПД, модем, тех. решение, текст опроса и
-- примечание переезжают с отдельных ссылок в Ti на общую группу TiGroup.
-- Миграция написана руками: сгенерированная добавляла groupId NOT NULL в
-- таблицы с данными и удаляла старые ссылки раньше, чем их успели перенести.

-- CreateEnum
CREATE TYPE "WiringScheme" AS ENUM ('direct', 'semiIndirect', 'indirect');

-- AlterEnum
-- BEFORE: Postgres дописывает значение в конец enum, а VoltageClass
-- сортируется в порядке объявления — по возрастанию напряжения.
ALTER TYPE "VoltageClass" ADD VALUE 'kv0_2' BEFORE 'kv0_4';

-- DropIndex
-- ТТ и ТН на ТИ теперь списком: снятые остаются в истории.
DROP INDEX "Tn_tiId_key";
DROP INDEX "Tt_tiId_key";

-- CreateTable
CREATE TABLE "TiGroup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TiGroup_projectId_idx" ON "TiGroup"("projectId");

ALTER TABLE "TiGroup" ADD CONSTRAINT "TiGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TechnicalSolution" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TechnicalSolution_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Ti" ADD COLUMN     "freeRs485" BOOLEAN,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "isPolled" BOOLEAN,
ADD COLUMN     "wiring" "WiringScheme";

CREATE INDEX "Ti_groupId_idx" ON "Ti"("groupId");

ALTER TABLE "Ti" ADD CONSTRAINT "Ti_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- groupId пока без NOT NULL: у существующих строк его заполнит перенос ниже.
ALTER TABLE "Modem" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Uspd" ADD COLUMN "groupId" TEXT;
ALTER TABLE "SidePolling" ADD COLUMN "groupId" TEXT;
ALTER TABLE "TisNotes" ADD COLUMN "groupId" TEXT;

-- Перенос данных.
-- Группа — каждое различное сочетание (проект, УСПД, модем, текст опроса,
-- примечание) среди ТИ, у которых есть хоть одна ссылка. ТИ без ссылок
-- остаются без группы.
-- Общее раньше могло делиться между ТИ с разными остальными ссылками (один
-- модем на ТИ с разными примечаниями) — теперь это разные группы, и каждая
-- получает свою копию строки. Поэтому строки копируются в группы с новыми id,
-- а старые после этого удаляются.
CREATE TABLE "_ti_group_map" AS
SELECT
    gen_random_uuid()::text AS "id",
    "projectId",
    "uspdId",
    "modemId",
    "sidePollingId",
    "tisNotesId",
    CASE WHEN "uspdId" IS NULL THEN NULL ELSE gen_random_uuid()::text END AS "newUspdId",
    CASE WHEN "modemId" IS NULL THEN NULL ELSE gen_random_uuid()::text END AS "newModemId",
    CASE WHEN "sidePollingId" IS NULL THEN NULL ELSE gen_random_uuid()::text END AS "newSidePollingId",
    CASE WHEN "tisNotesId" IS NULL THEN NULL ELSE gen_random_uuid()::text END AS "newTisNotesId"
FROM (
    SELECT DISTINCT "projectId", "uspdId", "modemId", "sidePollingId", "tisNotesId"
    FROM "Ti"
    WHERE "uspdId" IS NOT NULL
       OR "modemId" IS NOT NULL
       OR "sidePollingId" IS NOT NULL
       OR "tisNotesId" IS NOT NULL
) AS "combos";

INSERT INTO "TiGroup" ("id", "projectId", "updatedAt")
SELECT "id", "projectId", CURRENT_TIMESTAMP FROM "_ti_group_map";

UPDATE "Ti" SET "groupId" = m."id"
FROM "_ti_group_map" m
WHERE "Ti"."projectId" = m."projectId"
  AND "Ti"."uspdId" IS NOT DISTINCT FROM m."uspdId"
  AND "Ti"."modemId" IS NOT DISTINCT FROM m."modemId"
  AND "Ti"."sidePollingId" IS NOT DISTINCT FROM m."sidePollingId"
  AND "Ti"."tisNotesId" IS NOT DISTINCT FROM m."tisNotesId";

INSERT INTO "Uspd" ("id", "groupId", "type", "number")
SELECT m."newUspdId", m."id", o."type", o."number"
FROM "_ti_group_map" m JOIN "Uspd" o ON o."id" = m."uspdId";

INSERT INTO "Modem" ("id", "groupId", "kind", "type", "number")
SELECT m."newModemId", m."id", o."kind", o."type", o."number"
FROM "_ti_group_map" m JOIN "Modem" o ON o."id" = m."modemId";

-- SIM-карта едет вместе со своей копией модема.
INSERT INTO "SimCard" ("id", "modemId", "number", "ip", "provider")
SELECT gen_random_uuid()::text, m."newModemId", s."number", s."ip", s."provider"
FROM "_ti_group_map" m JOIN "SimCard" s ON s."modemId" = m."modemId";

INSERT INTO "SidePolling" ("id", "groupId", "description")
SELECT m."newSidePollingId", m."id", o."description"
FROM "_ti_group_map" m JOIN "SidePolling" o ON o."id" = m."sidePollingId";

INSERT INTO "TisNotes" ("id", "groupId", "description")
SELECT m."newTisNotesId", m."id", o."description"
FROM "_ti_group_map" m JOIN "TisNotes" o ON o."id" = m."tisNotesId";

DROP TABLE "_ti_group_map";

-- Старые ссылки из Ti. Ключи снимаем до удаления строк: у sidePolling и
-- tisNotes они RESTRICT и не дали бы удалить то, на что ссылается ТИ.
ALTER TABLE "Ti" DROP CONSTRAINT "Ti_modemId_fkey";
ALTER TABLE "Ti" DROP CONSTRAINT "Ti_sidePollingId_fkey";
ALTER TABLE "Ti" DROP CONSTRAINT "Ti_tisNotesId_fkey";
ALTER TABLE "Ti" DROP CONSTRAINT "Ti_uspdId_fkey";

DROP INDEX "Ti_modemId_idx";

ALTER TABLE "Ti" DROP COLUMN "modemId",
DROP COLUMN "sidePollingId",
DROP COLUMN "tisNotesId",
DROP COLUMN "uspdId";

-- Старые строки: всё, что нужно, уже скопировано в группы. Сюда же попадают
-- строки, на которые не ссылалась ни одна ТИ, — до них и раньше было не
-- добраться. SIM-карты старых модемов уходят каскадом.
DELETE FROM "Uspd" WHERE "groupId" IS NULL;
DELETE FROM "Modem" WHERE "groupId" IS NULL;
DELETE FROM "SidePolling" WHERE "groupId" IS NULL;
DELETE FROM "TisNotes" WHERE "groupId" IS NULL;

-- AlterTable
ALTER TABLE "Modem" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "Uspd" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "SidePolling" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "TisNotes" ALTER COLUMN "groupId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalSolution_groupId_key" ON "TechnicalSolution"("groupId");
CREATE UNIQUE INDEX "Modem_groupId_key" ON "Modem"("groupId");
CREATE UNIQUE INDEX "SidePolling_groupId_key" ON "SidePolling"("groupId");
CREATE UNIQUE INDEX "TisNotes_groupId_key" ON "TisNotes"("groupId");
CREATE UNIQUE INDEX "Uspd_groupId_key" ON "Uspd"("groupId");

-- AddForeignKey
ALTER TABLE "SidePolling" ADD CONSTRAINT "SidePolling_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Uspd" ADD CONSTRAINT "Uspd_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TechnicalSolution" ADD CONSTRAINT "TechnicalSolution_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Modem" ADD CONSTRAINT "Modem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TisNotes" ADD CONSTRAINT "TisNotes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TiGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
