import {
  surveyRows,
  type SurveyCell,
} from '../src/app/projects/[id]/aiis2/survey-data';
import type { PrismaClient } from '../src/generated/prisma/client';
import { EquipmentState } from '../src/generated/prisma/enums';

/// Колонки опроса — индексы в строке surveyRows. Трёх колонок здесь нет:
/// «место установки», «г/в» и «тех. решение» переносить некуда, полей под них
/// в схеме пока не заведено. Значения из них в базу не попадают.
const COL = {
  number: 0,
  name: 1,
  meterType: 3,
  meterNumber: 4,
  ttRatio: 5,
  tnRatio: 6,
  replacement: 7,
  polling: 9,
  notes: 11,
} as const;

/// Кто держит значение ячейки. При rowSpan верхняя ячейка накрывает следующие
/// строки, и на их месте в surveyRows стоит null. Для каждой ячейки возвращает
/// индекс строки-владельца (или -1, если значения нет): по нему потом видно,
/// какие ТИ делят одно значение, а какие — свои собственные.
function resolveOwners(rows: SurveyCell[][]): number[][] {
  const owners: number[][] = rows.map(() => []);
  const columnCount = Math.max(...rows.map((row) => row.length));

  for (let col = 0; col < columnCount; col += 1) {
    let owner = -1;
    let covered = 0;

    for (let row = 0; row < rows.length; row += 1) {
      const cell = rows[row]?.[col];

      if (cell) {
        owner = row;
        covered = (cell.rowSpan ?? 1) - 1;
      } else if (covered > 0) {
        covered -= 1;
      } else {
        owner = -1;
      }

      const target = owners[row];

      if (target) target[col] = owner;
    }
  }

  return owners;
}

/// Пустая ячейка и ячейка, которой нет вовсе, — одно и то же: значения нет.
function cellValue(owners: number[][], row: number, col: number): string | null {
  const owner = owners[row]?.[col] ?? -1;

  if (owner < 0) return null;

  const value = surveyRows[owner]?.[col]?.v.trim() ?? '';

  return value === '' ? null : value;
}

/// «---» в Ктт и Ктн значит, что трансформатора нет вовсе, а не что коэффициент
/// неизвестен: строку Tt/Tn для такой ТИ заводить не надо.
function ratio(value: string | null): string | null {
  return value === '---' ? null : value;
}

/// Колонка «требуется замена ПУ (да/нет)» читается наоборот: «да» значит, что
/// счётчик требованиям не отвечает. Свободного текста в ней хватает — «вроде
/// соотв-т орэм», «в арм ку нет, но...» — однозначного ответа он не даёт, и
/// тогда остаётся null. Сам текст в базу не попадает: поля под него нет.
function isCompliant(value: string | null): boolean | null {
  if (value === null) return null;

  const text = value.toLowerCase().trimStart();

  if (text.startsWith('да')) return false;
  if (text.startsWith('нет')) return true;

  return null;
}

/// Заводит по строке общего текста на каждую группу ТИ, которую опрос объединил
/// в одну ячейку. Возвращает id по индексу строки-владельца.
async function createShared(
  owners: number[][],
  col: number,
  create: (description: string) => Promise<{ id: string }>,
): Promise<Map<number, string>> {
  const byOwner = new Map<number, string>();
  const ownerRows = new Set(
    owners.map((row) => row[col] ?? -1).filter((owner) => owner >= 0),
  );

  for (const owner of ownerRows) {
    const description = cellValue(owners, owner, col);

    if (description === null) continue;

    const { id } = await create(description);

    byOwner.set(owner, id);
  }

  return byOwner;
}

/// Переносит опрос в базу целиком: ТИ проекта пересоздаются, поэтому seed можно
/// гонять сколько угодно раз. Счётчики, ТТ и ТН уходят каскадом вместе с ТИ, а
/// общий текст (опрос и примечания) на ТИ не завязан — его убираем руками.
export async function seedTis(
  prisma: PrismaClient,
  projectId: string,
): Promise<number> {
  const previous = await prisma.ti.findMany({
    where: { projectId },
    select: { sidePollingId: true, tisNotesId: true },
  });

  await prisma.ti.deleteMany({ where: { projectId } });

  const pollingIds = previous
    .map((ti) => ti.sidePollingId)
    .filter((id): id is string => id !== null);
  const notesIds = previous
    .map((ti) => ti.tisNotesId)
    .filter((id): id is string => id !== null);

  if (pollingIds.length > 0) {
    await prisma.sidePolling.deleteMany({ where: { id: { in: pollingIds } } });
  }

  if (notesIds.length > 0) {
    await prisma.tisNotes.deleteMany({ where: { id: { in: notesIds } } });
  }

  const owners = resolveOwners(surveyRows);
  const polling = await createShared(owners, COL.polling, (description) =>
    prisma.sidePolling.create({ data: { description }, select: { id: true } }),
  );
  const notes = await createShared(owners, COL.notes, (description) =>
    prisma.tisNotes.create({ data: { description }, select: { id: true } }),
  );

  let created = 0;

  for (const [position] of surveyRows.entries()) {
    const number = cellValue(owners, position, COL.number);

    /// Без номера ТИ строка опроса — не ТИ, а подпись или разделитель.
    if (number === null) continue;

    const meterType = cellValue(owners, position, COL.meterType);
    const meterNumber = cellValue(owners, position, COL.meterNumber);
    const ttRatio = ratio(cellValue(owners, position, COL.ttRatio));
    const tnRatio = ratio(cellValue(owners, position, COL.tnRatio));
    const hasMeter = meterType !== null || meterNumber !== null;

    await prisma.ti.create({
      data: {
        projectId,
        number,
        name: cellValue(owners, position, COL.name) ?? '',
        position,
        sidePollingId: polling.get(owners[position]?.[COL.polling] ?? -1),
        tisNotesId: notes.get(owners[position]?.[COL.notes] ?? -1),
        /// В опросе одна колонка на счётчик — это тот, что стоит сейчас.
        /// Какой ставим взамен, опрос не говорит, и строки new здесь нет.
        meters: hasMeter
          ? {
              create: [
                {
                  state: EquipmentState.current,
                  type: meterType,
                  number: meterNumber,
                  isCompliant: isCompliant(
                    cellValue(owners, position, COL.replacement),
                  ),
                },
              ],
            }
          : undefined,
        tt: ttRatio === null ? undefined : { create: { ratio: ttRatio } },
        tn: tnRatio === null ? undefined : { create: { ratio: tnRatio } },
      },
    });

    created += 1;
  }

  return created;
}
