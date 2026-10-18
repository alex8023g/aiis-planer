-- CreateTable
CREATE TABLE "AtsDictionaryImport" (
    "id" SERIAL NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsDictionaryImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsMeterType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "grsiCode" TEXT NOT NULL,
    "isIntegral" BOOLEAN NOT NULL,
    "calibrationInterval" INTEGER NOT NULL,

    CONSTRAINT "AtsMeterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsMeterModification" (
    "atsCode" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "activeChannels" INTEGER NOT NULL,
    "reactiveChannels" INTEGER NOT NULL,
    "ratedCurrents" TEXT[],
    "ratedVoltages" TEXT[],
    "comment" TEXT,
    "stopDateAiis" DATE,
    "stopDateIsu" DATE,
    "stopDateUnion" DATE,
    "inStopList" BOOLEAN NOT NULL,
    "accuracyClasses" TEXT[],

    CONSTRAINT "AtsMeterModification_pkey" PRIMARY KEY ("atsCode")
);

-- CreateTable
CREATE TABLE "AtsCurrentTransformerType" (
    "atsCode" TEXT NOT NULL,
    "grsiCode" TEXT NOT NULL,
    "calibrationIntervals" INTEGER[],
    "manufacturers" TEXT[],

    CONSTRAINT "AtsCurrentTransformerType_pkey" PRIMARY KEY ("atsCode")
);

-- CreateTable
CREATE TABLE "AtsCurrentTransformerName" (
    "id" SERIAL NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDigital" BOOLEAN NOT NULL,
    "comment" TEXT,
    "stopDateAiis" DATE,
    "stopDateIsu" DATE,
    "stopDateUnion" DATE,

    CONSTRAINT "AtsCurrentTransformerName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsCurrentTransformerRating" (
    "id" SERIAL NOT NULL,
    "typeNameId" INTEGER NOT NULL,
    "accuracyClass" TEXT NOT NULL,
    "primaryCurrent" DECIMAL(65,30),
    "primaryCurrentMin" DECIMAL(65,30),
    "primaryCurrentMax" DECIMAL(65,30),
    "secondaryCurrent" DECIMAL(65,30),
    "secondaryLoad" DECIMAL(65,30),
    "serialNumbers" TEXT[],

    CONSTRAINT "AtsCurrentTransformerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsVoltageTransformerType" (
    "atsCode" TEXT NOT NULL,
    "grsiCode" TEXT NOT NULL,
    "calibrationIntervals" INTEGER[],
    "manufacturers" TEXT[],

    CONSTRAINT "AtsVoltageTransformerType_pkey" PRIMARY KEY ("atsCode")
);

-- CreateTable
CREATE TABLE "AtsVoltageTransformerName" (
    "id" SERIAL NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDigital" BOOLEAN NOT NULL,
    "comment" TEXT,
    "stopDateAiis" DATE,
    "stopDateIsu" DATE,
    "stopDateUnion" DATE,

    CONSTRAINT "AtsVoltageTransformerName_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsVoltageTransformerRating" (
    "id" SERIAL NOT NULL,
    "typeNameId" INTEGER NOT NULL,
    "accuracyClass" TEXT NOT NULL,
    "primaryVoltage" DECIMAL(65,30),
    "primaryVoltageMin" DECIMAL(65,30),
    "primaryVoltageMax" DECIMAL(65,30),
    "secondaryVoltage" DECIMAL(65,30),
    "secondaryLoad" DECIMAL(65,30),
    "serialNumbers" TEXT[],

    CONSTRAINT "AtsVoltageTransformerRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsUspdType" (
    "atsCode" TEXT NOT NULL,
    "grsiCode" TEXT NOT NULL,
    "calibrationIntervals" INTEGER[],
    "manufacturers" TEXT[],

    CONSTRAINT "AtsUspdType_pkey" PRIMARY KEY ("atsCode")
);

-- CreateTable
CREATE TABLE "AtsUspdName" (
    "id" SERIAL NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "comment" TEXT,
    "stopDateAiis" DATE,
    "stopDateIsu" DATE,
    "stopDateUnion" DATE,

    CONSTRAINT "AtsUspdName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AtsMeterType_grsiCode_idx" ON "AtsMeterType"("grsiCode");

-- CreateIndex
CREATE INDEX "AtsMeterModification_typeId_idx" ON "AtsMeterModification"("typeId");

-- CreateIndex
CREATE INDEX "AtsMeterModification_name_idx" ON "AtsMeterModification"("name");

-- CreateIndex
CREATE INDEX "AtsCurrentTransformerType_grsiCode_idx" ON "AtsCurrentTransformerType"("grsiCode");

-- CreateIndex
CREATE INDEX "AtsCurrentTransformerName_typeId_idx" ON "AtsCurrentTransformerName"("typeId");

-- CreateIndex
CREATE INDEX "AtsCurrentTransformerName_name_idx" ON "AtsCurrentTransformerName"("name");

-- CreateIndex
CREATE INDEX "AtsCurrentTransformerRating_typeNameId_idx" ON "AtsCurrentTransformerRating"("typeNameId");

-- CreateIndex
CREATE INDEX "AtsVoltageTransformerType_grsiCode_idx" ON "AtsVoltageTransformerType"("grsiCode");

-- CreateIndex
CREATE INDEX "AtsVoltageTransformerName_typeId_idx" ON "AtsVoltageTransformerName"("typeId");

-- CreateIndex
CREATE INDEX "AtsVoltageTransformerName_name_idx" ON "AtsVoltageTransformerName"("name");

-- CreateIndex
CREATE INDEX "AtsVoltageTransformerRating_typeNameId_idx" ON "AtsVoltageTransformerRating"("typeNameId");

-- CreateIndex
CREATE INDEX "AtsUspdType_grsiCode_idx" ON "AtsUspdType"("grsiCode");

-- CreateIndex
CREATE INDEX "AtsUspdName_typeId_idx" ON "AtsUspdName"("typeId");

-- CreateIndex
CREATE INDEX "AtsUspdName_name_idx" ON "AtsUspdName"("name");

-- AddForeignKey
ALTER TABLE "AtsMeterModification" ADD CONSTRAINT "AtsMeterModification_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AtsMeterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCurrentTransformerName" ADD CONSTRAINT "AtsCurrentTransformerName_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AtsCurrentTransformerType"("atsCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCurrentTransformerRating" ADD CONSTRAINT "AtsCurrentTransformerRating_typeNameId_fkey" FOREIGN KEY ("typeNameId") REFERENCES "AtsCurrentTransformerName"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsVoltageTransformerName" ADD CONSTRAINT "AtsVoltageTransformerName_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AtsVoltageTransformerType"("atsCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsVoltageTransformerRating" ADD CONSTRAINT "AtsVoltageTransformerRating_typeNameId_fkey" FOREIGN KEY ("typeNameId") REFERENCES "AtsVoltageTransformerName"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsUspdName" ADD CONSTRAINT "AtsUspdName_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AtsUspdType"("atsCode") ON DELETE CASCADE ON UPDATE CASCADE;
