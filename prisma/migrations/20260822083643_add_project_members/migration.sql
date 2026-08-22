-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMember_email_idx" ON "ProjectMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_email_key" ON "ProjectMember"("projectId", "email");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: до этой миграции доступ раздавался через ALLOWED_EMAILS и был
-- одинаковым для всех проектов. Чтобы никто не потерял свои проекты, каждому
-- уже заведённому пользователю выдаётся доступ ко всем существующим проектам.
-- Почты из ALLOWED_EMAILS, которые ни разу не входили, строки в "user" не
-- имеют — их нужно добавить в проекты вручную.
INSERT INTO "ProjectMember" ("id", "projectId", "email")
SELECT gen_random_uuid()::text, p."id", lower(u."email")
FROM "Project" p
CROSS JOIN "user" u
ON CONFLICT ("projectId", "email") DO NOTHING;
