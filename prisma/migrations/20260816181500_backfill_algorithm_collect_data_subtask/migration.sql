-- Подзадача collectData стала первой в этапе «Алгоритм» (см. stageSubtaskKeys
-- в src/lib/stages.ts), поэтому существующие подзадачи сдвигаются на позицию
-- вперёд. Отдельная миграция: значение enum, добавленное в предыдущей, нельзя
-- использовать в той же транзакции.
UPDATE "Subtask"
SET "position" = "position" + 1
WHERE "stageId" IN (SELECT "id" FROM "Stage" WHERE "kind" = 'algorithm');

INSERT INTO "Subtask" ("id", "stageId", "key", "status", "position")
SELECT gen_random_uuid()::text, "id", 'collectData', 'not_started', 0
FROM "Stage"
WHERE "kind" = 'algorithm'
ON CONFLICT ("stageId", "key") DO NOTHING;
