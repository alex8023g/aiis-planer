-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('epr_customer', 'rn_energo', 'sro');

-- CreateTable
CREATE TABLE "contract" (
    "id" TEXT NOT NULL,
    "source" "ContractSource" NOT NULL,
    "registryYear" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "counterparty" TEXT NOT NULL,
    "objectName" TEXT,
    "subject" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "amountNote" TEXT,
    "vatNote" TEXT,
    "termText" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "statusText" TEXT,
    "originalState" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_stage" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "statusText" TEXT,
    "closedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "contract_stage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_source_registryYear_idx" ON "contract"("source", "registryYear");

-- CreateIndex
CREATE INDEX "contract_signedAt_idx" ON "contract"("signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_source_registryYear_number_key" ON "contract"("source", "registryYear", "number");

-- CreateIndex
CREATE INDEX "contract_stage_contractId_idx" ON "contract_stage"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_stage_contractId_no_key" ON "contract_stage"("contractId", "no");

-- AddForeignKey
ALTER TABLE "contract_stage" ADD CONSTRAINT "contract_stage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
