-- Состояние ТТ (есть / нет / не выяснили) убрано: у ТТ остаются только
-- данные по фазам. «ТТ нет» больше не хранится — такие ТТ становятся «не
-- выяснили» (данных у них и так нет: их держал пустыми этот CHECK).

-- DropConstraint
ALTER TABLE "Tt" DROP CONSTRAINT "Tt_absent_is_empty";

-- AlterTable
ALTER TABLE "Tt" DROP COLUMN "state";
