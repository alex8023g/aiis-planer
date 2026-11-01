-- AlterTable
ALTER TABLE "Modem" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'gprs',
ADD COLUMN     "port" TEXT;

-- Порт и канал переезжают к модему группы ТИ. У ТИ одной группы они могли
-- разойтись — берём первую по порядку в таблице ТИ, у которой порт записан.
-- Группы без модема получают модем: иначе порт пропал бы.
CREATE TEMP TABLE "_group_connection" AS
SELECT DISTINCT ON ("t"."groupId") "t"."groupId", "c"."port", "c"."channel"
FROM "Connection" "c"
JOIN "Ti" "t" ON "t"."id" = "c"."tiId"
WHERE "t"."groupId" IS NOT NULL
  AND ("c"."port" IS NOT NULL OR "c"."channel" <> 'gprs')
ORDER BY "t"."groupId", ("c"."port" IS NULL), "t"."position", "t"."createdAt";

INSERT INTO "Modem" ("id", "groupId")
SELECT 'mig_' || "g"."groupId", "g"."groupId"
FROM "_group_connection" "g"
WHERE NOT EXISTS (SELECT 1 FROM "Modem" "m" WHERE "m"."groupId" = "g"."groupId");

UPDATE "Modem" "m"
SET "port" = "g"."port", "channel" = "g"."channel"
FROM "_group_connection" "g"
WHERE "m"."groupId" = "g"."groupId";

DROP TABLE "_group_connection";

-- DropForeignKey
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_tiId_fkey";

-- DropTable
DROP TABLE "Connection";
