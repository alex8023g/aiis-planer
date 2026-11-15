-- AlterTable
ALTER TABLE "SimCard" ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'gprs';

-- Канал переезжает с модема на его SIM-карты: каждая карта получает канал
-- своего модема.
UPDATE "SimCard" AS s
SET "channel" = m."channel"
FROM "Modem" AS m
WHERE s."modemId" = m."id";

-- Модем с CSD без карт: заводим ему основную карту, иначе канал потеряется.
INSERT INTO "SimCard" ("id", "modemId", "slot", "channel")
SELECT 'sim_' || m."id", m."id", 1, m."channel"
FROM "Modem" AS m
WHERE m."channel" <> 'gprs'
  AND NOT EXISTS (SELECT 1 FROM "SimCard" AS s WHERE s."modemId" = m."id");

-- AlterTable
ALTER TABLE "Modem" DROP COLUMN "channel";
