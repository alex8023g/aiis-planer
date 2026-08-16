-- Подзадача dogovor стала первой в этапе «СМР / ПНР» (см. stageSubtaskKeys
-- в src/lib/stages.ts), поэтому существующие подзадачи сдвигаются на позицию
-- вперёд. Значение enum dogovor уже есть в SubtaskKey — миграция только с данными.
UPDATE "Subtask"
SET "position" = "position" + 1
WHERE "stageId" IN (SELECT "id" FROM "Stage" WHERE "kind" = 'smrPnr');

INSERT INTO "Subtask" ("id", "stageId", "key", "status", "position")
SELECT gen_random_uuid()::text, "id", 'dogovor', 'not_started', 0
FROM "Stage"
WHERE "kind" = 'smrPnr'
ON CONFLICT ("stageId", "key") DO NOTHING;
