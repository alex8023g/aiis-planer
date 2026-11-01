-- AlterTable
ALTER TABLE "Meter" ADD COLUMN     "meterAddress" TEXT;

-- Адрес переезжает к счётчику, что стоит сейчас. Если счётчика ещё нет,
-- заводим его: иначе адрес пропал бы.
INSERT INTO "Meter" ("id", "tiId", "state")
SELECT 'mig_' || "c"."tiId", "c"."tiId", 'current'
FROM "Connection" "c"
WHERE "c"."meterAddress" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Meter" "m"
    WHERE "m"."tiId" = "c"."tiId" AND "m"."state" = 'current'
  );

UPDATE "Meter" "m"
SET "meterAddress" = "c"."meterAddress"
FROM "Connection" "c"
WHERE "m"."tiId" = "c"."tiId"
  AND "m"."state" = 'current'
  AND "c"."meterAddress" IS NOT NULL;

-- AlterTable
ALTER TABLE "Connection" DROP COLUMN "meterAddress";
