import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';
import {
  EquipmentState,
  ModemKind,
  VoltageClass,
  WiringScheme,
} from '../../src/generated/prisma/enums';

/// Опрос ПЭМЗ в базу: ТИ проекта «ПЭМЗ» пересоздаются из
/// prisma/seeds/data/pemz-survey.json — его готовит scripts/extract_pemz_survey.py
/// из docs/excel_examples/АИИС ПЭМЗ.xlsx. Гонять можно сколько угодно раз.
///
/// Запуск: npm run db:seed:pemz

const PROJECT_NAME = 'ПЭМЗ';

/// Форма prisma/seeds/data/pemz-survey.json. Ячейки — текст как в книге, без
/// разбора; пустая ячейка — null.
type Survey = {
  header: (string | null)[];
  merges: string[];
  rows: { row: number; cells: (string | null)[] }[];
};

/// Колонки опроса — индексы в cells. «Место установки» (C) не переносим:
/// поля под него в схеме нет.
const COL = {
  number: 0,
  name: 1,
  uNom: 3,
  meterType: 4,
  meterNumber: 5,
  tt: 6,
  tn: 7,
  wiring: 8,
  replacement: 9,
  polling: 10,
  freeRs485: 11,
  solution: 12,
} as const;

/// Ошибка с адресом ячейки: разбор не угадывает, а останавливается — иначе
/// опечатка в опросе тихо превратилась бы в пустое поле.
function fail(row: number, col: number, message: string): never {
  const letter = String.fromCharCode('A'.charCodeAt(0) + col);

  throw new Error(`${letter}${row}: ${message}`);
}

/// Класс напряжения пишут числом, и с точкой, и с запятой: «0.4», «0,4», «10».
const voltageClasses: Record<string, VoltageClass> = {
  '0.2': VoltageClass.kv0_2,
  '0.4': VoltageClass.kv0_4,
  '6': VoltageClass.kv6,
  '10': VoltageClass.kv10,
  '35': VoltageClass.kv35,
  '110': VoltageClass.kv110,
  '220': VoltageClass.kv220,
  '330': VoltageClass.kv330,
  '750': VoltageClass.kv750,
};

function uNom(value: string | null, row: number): VoltageClass | null {
  if (value === null) return null;

  const voltage = voltageClasses[value.replace(',', '.')];

  return (
    voltage ?? fail(row, COL.uNom, `неизвестный класс напряжения «${value}»`)
  );
}

/// «прямого», «полукос.», «косв.» — по началу слова. «полукос» проверяем раньше
/// «кос»: иначе полукосвенное включение читалось бы как косвенное.
function wiring(value: string | null, row: number): WiringScheme | null {
  if (value === null) return null;

  const text = value.toLowerCase();

  if (text.startsWith('прям')) return WiringScheme.direct;
  if (text.startsWith('полукос')) return WiringScheme.semiIndirect;
  if (text.startsWith('кос')) return WiringScheme.indirect;

  return fail(row, COL.wiring, `неизвестная схема включения «${value}»`);
}

function yesNo(value: string | null, row: number, col: number): boolean | null {
  if (value === null) return null;

  const text = value.toLowerCase();

  if (text.startsWith('да')) return true;
  if (text.startsWith('нет') || text.startsWith('не ')) return false;

  return fail(row, col, `ожидалось «да» или «нет», а не «${value}»`);
}

/// «---» в ТТ и ТН значит, что трансформатора нет вовсе: строку Tt/Tn не
/// заводим.
function ratio(value: string | null): string | null {
  return value === '---' ? null : value;
}

/// «да, по встр. модему» / «да, по внеш. Модему»: через какой модем
/// опрашивается точка. Модем без вида в опросе не бывает — тогда модема нет.
/// Сам текст ложится в Ti.existingPolling как есть.
function polling(value: string | null): { modem: ModemKind | null } {
  if (value === null) return { modem: null };

  const text = value.toLowerCase();
  const modem = text.includes('встр')
    ? ModemKind.builtIn
    : text.includes('внеш')
      ? ModemKind.external
      : null;

  return { modem };
}

/// Строка, которая держит значение объединённой ячейки: для «M2:M3» строки 2 и
/// 3 смотрят на строку 2. Для необъединённых — сама строка.
function mergeOwners(merges: string[], col: number): Map<number, number> {
  const owners = new Map<number, number>();
  const letter = String.fromCharCode('A'.charCodeAt(0) + col);

  for (const range of merges) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);

    if (!match || match[1] !== letter || match[3] !== letter) continue;

    const first = Number(match[2]);
    const last = Number(match[4]);

    for (let row = first; row <= last; row += 1) owners.set(row, first);
  }

  return owners;
}

/// ТИ одной группы делят тех. решение и модем. Группу задаёт объединённая
/// ячейка «тех. решение»; ТИ без решения, но со своим модемом, получает
/// группу на себя одну — модем без группы не хранится.
type Group = {
  solution: string | null;
  modem: ModemKind | null;
  rows: number[];
};

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const file = join(import.meta.dirname, 'data', 'pemz-survey.json');
    const survey: Survey = JSON.parse(readFileSync(file, 'utf-8'));

    const projects = await prisma.project.findMany({
      where: { name: PROJECT_NAME },
      select: { id: true },
    });

    if (projects.length !== 1) {
      throw new Error(
        `проектов с названием «${PROJECT_NAME}» ${projects.length}, нужен ровно один`,
      );
    }

    const projectId = projects[0]!.id;
    const solutionOwners = mergeOwners(survey.merges, COL.solution);
    const cellsByRow = new Map(survey.rows.map((row) => [row.row, row.cells]));
    const groups = new Map<string, Group>();
    const groupKeyByRow = new Map<number, string>();

    for (const { row, cells } of survey.rows) {
      const solutionRow = solutionOwners.get(row) ?? row;
      const solution = cellsByRow.get(solutionRow)?.[COL.solution] ?? null;
      const { modem } = polling(cells[COL.polling] ?? null);

      /// Без номера ТИ строка опроса — не ТИ, группа ей не нужна. Остальным
      /// группа нужна всем: ТИ без решения и модема — в своей собственной.
      if ((cells[COL.number] ?? null) === null) continue;

      const key = solution === null ? `row:${row}` : `solution:${solutionRow}`;
      const group = groups.get(key) ?? { solution, modem: null, rows: [] };

      /// Модем у группы один. Если ТИ под одним решением опрашиваются через
      /// разные модемы, опрос не говорит, общий ли он, — пусть решит человек.
      if (modem !== null) {
        if (group.modem !== null && group.modem !== modem) {
          fail(
            row,
            COL.polling,
            'другой модем, чем у остальных ТИ этого решения',
          );
        }

        group.modem = modem;
      }

      group.rows.push(row);
      groups.set(key, group);
      groupKeyByRow.set(row, key);
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.ti.deleteMany({ where: { projectId } });
      await tx.tiGroup.deleteMany({ where: { projectId } });

      const groupIds = new Map<string, string>();

      for (const [key, group] of groups) {
        const { id } = await tx.tiGroup.create({
          data: {
            projectId,
            technicalSolution:
              group.solution === null
                ? undefined
                : { create: { description: group.solution } },
            /// Модем с SIM-картой — у каждой группы; вид, если он есть в
            /// опросе, иначе пустой.
            modem: {
              create: {
                kind: group.modem ?? undefined,
                simCard: { create: {} },
              },
            },
          },
          select: { id: true },
        });

        groupIds.set(key, id);
      }

      let count = 0;

      for (const [position, { row, cells }] of survey.rows.entries()) {
        const value = (col: number) => cells[col] ?? null;
        const number = value(COL.number);

        /// Без номера ТИ строка опроса — не ТИ, а подпись или разделитель.
        if (number === null) continue;

        const meterType = value(COL.meterType);
        const meterNumber = value(COL.meterNumber);
        const tt = ratio(value(COL.tt));
        const tn = ratio(value(COL.tn));
        const replacement = yesNo(value(COL.replacement), row, COL.replacement);
        const groupKey = groupKeyByRow.get(row);

        await tx.ti.create({
          data: {
            projectId,
            number,
            name: value(COL.name) ?? '',
            position,
            uNom: uNom(value(COL.uNom), row),
            wiring: wiring(value(COL.wiring), row),
            existingPolling: value(COL.polling),
            freeRs485: yesNo(value(COL.freeRs485), row, COL.freeRs485),
            groupId:
              groupKey === undefined ? undefined : groupIds.get(groupKey),
            /// В опросе одна колонка на счётчик — тот, что стоит сейчас.
            /// «Требуется замена» читается наоборот: «да» — не соответствует.
            meters:
              meterType !== null || meterNumber !== null
                ? {
                    create: {
                      state: EquipmentState.current,
                      type: meterType,
                      number: meterNumber,
                      isCompliant: replacement === null ? null : !replacement,
                    },
                  }
                : undefined,
            tt: tt === null ? undefined : { create: { ratio: tt } },
            tn: tn === null ? undefined : { create: { ratio: tn } },
          },
        });

        count += 1;
      }

      return count;
    });

    console.log(
      `seeded ${created} ТИ, ${groups.size} groups into project ${projectId} (${PROJECT_NAME})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
