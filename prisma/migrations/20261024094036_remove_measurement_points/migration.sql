-- DropForeignKey
ALTER TABLE "SpecificationItem" DROP CONSTRAINT "SpecificationItem_facilityId_fkey";

-- DropForeignKey
ALTER TABLE "Facility" DROP CONSTRAINT "Facility_projectId_fkey";

-- DropForeignKey
ALTER TABLE "MeasurementPoint" DROP CONSTRAINT "MeasurementPoint_projectId_fkey";

-- DropForeignKey
ALTER TABLE "MeasurementPoint" DROP CONSTRAINT "MeasurementPoint_facilityId_fkey";

-- DropTable
DROP TABLE "SpecificationItem";

-- DropTable
DROP TABLE "Facility";

-- DropTable
DROP TABLE "MeasurementPoint";
