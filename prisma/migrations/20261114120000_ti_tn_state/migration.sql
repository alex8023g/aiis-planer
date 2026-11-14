-- Состояние ТН (есть / нет / не выяснили) — на самой строке Tn, и строка Tn
-- теперь есть у каждой ТИ, ровно одна.

-- CreateEnum
CREATE TYPE "TnState" AS ENUM ('unknown', 'absent', 'present');

-- AlterTable
ALTER TABLE "Tn" ADD COLUMN     "state" "TnState" NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE UNIQUE INDEX "Tn_tiId_key" ON "Tn"("tiId");

-- Уже заведённые ТН — с данными (опрос записал марку, номер или Ктн):
-- ТН есть.
UPDATE "Tn" SET "state" = 'present'
WHERE COALESCE("typeA", "typeB", "typeC", "numberA", "numberB", "numberC",
               "ratio") IS NOT NULL
   OR "dateInstalled" IS NOT NULL
   OR "dateRemoved" IS NOT NULL;

-- ТИ без строки Tn — заводим её: есть ли там ТН, не выяснили.
INSERT INTO "Tn" ("id", "tiId", "state")
SELECT gen_random_uuid()::text, "id", 'unknown'
FROM "Ti"
WHERE "id" NOT IN (SELECT "tiId" FROM "Tn");

-- «ТН нет» — и данных ТН нет: иначе состояние и данные противоречили бы
-- друг другу. Prisma CHECK не описывает, поэтому он только здесь.
ALTER TABLE "Tn" ADD CONSTRAINT "Tn_absent_is_empty" CHECK (
  "state" <> 'absent' OR (
    "typeA" IS NULL AND "typeB" IS NULL AND "typeC" IS NULL AND
    "numberA" IS NULL AND "numberB" IS NULL AND "numberC" IS NULL AND
    "ratio" IS NULL AND "dateInstalled" IS NULL AND "dateRemoved" IS NULL
  )
);
