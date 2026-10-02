import dayjs from 'dayjs';

import type { ContractSource } from '@/generated/prisma/enums';
import type { ContractListItem } from '@/lib/contracts';

/// Поля формы редактирования договора. Живут отдельно от src/lib/contracts.ts:
/// тот тянет prisma, а этот файл импортирует клиентский ContractDialog — та же
/// причина, по которой projectToFormFields лежит в src/lib/stages.ts, а не в
/// src/lib/projects.ts. ContractListItem берём через import type: он стирается
/// при компиляции и prisma в браузерный бандл не тащит.
///
/// Всё — строки: это ровно то, что отдают <input> и <textarea>. Пустая строка
/// означает null в базе, разбором занимается updateContract.
export type ContractFormFields = {
  /// Реестр договора. Спрашивается только при создании: от него зависит, на
  /// какой вкладке договор окажется. updateContract это поле намеренно не
  /// пишет — смена реестра у строки из .xlsx может занять чужую координату
  /// [source, registryYear, sourceSheet, sourceRow] и уронить запрос.
  source: ContractSource;
  number: string;
  /// yyyy-mm-dd — формат <input type='date'>. Пустая строка: даты в реестре нет.
  signedAt: string;
  counterparty: string;
  objectName: string;
  subject: string;
  /// Пустая строка — суммы нет; смысл тогда несёт amountNote (см. Amount
  /// в src/app/contracts/page.tsx).
  amount: string;
  amountNote: string;
  vatNote: string;
  dsNote: string;
  endsAt: string;
  termText: string;
  statusText: string;
};

const dateInput = (value: Date | null) =>
  value ? dayjs(value).format('YYYY-MM-DD') : '';

/// Координаты строки в реестре (source, registryYear, sourceSheet, sourceRow),
/// originalState и raw в форму не попадают: это не данные договора, а место,
/// откуда его забрал импорт, и его оригинал — руками их менять нечего.
export function contractToFormFields(
  row: ContractListItem,
): ContractFormFields {
  return {
    source: row.source,
    number: row.number,
    signedAt: dateInput(row.signedAt),
    counterparty: row.counterparty,
    objectName: row.objectName ?? '',
    subject: row.subject,
    amount: row.amount === null ? '' : String(row.amount),
    amountNote: row.amountNote ?? '',
    vatNote: row.vatNote ?? '',
    dsNote: row.dsNote ?? '',
    endsAt: dateInput(row.endsAt),
    termText: row.termText ?? '',
    statusText: row.statusText ?? '',
  };
}

/// Пустая форма нового договора. Реестр приходит снаружи — это вкладка, с
/// которой нажали «Добавить договор».
export function newContractFormFields(
  source: ContractSource,
): ContractFormFields {
  return {
    source,
    number: '',
    signedAt: '',
    counterparty: '',
    objectName: '',
    subject: '',
    amount: '',
    amountNote: '',
    vatNote: '',
    dsNote: '',
    endsAt: '',
    termText: '',
    statusText: '',
  };
}
