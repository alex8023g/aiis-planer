-- Объекты проекта, точки учёта и спецификация. Одной миграцией: в базе эта
-- часть схемы складывалась пошагово (решения, объекты, перенос спецификации на
-- объект, переименование описания), но промежуточных состояний больше нет ни у
-- кого — снаружи видно только этот результат.

-- CreateTable
CREATE TABLE "SpecificationItem" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecificationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentDescription" TEXT NOT NULL DEFAULT '',
    "technicalSolution" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "facilityId" TEXT,
    "name" TEXT NOT NULL,
    "meterModel" TEXT,
    "meterNumber" TEXT,
    "meterLocation" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasurementPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecificationItem_facilityId_idx" ON "SpecificationItem"("facilityId");

-- CreateIndex
CREATE INDEX "Facility_projectId_idx" ON "Facility"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_projectId_name_key" ON "Facility"("projectId", "name");

-- CreateIndex
CREATE INDEX "MeasurementPoint_projectId_idx" ON "MeasurementPoint"("projectId");

-- CreateIndex
CREATE INDEX "MeasurementPoint_facilityId_idx" ON "MeasurementPoint"("facilityId");

-- AddForeignKey
ALTER TABLE "SpecificationItem" ADD CONSTRAINT "SpecificationItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementPoint" ADD CONSTRAINT "MeasurementPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementPoint" ADD CONSTRAINT "MeasurementPoint_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

