-- CreateEnum
CREATE TYPE "TiStatus" AS ENUM ('in_progress', 'done', 'warning');

-- AlterTable
ALTER TABLE "Ti" ADD COLUMN     "status" "TiStatus" NOT NULL DEFAULT 'in_progress';
