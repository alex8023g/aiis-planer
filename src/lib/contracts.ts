import { prisma } from '@/lib/prisma';
import type { ContractFileItem } from '@/lib/contract-files';
import { contractSources } from '@/lib/contract-sources';
import type { Prisma } from '@/generated/prisma/client';
import type { ContractSource } from '@/generated/prisma/enums';

export type ContractStageItem = {
  id: string;
  no: number;
  name: string;
  amount: number | null;
  statusText: string | null;
  closedAt: Date | null;
  dueAt: Date | null;
};

export type ContractListItem = {
  id: string;
  source: ContractSource;
  number: string;
  signedAt: Date | null;
  counterparty: string;
  objectName: string | null;
  subject: string;
  /// null, если в реестре вместо суммы стоял текст — он тогда в amountNote.
  amount: number | null;
  amountNote: string | null;
  vatNote: string | null;
  /// Состояние допсоглашения — к сумме отношения не имеет, живёт в статусе.
  dsNote: string | null;
  termText: string | null;
  endsAt: Date | null;
  statusText: string | null;
  originalState: string | null;
  stages: ContractStageItem[];
  /// Только метаданные — они лёгкие, и тянуть их сразу со строкой дешевле, чем
  /// ходить за ними отдельно: они нужны и колонке «Файлы», и диалогу правки.
  files: ContractFileItem[];
};

/// Prisma отдаёт деньги как Decimal, а не как number: до React его доводить
/// незачем, поэтому разворачиваем здесь.
const toNumber = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

/// Поиск по тексту строки: номер, контрагент, объект, предмет — подстрокой без
/// учёта регистра. Сумма — только точным совпадением: contains по Decimal
/// Prisma не умеет, а «220 000» и «220000,00» из поля сводим к одному числу.
export function buildSearchWhere(q?: string): Prisma.ContractWhereInput {
  const text = q?.trim();
  if (!text) return {};

  const contains = { contains: text, mode: 'insensitive' } as const;
  const or: Prisma.ContractWhereInput[] = [
    { number: contains },
    { counterparty: contains },
    { objectName: contains },
    { subject: contains },
  ];

  const numeric = text.replace(/[\s\u00a0₽]/g, '').replace(',', '.');
  const amount = Number(numeric);
  if (numeric && Number.isFinite(amount)) or.push({ amount: { equals: amount } });

  return { OR: or };
}

/// Договоры одного года реестра, при желании — одного источника.
/// Порядок — по дате подписания, свежие сверху; договоры без даты в реестре
/// встречаются, они уходят в конец.
export async function getContracts(options: {
  registryYear: number;
  source?: ContractSource;
  q?: string;
}): Promise<ContractListItem[]> {
  const rows = await prisma.contract.findMany({
    where: {
      registryYear: options.registryYear,
      ...(options.source ? { source: options.source } : {}),
      ...buildSearchWhere(options.q),
    },
    include: {
      stages: { orderBy: { no: 'asc' } },
      files: {
        select: {
          id: true,
          fileName: true,
          contentType: true,
          size: true,
          uploadedBy: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: [
      /// nulls: 'last' обязателен: в Postgres при DESC пустые даты идут первыми,
      /// а договоры без даты в реестре — не самые свежие, а просто незаполненные.
      { signedAt: { sort: 'desc', nulls: 'last' } },
      { sourceRow: 'asc' },
    ],
  });

  return rows.map((row) => ({
    ...row,
    amount: toNumber(row.amount),
    stages: row.stages.map((stage) => ({
      ...stage,
      amount: toNumber(stage.amount),
    })),
  }));
}

/// Сколько договоров в каждом реестре — для переключателя над таблицей.
/// С поиском считаем только найденные, чтобы вкладки не обещали лишнего.
export async function getContractCounts(registryYear: number, q?: string) {
  const groups = await prisma.contract.groupBy({
    by: ['source'],
    where: { registryYear, ...buildSearchWhere(q) },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    contractSources.map((source) => [source, 0]),
  ) as Record<ContractSource, number>;

  for (const group of groups) counts[group.source] = group._count._all;

  return counts;
}
