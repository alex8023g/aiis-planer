-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('ppo', 'design', 'supply', 'smrPnr', 'poverka', 'algorithm', 'metrology');

-- CreateEnum
CREATE TYPE "SubtaskKey" AS ENUM ('dogovor', 'dopusk', 'visit', 'summary', 'specification', 'xml20000', 'report', 'tz', 'rd', 'td', 'request', 'received', 'assembled', 'sent', 'delivered', 'allWorks', 'arshin', 'sendTask', 'done', 'documents', 'vniims', 'rosstandart', 'poverkaAiis');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateStart" DATE NOT NULL,
    "responsible" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "StageKind" NOT NULL,
    "duration" INTEGER NOT NULL,
    "startAfterStageId" TEXT,
    "startAfterSubtask" "SubtaskKey",

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "key" "SubtaskKey" NOT NULL,
    "status" "TaskStatus",
    "position" INTEGER NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stage_startAfterStageId_idx" ON "Stage"("startAfterStageId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_projectId_kind_key" ON "Stage"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Subtask_stageId_key_key" ON "Subtask"("stageId", "key");

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_startAfterStageId_fkey" FOREIGN KEY ("startAfterStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
