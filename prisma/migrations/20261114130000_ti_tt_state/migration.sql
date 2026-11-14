-- Состояние ТТ (есть / нет / не выяснили) — как у ТН: на самой строке Tt, и
-- строка Tt теперь есть у каждой ТИ, ровно одна. Перечисление состояний у
-- ТТ и ТН общее — TnState переименовано в TransformerState (переименованием,
-- а не пересозданием: состояния ТН сохраняются).

-- RenameEnum
ALTER TYPE "TnState" RENAME TO "TransformerState";

-- AlterTable
ALTER TABLE "Tt" ADD COLUMN     "state" "TransformerState" NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE UNIQUE INDEX "Tt_tiId_key" ON "Tt"("tiId");

-- Уже заведённые ТТ с данными — ТТ есть.
UPDATE "Tt" SET "state" = 'present'
WHERE COALESCE("typeA", "typeB", "typeC", "numberA", "numberB", "numberC",
               "ratio") IS NOT NULL
   OR "dateInstalled" IS NOT NULL
   OR "dateRemoved" IS NOT NULL;

-- ТИ без строки Tt — заводим её: есть ли там ТТ, не выяснили.
INSERT INTO "Tt" ("id", "tiId", "state")
SELECT gen_random_uuid()::text, "id", 'unknown'
FROM "Ti"
WHERE "id" NOT IN (SELECT "tiId" FROM "Tt");

-- «ТТ нет» — и данных ТТ нет. Prisma CHECK не описывает, поэтому он только
-- здесь.
ALTER TABLE "Tt" ADD CONSTRAINT "Tt_absent_is_empty" CHECK (
  "state" <> 'absent' OR (
    "typeA" IS NULL AND "typeB" IS NULL AND "typeC" IS NULL AND
    "numberA" IS NULL AND "numberB" IS NULL AND "numberC" IS NULL AND
    "ratio" IS NULL AND "dateInstalled" IS NULL AND "dateRemoved" IS NULL
  )
);
