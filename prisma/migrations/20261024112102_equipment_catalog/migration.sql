-- Справочник оборудования: вид (EquipmentKind) и марка (EquipmentModel).
-- Позиции спецификации ссылаются на них вместо текстовых name/model/unit.
-- Уже заведённые позиции не теряются: виды и марки собираются из их текста.

-- CreateTable
CREATE TABLE "EquipmentKind" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentModel" (
    "id" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKind_name_key" ON "EquipmentKind"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentModel_kindId_name_key" ON "EquipmentModel"("kindId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentModel_id_kindId_key" ON "EquipmentModel"("id", "kindId");

-- То же, что equipmentKey в src/lib/equipment.ts: пробелы по краям убрать,
-- внутри схлопнуть, нижний регистр, кириллические двойники латиницы — в
-- латиницу. По нему уже заведённые позиции сводятся к одному виду и марке.
-- Функция временная: нужна только этой миграции.
CREATE FUNCTION pg_temp.equipment_key(value TEXT) RETURNS TEXT AS $$
  SELECT translate(
    lower(regexp_replace(btrim(value), '\s+', ' ', 'g')),
    'авекмнорстухё',
    'abekmhopctyxe'
  )
$$ LANGUAGE SQL IMMUTABLE;

-- Виды — из наименований позиций; имя и ед. изм. — у первой по порядку.
INSERT INTO "EquipmentKind" ("id", "name", "unit", "updatedAt")
SELECT DISTINCT ON (pg_temp.equipment_key("name"))
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  regexp_replace(btrim("name"), '\s+', ' ', 'g'),
  btrim("unit"),
  CURRENT_TIMESTAMP
FROM "SpecificationItem"
ORDER BY pg_temp.equipment_key("name"), "createdAt", "position";

-- Марки — из непустых марок позиций, внутри своего вида.
INSERT INTO "EquipmentModel" ("id", "kindId", "name", "updatedAt")
SELECT DISTINCT ON (k."id", pg_temp.equipment_key(s."model"))
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  k."id",
  regexp_replace(btrim(s."model"), '\s+', ' ', 'g'),
  CURRENT_TIMESTAMP
FROM "SpecificationItem" s
JOIN "EquipmentKind" k
  ON pg_temp.equipment_key(k."name") = pg_temp.equipment_key(s."name")
WHERE btrim(coalesce(s."model", '')) <> ''
ORDER BY k."id", pg_temp.equipment_key(s."model"), s."createdAt";

-- AlterTable: новые колонки сначала необязательные — их заполняют ниже.
ALTER TABLE "SpecificationItem"
ADD COLUMN "projectId" TEXT,
ADD COLUMN "kindId" TEXT,
ADD COLUMN "modelId" TEXT,
ADD COLUMN "note" TEXT,
ALTER COLUMN "groupId" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL;

UPDATE "SpecificationItem" s
SET "projectId" = g."projectId"
FROM "TiGroup" g
WHERE g."id" = s."groupId";

UPDATE "SpecificationItem" s
SET "kindId" = k."id"
FROM "EquipmentKind" k
WHERE pg_temp.equipment_key(k."name") = pg_temp.equipment_key(s."name");

UPDATE "SpecificationItem" s
SET "modelId" = m."id"
FROM "EquipmentModel" m
WHERE m."kindId" = s."kindId"
  AND pg_temp.equipment_key(m."name") = pg_temp.equipment_key(s."model");

ALTER TABLE "SpecificationItem"
ALTER COLUMN "projectId" SET NOT NULL,
ALTER COLUMN "kindId" SET NOT NULL,
DROP COLUMN "name",
DROP COLUMN "model",
DROP COLUMN "unit";

-- CreateIndex
CREATE INDEX "SpecificationItem_projectId_idx" ON "SpecificationItem"("projectId");

-- CreateIndex
CREATE INDEX "SpecificationItem_kindId_idx" ON "SpecificationItem"("kindId");

-- CreateIndex
CREATE INDEX "SpecificationItem_modelId_idx" ON "SpecificationItem"("modelId");

-- AddForeignKey
ALTER TABLE "EquipmentModel" ADD CONSTRAINT "EquipmentModel_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "EquipmentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationItem" ADD CONSTRAINT "SpecificationItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationItem" ADD CONSTRAINT "SpecificationItem_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "EquipmentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: составной — марка должна быть того же вида, что и позиция.
ALTER TABLE "SpecificationItem" ADD CONSTRAINT "SpecificationItem_modelId_kindId_fkey" FOREIGN KEY ("modelId", "kindId") REFERENCES "EquipmentModel"("id", "kindId") ON DELETE RESTRICT ON UPDATE CASCADE;
