-- «Опрашивается» becomes free text «сущ. опрос». Existing values are kept
-- as the text the table showed: «нет», «да», «да, по встр. модему» /
-- «да, по внеш. модему» (the modem kind lives on the group's modem).
ALTER TABLE "Ti" ADD COLUMN "existingPolling" TEXT;

UPDATE "Ti" t
SET "existingPolling" = CASE
  WHEN t."isPolled" IS NULL THEN NULL
  WHEN NOT t."isPolled" THEN 'нет'
  ELSE 'да' || COALESCE(
    (SELECT CASE m."kind"
              WHEN 'builtIn' THEN ', по встр. модему'
              WHEN 'external' THEN ', по внеш. модему'
            END
       FROM "Modem" m
      WHERE m."groupId" = t."groupId"),
    '')
END;

ALTER TABLE "Ti" DROP COLUMN "isPolled";
