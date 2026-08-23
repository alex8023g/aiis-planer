-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'pending';

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'pending';
