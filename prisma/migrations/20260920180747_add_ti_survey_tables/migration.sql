-- CreateEnum
CREATE TYPE "EquipmentState" AS ENUM ('current', 'removed', 'proposed');

-- CreateEnum
CREATE TYPE "ModemKind" AS ENUM ('builtIn', 'external');

-- CreateEnum
CREATE TYPE "VoltageClass" AS ENUM ('kv0_4', 'kv6', 'kv10', 'kv35', 'kv110', 'kv220', 'kv330', 'kv750');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('gprs', 'csd');

-- CreateTable
CREATE TABLE "Ti" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uNom" "VoltageClass",
    "position" INTEGER NOT NULL,
    "uspdId" TEXT,
    "modemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sidePollingId" TEXT,
    "tisNotesId" TEXT,

    CONSTRAINT "Ti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
    "tiId" TEXT NOT NULL,
    "state" "EquipmentState" NOT NULL,
    "type" TEXT,
    "number" TEXT,
    "isCompliant" BOOLEAN,
    "dateInstalled" DATE,
    "dateRemoved" DATE,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tt" (
    "id" TEXT NOT NULL,
    "tiId" TEXT NOT NULL,
    "typeA" TEXT,
    "typeB" TEXT,
    "typeC" TEXT,
    "numberA" TEXT,
    "numberB" TEXT,
    "numberC" TEXT,
    "ratio" TEXT,
    "dateInstalled" DATE,
    "dateRemoved" DATE,

    CONSTRAINT "Tt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tn" (
    "id" TEXT NOT NULL,
    "tiId" TEXT NOT NULL,
    "typeA" TEXT,
    "typeB" TEXT,
    "typeC" TEXT,
    "numberA" TEXT,
    "numberB" TEXT,
    "numberC" TEXT,
    "ratio" TEXT,
    "dateInstalled" DATE,
    "dateRemoved" DATE,

    CONSTRAINT "Tn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SidePolling" (
    "id" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "SidePolling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Uspd" (
    "id" TEXT NOT NULL,
    "type" TEXT,
    "number" TEXT,

    CONSTRAINT "Uspd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modem" (
    "id" TEXT NOT NULL,
    "kind" "ModemKind" NOT NULL,
    "type" TEXT,
    "number" TEXT,

    CONSTRAINT "Modem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "tiId" TEXT NOT NULL,
    "meterAddress" TEXT,
    "port" TEXT,
    "channel" "Channel" NOT NULL DEFAULT 'gprs',

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimCard" (
    "id" TEXT NOT NULL,
    "modemId" TEXT NOT NULL,
    "number" TEXT,
    "ip" TEXT,
    "provider" TEXT,

    CONSTRAINT "SimCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TisNotes" (
    "id" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "TisNotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ti_projectId_idx" ON "Ti"("projectId");

-- CreateIndex
CREATE INDEX "Ti_modemId_idx" ON "Ti"("modemId");

-- CreateIndex
CREATE UNIQUE INDEX "Meter_tiId_state_key" ON "Meter"("tiId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Tt_tiId_key" ON "Tt"("tiId");

-- CreateIndex
CREATE UNIQUE INDEX "Tn_tiId_key" ON "Tn"("tiId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_tiId_key" ON "Connection"("tiId");

-- CreateIndex
CREATE UNIQUE INDEX "SimCard_modemId_key" ON "SimCard"("modemId");

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_uspdId_fkey" FOREIGN KEY ("uspdId") REFERENCES "Uspd"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_modemId_fkey" FOREIGN KEY ("modemId") REFERENCES "Modem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_sidePollingId_fkey" FOREIGN KEY ("sidePollingId") REFERENCES "SidePolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ti" ADD CONSTRAINT "Ti_tisNotesId_fkey" FOREIGN KEY ("tisNotesId") REFERENCES "TisNotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_tiId_fkey" FOREIGN KEY ("tiId") REFERENCES "Ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tt" ADD CONSTRAINT "Tt_tiId_fkey" FOREIGN KEY ("tiId") REFERENCES "Ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tn" ADD CONSTRAINT "Tn_tiId_fkey" FOREIGN KEY ("tiId") REFERENCES "Ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_tiId_fkey" FOREIGN KEY ("tiId") REFERENCES "Ti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimCard" ADD CONSTRAINT "SimCard_modemId_fkey" FOREIGN KEY ("modemId") REFERENCES "Modem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

