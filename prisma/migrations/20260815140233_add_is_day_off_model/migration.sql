-- CreateTable
CREATE TABLE "is_day_off" (
    "year" INTEGER NOT NULL,
    "days" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "is_day_off_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "is_day_off_year_key" ON "is_day_off"("year");
