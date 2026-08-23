-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'viewer';

-- Backfill: до появления ролей любой вошедший мог менять свои проекты.
-- Уже заведённым пользователям сохраняем это право (editor), а вот новые
-- по умолчанию получают только просмотр (viewer).
UPDATE "user" SET "role" = 'editor';
