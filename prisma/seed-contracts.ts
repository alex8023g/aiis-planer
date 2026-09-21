import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import type { ContractSource } from '../src/generated/prisma/enums';

/// Форма строки из prisma/data/contracts-2026.json — её готовит
/// scripts/extract_contracts.py, разбирая три реестра .xlsx/.xlsb.
type StageRow = {
  no: number;
  name: string;
  amount: number | null;
  statusText: string | null;
  closedAt: string | null;
  dueAt: string | null;
};

type ContractRow = {
  source: ContractSource;
  registryYear: number;
  number: string;
  sourceSheet: string;
  sourceRow: number;
  signedAt: string | null;
  counterparty: string;
  objectName: string | null;
  subject: string;
  amount: number | null;
  amountNote: string | null;
  vatNote: string | null;
  termText: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  statusText: string | null;
  originalState: string | null;
  stages: StageRow[];
  raw: unknown;
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const asDate = (value: string | null | undefined) =>
  value ? new Date(value) : null;

async function main() {
  const file = join(import.meta.dirname, 'data', 'contracts-2026.json');
  const rows: ContractRow[] = JSON.parse(readFileSync(file, 'utf-8'));

  let stages = 0;

  for (const row of rows) {
    const data = {
      source: row.source,
      registryYear: row.registryYear,
      number: row.number,
      sourceSheet: row.sourceSheet,
      sourceRow: row.sourceRow,
      signedAt: asDate(row.signedAt),
      counterparty: row.counterparty,
      objectName: row.objectName,
      subject: row.subject,
      amount: row.amount,
      amountNote: row.amountNote,
      vatNote: row.vatNote,
      termText: row.termText,
      startsAt: asDate(row.startsAt),
      endsAt: asDate(row.endsAt),
      statusText: row.statusText,
      originalState: row.originalState,
      raw: row.raw as object,
    };

    /// Ключ [source, registryYear, number] делает переимпорт идемпотентным:
    /// реестры правят руками, и перезалив не должен плодить дубли.
    const contract = await prisma.contract.upsert({
      where: {
        source_registryYear_sourceSheet_sourceRow: {
          source: row.source,
          registryYear: row.registryYear,
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
        },
      },
      create: data,
      update: data,
    });

    /// Этапы проще перезаписать целиком, чем сверять построчно.
    await prisma.contractStage.deleteMany({
      where: { contractId: contract.id },
    });
    if (row.stages.length > 0) {
      await prisma.contractStage.createMany({
        data: row.stages.map((stage) => ({
          contractId: contract.id,
          no: stage.no,
          name: stage.name,
          amount: stage.amount,
          statusText: stage.statusText,
          closedAt: asDate(stage.closedAt),
          dueAt: asDate(stage.dueAt),
        })),
      });
      stages += row.stages.length;
    }
  }

  const bySource = await prisma.contract.groupBy({
    by: ['source'],
    _count: { _all: true },
  });

  console.log(`seeded ${rows.length} contracts, ${stages} stages`);
  for (const group of bySource) {
    console.log(`  ${group.source}: ${group._count._all}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
