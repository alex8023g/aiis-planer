'use server';

import { revalidatePath } from 'next/cache';

import type { ContractSource } from '@/generated/prisma/enums';
import type { ContractFormFields } from '@/lib/contract-form';
import {
  contractSources,
  MANUAL_SHEET,
  REGISTRY_YEAR,
} from '@/lib/contract-sources';
import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';

export type ContractActionResult = { ok: true } | { ok: false; error: string };

export type CreateContractResult =
  { ok: true; id: string } | { ok: false; error: string };

/// Роль viewer: экшен вызывается из браузера напрямую, поэтому спрятанного в UI
/// меню мало — право на изменение проверяется здесь.
const readOnlyError = 'Только просмотр: изменять договоры нельзя';

type ValidatedFields = {
  number: string;
  signedAt: Date | null;
  counterparty: string;
  objectName: string | null;
  subject: string;
  /// Строка, а не number: колонка Decimal(14, 2), и через строку до базы
  /// гарантированно доходят те же копейки, что ввели в форме.
  amount: string | null;
  amountNote: string | null;
  vatNote: string | null;
  dsNote: string | null;
  endsAt: Date | null;
  termText: string | null;
  statusText: string | null;
};

/// Пустое поле формы — это null в базе, а не пустая строка: страница уже умеет
/// рисовать «—» вместо отсутствующего значения.
const orNull = (value: string) => value.trim() || null;

/// Нарушение уникального индекса. Код сверяем по полю, а не через instanceof
/// PrismaClientKnownRequestError: тот живёт в рантайме сгенерированного клиента
/// и завязываться на его расположение ради одной проверки незачем.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/// Дата из <input type='date'> приходит как yyyy-mm-dd. Полдень UTC не берём:
/// в реестрах это просто дата, время в ней смысла не несёт (тот же приём, что
/// у dateStart в src/app/actions.ts).
function parseDate(value: string): Date | null | 'invalid' {
  if (!value.trim()) return null;

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? 'invalid' : date;
}

function validate(
  fields: ContractFormFields,
): { ok: true; value: ValidatedFields } | { ok: false; error: string } {
  const number = fields.number.trim();

  /// Номер — единственное обязательное поле: по нему договор опознают в
  /// таблице. Остальные колонки в реестрах сплошь и рядом пустые.
  if (!number) {
    return { ok: false, error: 'Укажите номер договора' };
  }

  const signedAt = parseDate(fields.signedAt);
  const endsAt = parseDate(fields.endsAt);

  if (signedAt === 'invalid' || endsAt === 'invalid') {
    return { ok: false, error: 'Неверная дата' };
  }

  const rawAmount = fields.amount.trim().replace(',', '.');
  let amount: string | null = null;

  if (rawAmount) {
    const parsed = Number(rawAmount);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: 'Сумма должна быть числом' };
    }

    amount = rawAmount;
  }

  return {
    ok: true,
    value: {
      number,
      signedAt,
      counterparty: fields.counterparty.trim(),
      objectName: orNull(fields.objectName),
      subject: fields.subject.trim(),
      amount,
      amountNote: orNull(fields.amountNote),
      vatNote: orNull(fields.vatNote),
      dsNote: orNull(fields.dsNote),
      endsAt,
      termText: orNull(fields.termText),
      statusText: orNull(fields.statusText),
    },
  };
}

/// Правка одной строки реестра руками. Координаты строки (source, registryYear,
/// sourceSheet, sourceRow), originalState и raw не трогаем: raw — единственный
/// способ перепроверить, что было в исходном файле, а по координатам импорт
/// находит эту же строку при следующем прогоне.
export async function updateContract(
  id: string,
  fields: ContractFormFields,
): Promise<ContractActionResult> {
  const user = await requireUser();

  if (!canEdit(user)) {
    return { ok: false, error: readOnlyError };
  }

  const validated = validate(fields);

  if (!validated.ok) {
    return validated;
  }

  /// updateMany, а не update: отсутствующий id — это «не найден», а не
  /// исключение (как в changeUserRole, см. src/app/users/actions.ts).
  const updated = await prisma.contract.updateMany({
    where: { id },
    data: validated.value,
  });

  if (updated.count === 0) {
    return { ok: false, error: 'Договор не найден' };
  }

  revalidatePath('/contracts');

  return { ok: true };
}

/// Строка, заведённая руками: в реестре её нет, поэтому координаты выдаём сами.
/// Лист — метка MANUAL_SHEET, номер строки — следующий свободный внутри неё.
async function createManualContract(
  value: ValidatedFields & { source: ContractSource },
) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.contract.aggregate({
      where: {
        source: value.source,
        registryYear: REGISTRY_YEAR,
        sourceSheet: MANUAL_SHEET,
      },
      _max: { sourceRow: true },
    });

    return tx.contract.create({
      data: {
        ...value,
        registryYear: REGISTRY_YEAR,
        sourceSheet: MANUAL_SHEET,
        sourceRow: (last._max.sourceRow ?? 0) + 1,
        /// Колонка Json не-null: у ручного договора исходной строки реестра
        /// нет, и подделывать её нечем.
        raw: {},
      },
      select: { id: true },
    });
  });
}

export async function createContract(
  fields: ContractFormFields,
): Promise<CreateContractResult> {
  const user = await requireUser();

  if (!canEdit(user)) {
    return { ok: false, error: readOnlyError };
  }

  const validated = validate(fields);

  if (!validated.ok) {
    return validated;
  }

  /// Реестр приходит из браузера, поэтому проверяем, что он вообще существует:
  /// в базе колонка enum, и произвольная строка уронила бы запрос.
  if (!contractSources.includes(fields.source)) {
    return { ok: false, error: 'Неизвестный реестр' };
  }

  const value = { ...validated.value, source: fields.source };

  let contract;

  try {
    contract = await createManualContract(value);
  } catch (error) {
    /// Двое нажали «Создать» одновременно и вычислили один и тот же sourceRow.
    /// Второму хватает одного повтора: номер уже занят, максимум вырос.
    if (!isUniqueViolation(error)) throw error;

    contract = await createManualContract(value);
  }

  revalidatePath('/contracts');

  return { ok: true, id: contract.id };
}
