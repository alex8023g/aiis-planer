-- Модем заводится с группой пустым, поэтому вид модема становится необязательным.
ALTER TABLE "Modem" ALTER COLUMN "kind" DROP NOT NULL;

-- ТИ без группы — каждой свою группу. Временная колонка связывает новую
-- группу с её ТИ.
ALTER TABLE "TiGroup" ADD COLUMN "_tiId" TEXT;

INSERT INTO "TiGroup" ("id", "projectId", "updatedAt", "_tiId")
SELECT gen_random_uuid()::text, t."projectId", CURRENT_TIMESTAMP, t."id"
FROM "Ti" t
WHERE t."groupId" IS NULL;

UPDATE "Ti" t
SET "groupId" = g."id"
FROM "TiGroup" g
WHERE g."_tiId" = t."id";

ALTER TABLE "TiGroup" DROP COLUMN "_tiId";

-- Группам, у которых модема нет, — пустой модем.
INSERT INTO "Modem" ("id", "groupId")
SELECT gen_random_uuid()::text, g."id"
FROM "TiGroup" g
WHERE NOT EXISTS (SELECT 1 FROM "Modem" m WHERE m."groupId" = g."id");

-- Модемам без SIM-карты — пустая карта.
INSERT INTO "SimCard" ("id", "modemId")
SELECT gen_random_uuid()::text, m."id"
FROM "Modem" m
WHERE NOT EXISTS (SELECT 1 FROM "SimCard" s WHERE s."modemId" = m."id");
