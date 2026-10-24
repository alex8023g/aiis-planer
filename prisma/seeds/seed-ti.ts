import {
  surveyRows,
  type SurveyCell,
} from '../../src/app/projects/[id]/aiis2/survey-data';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { EquipmentState } from '../../src/generated/prisma/enums';
import { equipmentIds } from './seed-equipment';

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
function cellValue(
  owners: number[][],
  row: number,
  col: number,
): string | null {
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

/// Владелец ячейки с непустым значением, а иначе -1: пустая объединённая
/// ячейка ничего не делит, и ТИ под ней в одну группу не собираем.
function valueOwner(owners: number[][], row: number, col: number): number {
  return cellValue(owners, row, col) === null ? -1 : (owners[row]?.[col] ?? -1);
}

/// Демо-спецификация первой группы опроса — раздел «ОРУ-110» из спецификации
/// МЛЗ, чтобы на странице группы ТИ было что показать. В опросе спецификации
/// нет: её составляют позже. Вид и марка — из справочника (seed-equipment.ts).
const DEMO_SPECIFICATION: {
  kind: string;
  model: string | null;
  quantity: number | null;
  note?: string;
}[] = [
  {
    kind: 'Шкаф связи',
    model: 'ЩМП 02 IP54 250х300х155мм',
    quantity: 1,
    note: 'если интерфейсные кабели не заведены в шкаф в ЗРУ-10',
  },
  { kind: 'Разветвитель RS-485', model: 'R110-R4', quantity: 1 },
  { kind: 'Блок питания', model: 'MDR-20-12', quantity: 1 },
  { kind: 'GPRS терминал', model: 'iRZ ATM42.A', quantity: 1 },
  { kind: 'Антенна', model: 'ЛИДЕР-М 700-2700 МГц', quantity: 1 },
  { kind: 'Автомат 2х полюсный', model: 'DEKraft 2Р С6А', quantity: 1 },
  { kind: 'DIN-рейка', model: '07-03-009 7,5х35х250мм', quantity: 1 },
  { kind: 'Кабель питания', model: 'ВВГнг 2х1.5', quantity: 5 },
  { kind: 'Интерфейсный кабель', model: 'F/UTP 2x2x0,52 мм', quantity: 5 },
  {
    kind: 'Кабель заземления',
    model: 'ПуГВнг(А)LS желто-зеленый 1х4',
    quantity: 5,
  },
  /// Без кол-ва, как в книге: итог проекта покажет его неполным.
  { kind: 'Кабель для вторичных цепей', model: null, quantity: null },
];

/// Общие позиции проекта — без группы, как в книге МЛЗ.
const PROJECT_SPECIFICATION: typeof DEMO_SPECIFICATION = [
  {
    kind: 'Расходные материалы',
    model: 'саморезы, клипсы, стяжки, хомуты и т.д.',
    quantity: 12,
  },
];

async function seedSpecification(
  prisma: PrismaClient,
  projectId: string,
  groupId: string | null,
  items: typeof DEMO_SPECIFICATION,
): Promise<void> {
  for (const [position, item] of items.entries()) {
    await prisma.specificationItem.create({
      data: {
        projectId,
        groupId,
        ...(await equipmentIds(prisma, item.kind, item.model)),
        quantity: item.quantity,
        note: item.note ?? null,
        position,
      },
    });
  }
}

/// Переносит опрос в базу целиком: ТИ проекта пересоздаются, поэтому seed можно
/// гонять сколько угодно раз. Счётчики, ТТ и ТН уходят каскадом вместе с ТИ, а
/// общий текст (опрос и примечания) — вместе с группами ТИ.
export async function seedTis(
  prisma: PrismaClient,
  projectId: string,
): Promise<number> {
  await prisma.ti.deleteMany({ where: { projectId } });
  await prisma.tiGroup.deleteMany({ where: { projectId } });
  /// Позиции групп ушли с группами каскадом, общие на проект — нет.
  await prisma.specificationItem.deleteMany({ where: { projectId } });
  await seedSpecification(prisma, projectId, null, PROJECT_SPECIFICATION);

  const owners = resolveOwners(surveyRows);
  /// Группа — сочетание ячеек опроса и примечания, которые ТИ делят. Опрос
  /// объединяет эти колонки независимо, и если объединения разошлись, одно и
  /// то же примечание попадёт в несколько групп — у каждой своя копия.
  const groups = new Map<string, string>();

  async function groupFor(position: number): Promise<string> {
    const pollingOwner = valueOwner(owners, position, COL.polling);
    const notesOwner = valueOwner(owners, position, COL.notes);
    /// Группа есть у каждой ТИ: ТИ без общего с другими текста — в своей
    /// собственной.
    const key =
      pollingOwner < 0 && notesOwner < 0
        ? `own:${position}`
        : `${pollingOwner}:${notesOwner}`;
    const existing = groups.get(key);

    if (existing) return existing;

    const polling = cellValue(owners, position, COL.polling);
    const notes = cellValue(owners, position, COL.notes);
    const { id } = await prisma.tiGroup.create({
      data: {
        projectId,
        sidePolling:
          polling === null ? undefined : { create: { description: polling } },
        notes: notes === null ? undefined : { create: { description: notes } },
        /// Модем с SIM-картой заводится с каждой группой — пустым.
        modem: { create: { simCard: { create: {} } } },
      },
      select: { id: true },
    });

    if (groups.size === 0) {
      await seedSpecification(prisma, projectId, id, DEMO_SPECIFICATION);
    }

    groups.set(key, id);

    return id;
  }

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
        groupId: await groupFor(position),
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
