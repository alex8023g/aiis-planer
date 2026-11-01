'use server';

import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

import { refresh } from 'next/cache';

import type { Prisma } from '@/generated/prisma/client';
import { Channel, EquipmentState, ModemKind } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { getProject, requireProjectEditor } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getMeterDictionaryChecker } from '@/lib/siDictionaryMatch';
import { syncMeterSpecification } from '@/lib/specification';
import {
  BUILT_IN_MODEM,
  NO_PROPOSED_METER,
  invalidValueError,
  modemImeiText,
  parseTiStatus,
  parseVoltageClass,
  parseWiringScheme,
  parseYesNo,
} from '@/lib/survey-ti';
import type { ActionResult } from '@/lib/types';

import {
  isMerkuriyMeterType,
  parseConnection,
  readMeterNumber,
  type MeterNumberReading,
} from './meter-reader';
import { readMeterNumberMerkuriy } from './meter-reader-merkuriy';

/// Больше разом не добавляем: опечатка в поле («100» вместо «10») иначе
/// вывалила бы в таблицу сотню пустых строк.
const MAX_ADD = 50;

/// Номер ТИ — строка («3а» тоже номер), поэтому следующий считаем по ведущим
/// цифрам: после «3а» и «7» идёт «8». ТИ без цифр в номере не считаются.
function nextNumber(numbers: string[]): number {
  const values = numbers
    .map((number) => Number.parseInt(number, 10))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) + 1 : 1;
}

/// Модем — пустая заготовка: ни вида, ни типа, ни IMEI, ни порта, канал по
/// умолчанию, и SIM-карта (если есть) тоже пустая.
function isBlankModem(modem: {
  kind: unknown;
  type: string | null;
  imei: string | null;
  port: string | null;
  channel: Channel;
  simCard: {
    number: string | null;
    ip: string | null;
    provider: string | null;
  } | null;
}): boolean {
  const sim = modem.simCard;

  return (
    modem.kind === null &&
    modem.type === null &&
    modem.imei === null &&
    modem.port === null &&
    modem.channel === Channel.gprs &&
    (sim === null ||
      (sim.number === null && sim.ip === null && sim.provider === null))
  );
}

/// Записать ячейку «IMEI модема» группы. IMEI — привязать свободный модем
/// проекта (без группы) с этим IMEI; BUILT_IN_MODEM — модем встроенный в
/// счётчик; null — отвязать модем группы. Вернёт текст ошибки или null.
///
/// Прежний модем группы, если он уходит, — пустая заготовка удаляется,
/// заполненный становится свободным: его можно привязать к другой группе.
/// Встроенным становится сам модем группы, пока у него нет IMEI: IP его
/// SIM-карты остаётся. С IMEI — это определённый внешний модем: он уходит в
/// свободные, а группе заводится новый встроенный с пустой SIM-картой.
async function attachModem(
  tx: Prisma.TransactionClient,
  projectId: string,
  groupId: string,
  value: string | null,
): Promise<string | null> {
  const current = await tx.modem.findUnique({
    where: { groupId },
    select: {
      id: true,
      kind: true,
      type: true,
      imei: true,
      port: true,
      channel: true,
      simCard: { select: { number: true, ip: true, provider: true } },
    },
  });

  /// В ячейке уже это значение — менять нечего. Так же и у остальных ТИ
  /// группы, когда значение вставили в несколько её строк.
  if (modemImeiText(current) === (value ?? '')) return null;

  if (value === BUILT_IN_MODEM && current && current.imei === null) {
    await tx.modem.update({
      where: { id: current.id },
      data: { kind: ModemKind.builtIn },
    });

    return null;
  }

  const next =
    value === null || value === BUILT_IN_MODEM
      ? null
      : await tx.modem.findFirst({
          where: { projectId, groupId: null, imei: value },
          select: { id: true },
        });

  if (value !== null && value !== BUILT_IN_MODEM && !next) {
    return `Свободного модема с IMEI «${value}» в проекте нет`;
  }

  if (current) {
    if (isBlankModem(current)) {
      await tx.modem.delete({ where: { id: current.id } });
    } else {
      await tx.modem.update({
        where: { id: current.id },
        data: { groupId: null },
      });
    }
  }

  if (next) {
    await tx.modem.update({ where: { id: next.id }, data: { groupId } });
  } else if (value === BUILT_IN_MODEM) {
    await tx.modem.create({
      data: {
        projectId,
        groupId,
        kind: ModemKind.builtIn,
        simCard: { create: {} },
      },
    });
  }

  return null;
}

/// Колонки таблицы опроса, которые можно править.
export type SurveyField =
  | 'number'
  | 'name'
  | 'status'
  | 'ip'
  | 'modemImei'
  | 'port'
  | 'connectAddress'
  | 'technicalSolution'
  | 'meterType'
  | 'uNom'
  | 'wiring'
  | 'needsReplacement'
  | 'existingPolling'
  | 'freeRs485'
  | 'proposedMeterType';

export type SurveyEdit = {
  tiId: string;
  field: SurveyField;
  value: string;
};

const FIELDS = new Set<string>([
  'number',
  'name',
  'status',
  'ip',
  'modemImei',
  'port',
  'connectAddress',
  'technicalSolution',
  'meterType',
  'uNom',
  'wiring',
  'needsReplacement',
  'existingPolling',
  'freeRs485',
  'proposedMeterType',
]);

/// Больше разом не пишем: вставка целой простыни из буфера по ошибке иначе
/// переписала бы всю таблицу одним запросом.
const MAX_EDITS = 2000;
/// Записать правки ячеек таблицы опроса — одну (правка ячейки) или пачку
/// (вставка из буфера). Каждое поле живёт в своей таблице:
/// наименование — в Ti, адрес — в счётчике, что стоит сейчас (заводится при
/// первой записи), Uном, схема, существующий опрос и RS-485 — тоже в Ti,
/// порт — в модеме группы, IP — в SIM-карте модема группы,
/// тех. решение — в TechnicalSolution группы, тип ПУ и замена — в счётчиках
/// ТИ, что стоит сейчас и что ставим (заводятся при первой записи),
/// «требуется замена» — у того, что стоит. Модем и решение общие на группу,
/// поэтому правка у одной ТИ меняет их у всей группы.
/// IMEI модема выбирает модем группы из свободных модемов проекта или
/// делает его встроенным (см. attachModem).
///
/// Записанный тип ПУ сам решает «требуется замену», пока её не решили
/// (null): годится тип по справочнику СИ АТС — «нет», не годится или его там
/// нет — «да». Решённое уже не трогаем: его могли поставить руками.
export async function updateSurveyCells(
  projectId: string,
  edits: SurveyEdit[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (edits.length === 0) return { ok: true };

  if (edits.length > MAX_EDITS) {
    return { ok: false, error: `Не больше ${MAX_EDITS} ячеек за раз` };
  }

  if (edits.some((edit) => !FIELDS.has(edit.field))) {
    return { ok: false, error: 'Неизвестная колонка' };
  }

  /// Перечисления и да/нет: текст ячейки должен стать одним из значений,
  /// иначе вставка целиком не ложится.
  for (const { field, value } of edits) {
    const invalid = invalidValueError(field, value);

    if (invalid) return { ok: false, error: invalid };
  }

  const ids = [...new Set(edits.map((edit) => edit.tiId))];
  /// Справочник читается целиком (~3K строк) — только когда пишут тип ПУ.
  /// Пустой (ещё не загружали) ничего не решает: по нему не годился бы ни
  /// один счётчик.
  const checkMeter =
    edits.some((edit) => edit.field === 'meterType' && edit.value.trim()) &&
    (await prisma.atsMeterModification.count()) > 0
      ? await getMeterDictionaryChecker()
      : null;

  /// Одной транзакцией: вставка либо ложится целиком, либо не ложится вовсе
  /// — половина вставленного блока хуже, чем ничего.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      select: {
        id: true,
        name: true,
        group: { select: { id: true, modem: { select: { id: true } } } },
      },
    });

    /// Чужие или удалённые ТИ: страница могла устареть.
    if (tis.length !== ids.length) {
      return 'Часть ТИ не найдена — обновите страницу';
    }

    const byId = new Map(tis.map((ti) => [ti.id, ti]));
    /// Группы, где поменялся тип счётчика: их строки «Прибор учета» в
    /// спецификации пересчитываем (см. syncMeterSpecification).
    const meterGroups = new Set<string>();

    for (const { tiId, field, value } of edits) {
      const groupId = byId.get(tiId)!.group?.id;

      if (groupId && (field === 'meterType' || field === 'proposedMeterType')) {
        meterGroups.add(groupId);
      }

      const trimmed = value.trim();
      /// Пустое в необязательных полях — «не знаем», то есть null, а не ''.
      const nullable = trimmed === '' ? null : trimmed;

      if (field === 'number') {
        await tx.ti.update({ where: { id: tiId }, data: { number: trimmed } });
      } else if (field === 'name') {
        await tx.ti.update({ where: { id: tiId }, data: { name: trimmed } });
      } else if (field === 'port') {
        const ti = byId.get(tiId)!;
        const modemId = ti.group?.modem?.id;

        if (!modemId) {
          return `У ТИ «${ti.name || 'без названия'}» нет модема — порт хранить негде`;
        }

        await tx.modem.update({
          where: { id: modemId },
          data: { port: nullable },
        });
      } else if (field === 'connectAddress') {
        /// Адрес — у счётчика, что стоит сейчас: у нового он будет свой.
        const state = EquipmentState.current;

        await tx.meter.upsert({
          where: { tiId_state: { tiId, state } },
          create: { tiId, state, meterAddress: nullable },
          update: { meterAddress: nullable },
        });
      } else if (field === 'uNom') {
        /// Разбор уже проверен (invalidValueError) — undefined здесь нет.
        const uNom = parseVoltageClass(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { uNom } });
      } else if (field === 'status') {
        const status = parseTiStatus(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { status } });
      } else if (field === 'wiring') {
        const wiring = parseWiringScheme(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { wiring } });
      } else if (field === 'freeRs485') {
        const freeRs485 = parseYesNo(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { freeRs485 } });
      } else if (field === 'needsReplacement') {
        /// «Требуется замена» — у счётчика, что стоит сейчас; пустое — «не
        /// решили», null.
        const needsReplacement = parseYesNo(value)!;
        const state = EquipmentState.current;

        await tx.meter.upsert({
          where: { tiId_state: { tiId, state } },
          create: { tiId, state, needsReplacement },
          update: { needsReplacement },
        });
      } else if (field === 'existingPolling') {
        await tx.ti.update({
          where: { id: tiId },
          data: { existingPolling: nullable },
        });
      } else if (
        field === 'proposedMeterType' &&
        (nullable === null || nullable === NO_PROPOSED_METER)
      ) {
        /// Пустая замена — менять счётчик не будем: новый счётчик удаляем.
        await tx.meter.deleteMany({
          where: { tiId, state: EquipmentState.proposed },
        });
      } else if (field === 'meterType' || field === 'proposedMeterType') {
        /// Тип ПУ — у счётчика, что стоит сейчас, замена — у того, что
        /// ставим. Пустой тип ПУ — null, а сам счётчик остаётся: у него есть
        /// и другие поля (номер, соответствие требованиям).
        const state =
          field === 'meterType'
            ? EquipmentState.current
            : EquipmentState.proposed;

        const meter = await tx.meter.upsert({
          where: { tiId_state: { tiId, state } },
          create: { tiId, state, type: nullable },
          update: { type: nullable },
          select: { needsReplacement: true },
        });

        if (
          field === 'meterType' &&
          nullable !== null &&
          meter.needsReplacement === null &&
          checkMeter
        ) {
          await tx.meter.update({
            where: { tiId_state: { tiId, state } },
            data: { needsReplacement: !checkMeter(nullable).ok },
          });
        }
      } else if (field === 'modemImei') {
        const ti = byId.get(tiId)!;
        const groupId = ti.group?.id;

        if (!groupId) {
          return `У ТИ «${ti.name || 'без названия'}» нет группы — модем привязать некуда`;
        }

        const error = await attachModem(tx, projectId, groupId, nullable);

        if (error) return error;
      } else if (field === 'technicalSolution') {
        const ti = byId.get(tiId)!;
        const groupId = ti.group?.id;

        if (!groupId) {
          return `У ТИ «${ti.name || 'без названия'}» нет группы — тех. решение хранить негде`;
        }

        /// Описание обязательное: пустое решение — нет решения, строку
        /// удаляем.
        if (nullable === null) {
          await tx.technicalSolution.deleteMany({ where: { groupId } });
        } else {
          await tx.technicalSolution.upsert({
            where: { groupId },
            create: { groupId, description: nullable },
            update: { description: nullable },
          });
        }
      } else {
        const ti = byId.get(tiId)!;
        const modemId = ti.group?.modem?.id;

        if (!modemId) {
          return `У ТИ «${ti.name || 'без названия'}» нет модема — IP хранить негде`;
        }

        await tx.simCard.upsert({
          where: { modemId },
          create: { modemId, ip: nullable },
          update: { ip: nullable },
        });
      }
    }

    await syncMeterSpecification(tx, projectId, meterGroups);

    return null;
  });

  if (error) return { ok: false, error };

  /// Страница динамическая (force-dynamic) — перерисовать её достаточно.
  refresh();

  return { ok: true };
}

/// Добавить count пустых ТИ в конец таблицы опроса. Номера идут подряд за
/// последним, наименование пустое — его заполняют уже в таблице. Каждая ТИ
/// получает свою группу с пустыми модемом и SIM-картой.
export async function addTis(
  projectId: string,
  count: number,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (!Number.isInteger(count) || count < 1 || count > MAX_ADD) {
    return { ok: false, error: `Можно добавить от 1 до ${MAX_ADD} ТИ` };
  }

  const existing = await prisma.ti.findMany({
    where: { projectId },
    select: { number: true, position: true },
  });
  const firstNumber = nextNumber(existing.map((ti) => ti.number));
  /// Порядок сквозной по проекту: новые встают после последней ТИ.
  const firstPosition =
    existing.reduce((max, ti) => Math.max(max, ti.position), -1) + 1;

  /// Каждая ТИ — со своей группой, а у группы пустые модем и SIM-карта: IP
  /// можно вписать сразу. createMany вложенных записей не умеет — поэтому по
  /// одной, но одной транзакцией.
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < count; index++) {
      await tx.ti.create({
        data: {
          /// Связью, а не projectId: вместе с вложенным созданием группы
          /// Prisma принимает только связи.
          project: { connect: { id: projectId } },
          number: String(firstNumber + index),
          name: '',
          position: firstPosition + index,
          group: {
            create: {
              project: { connect: { id: projectId } },
              modem: {
                create: {
                  project: { connect: { id: projectId } },
                  simCard: { create: {} },
                },
              },
            },
          },
        },
      });
    }
  });

  /// Страница динамическая (force-dynamic), кэша под ней нет — достаточно
  /// перерисовать её, чтобы новые ТИ появились в таблице.
  refresh();

  return { ok: true };
}

/// Объединить ТИ в одну группу — как объединение ячеек «тех. решения» в
/// Excel: остаётся значение верхней. Группой становится группа первой ТИ (по
/// порядку в таблице), а нет её — заводится новая. Общее (решение, модем,
/// УСПД, текст опроса, примечание) у неё своё; чего у неё нет, берётся у
/// остальных групп сверху вниз. Группы, от которых не осталось ни одной ТИ,
/// удаляются вместе со всем, что у них не забрали.
export async function mergeTiGroups(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length < 2) {
    return { ok: false, error: 'Выделите хотя бы две ячейки' };
  }

  /// Одной транзакцией: иначе при сбое ТИ остались бы разбросаны между
  /// старыми и новой группой, а общее — висеть на пустых группах.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { groupId: true },
    });

    /// Чужие или удалённые ТИ: страница могла устареть.
    if (tis.length !== ids.length) {
      return 'Часть ТИ не найдена — обновите страницу';
    }

    const targetId =
      tis[0].groupId ??
      (
        await tx.tiGroup.create({
          data: {
            projectId,
            modem: { create: { projectId, simCard: { create: {} } } },
          },
          select: { id: true },
        })
      ).id;
    const sourceIds = [
      ...new Set(
        tis
          .map((ti) => ti.groupId)
          .filter((id): id is string => id !== null && id !== targetId),
      ),
    ];

    await tx.ti.updateMany({
      where: { id: { in: ids } },
      data: { groupId: targetId },
    });

    /// Счётчики ТИ пришли в группу вместе с ТИ — и в её спецификацию.
    await syncMeterSpecification(tx, projectId, [targetId]);

    if (sourceIds.length === 0) return null;

    const shared = {
      uspd: { select: { id: true } },
      modem: {
        select: {
          id: true,
          kind: true,
          type: true,
          imei: true,
          port: true,
          channel: true,
          simCard: { select: { number: true, ip: true, provider: true } },
        },
      },
      technicalSolution: { select: { id: true } },
      sidePolling: { select: { id: true } },
      notes: { select: { id: true } },
    } as const;
    const target = await tx.tiGroup.findUniqueOrThrow({
      where: { id: targetId },
      select: shared,
    });
    /// Забираем общее только у групп, которые опустели: у остальных есть ещё
    /// ТИ вне выделения, и общее им самим нужно.
    const emptied = await tx.tiGroup.findMany({
      where: { id: { in: sourceIds }, projectId, tis: { none: {} } },
      select: { id: true, ...shared },
    });
    /// Порядок групп — как в таблице, сверху вниз.
    emptied.sort((a, b) => sourceIds.indexOf(a.id) - sourceIds.indexOf(b.id));

    const adopt = {
      uspd: (id: string) =>
        tx.uspd.update({ where: { id }, data: { groupId: targetId } }),
      modem: (id: string) =>
        tx.modem.update({ where: { id }, data: { groupId: targetId } }),
      technicalSolution: (id: string) =>
        tx.technicalSolution.update({
          where: { id },
          data: { groupId: targetId },
        }),
      sidePolling: (id: string) =>
        tx.sidePolling.update({ where: { id }, data: { groupId: targetId } }),
      notes: (id: string) =>
        tx.tisNotes.update({ where: { id }, data: { groupId: targetId } }),
    };

    for (const kind of Object.keys(adopt) as (keyof typeof adopt)[]) {
      /// Пустой модем — заготовка, заведённая с группой: он уступает
      /// заполненному модему опустевшей группы, иначе тот ушёл бы вместе с
      /// ней. Модем у группы один (@unique groupId), поэтому пустой убираем.
      if (kind === 'modem' && target.modem && isBlankModem(target.modem)) {
        const donor = emptied.find(
          (group) => group.modem && !isBlankModem(group.modem),
        )?.modem;

        if (donor) {
          await tx.modem.delete({ where: { id: target.modem.id } });
          await adopt.modem(donor.id);
        }

        continue;
      }

      if (target[kind]) continue;

      const donor = emptied.find((group) => group[kind] !== null)?.[kind];

      if (donor) await adopt[kind](donor.id);
    }

    /// Что осталось на опустевших группах, уходит с ними каскадом.
    await tx.tiGroup.deleteMany({
      where: { id: { in: emptied.map((group) => group.id) } },
    });

    return null;
  });

  if (error) return { ok: false, error };

  refresh();

  return { ok: true };
}

/// Разъединить объединённую ячейку «тех. решения» — как в Excel: значение
/// остаётся в верхней. Верхняя ТИ (по порядку в таблице) остаётся в группе
/// со всем общим — решением, модемом, УСПД, текстом опроса, примечанием, —
/// остальные из группы выходят, и каждая получает свою новую группу с пустым
/// модемом и SIM-картой: как и при создании группы, IP есть куда вписать
/// сразу. Ничего не удаляется.
export async function splitTiGroup(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length < 2) {
    return { ok: false, error: 'Выделите объединённую ячейку' };
  }

  const tis = await prisma.ti.findMany({
    where: { id: { in: ids }, projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, groupId: true },
  });

  /// Чужие или удалённые ТИ: страница могла устареть.
  if (tis.length !== ids.length) {
    return { ok: false, error: 'Часть ТИ не найдена — обновите страницу' };
  }

  /// Разъединяем ровно одну ячейку: все ТИ должны быть из одной группы. Иначе
  /// таблица показывала устаревшее — и непонятно, какую группу трогать.
  const groupId = tis[0].groupId;

  if (groupId === null || tis.some((ti) => ti.groupId !== groupId)) {
    return {
      ok: false,
      error: 'Ячейка уже не объединена — обновите страницу',
    };
  }

  /// Одной транзакцией: при сбое часть ТИ осталась бы в старой группе, а
  /// часть — в новых.
  await prisma.$transaction(async (tx) => {
    const groupIds = [groupId];

    for (const ti of tis.slice(1)) {
      const group = await tx.tiGroup.create({
        data: {
          projectId,
          tis: { connect: { id: ti.id } },
          modem: { create: { projectId, simCard: { create: {} } } },
        },
        select: { id: true },
      });

      groupIds.push(group.id);
    }

    /// Счётчики ушедших ТИ уходят из спецификации группы в их новые группы.
    await syncMeterSpecification(tx, projectId, groupIds);
  });

  refresh();

  return { ok: true };
}

/// Удалить ТИ со всем её оборудованием (счётчики, ТТ, ТН, подключение уходят
/// каскадом). Группа, от которой не осталось ни одной ТИ, удаляется вместе со
/// всем общим: иначе она висела бы пустой до удаления проекта.
export async function deleteTis(
  projectId: string,
  tiIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ids = [...new Set(tiIds)];

  if (ids.length === 0) return { ok: true };

  /// Одной транзакцией: удаляются либо все выделенные ТИ, либо ни одной, и
  /// при сбое группа не останется без ТИ.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      select: { groupId: true },
    });

    /// Чужая или уже удалённая ТИ: страница могла устареть.
    if (tis.length !== ids.length) return 'ТИ не найдена — обновите страницу';

    await tx.ti.deleteMany({ where: { id: { in: ids } } });

    /// Группы, от которых не осталось ни одной ТИ.
    const groupIds = [...new Set(tis.flatMap(({ groupId }) => groupId ?? []))];

    if (groupIds.length > 0) {
      await tx.tiGroup.deleteMany({
        where: { id: { in: groupIds }, projectId, tis: { none: {} } },
      });
    }

    /// Счётчики удалённых ТИ — из спецификации оставшихся групп.
    await syncMeterSpecification(tx, projectId, groupIds);

    return null;
  });

  if (error) return { ok: false, error };

  refresh();

  return { ok: true };
}

/// Тип и номер счётчика из диалога «замена сч.». null — поле не трогаем.
type MeterFields = { type: string | null; number: string | null };

/// Заменить счётчик ТИ: текущий уходит в снятые (state = removed), новый
/// (proposed) становится текущим. Сначала дописываем пустые тип и номер из
/// диалога — записанное не перезаписываем, его правят в ячейках таблицы.
/// Снятый хранится один (@@unique в Meter): прежний снятый удаляем.
export async function replaceMeter(
  projectId: string,
  tiId: string,
  meters: { current: MeterFields; proposed: MeterFields },
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const fields = (meter: MeterFields) => ({
    type: meter.type?.trim() || null,
    number: meter.number?.trim() || null,
  });
  const current = fields(meters.current);
  const proposed = fields(meters.proposed);

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      groupId: true,
      meters: {
        where: {
          state: { in: [EquipmentState.current, EquipmentState.proposed] },
        },
        select: { state: true, type: true, number: true },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const existingCurrent = ti.meters.find(
    (meter) => meter.state === EquipmentState.current,
  );
  const existingProposed = ti.meters.find(
    (meter) => meter.state === EquipmentState.proposed,
  );

  /// Страница могла устареть: поле, которое на ней было пустым, уже
  /// заполнили.
  const filled = (
    meter: { type: string | null; number: string | null },
    existing: { type: string | null; number: string | null } | undefined,
  ) => (meter.type && existing?.type) || (meter.number && existing?.number);

  if (filled(current, existingCurrent) || filled(proposed, existingProposed)) {
    return { ok: false, error: 'Счётчик уже заполнен — обновите страницу' };
  }

  /// Ставить без типа нечего.
  const proposedType = existingProposed?.type ?? proposed.type;

  if (!proposedType) {
    return { ok: false, error: 'Укажите тип нового счётчика' };
  }

  /// Требуется ли замена новому текущему — по справочнику АТС, как и при
  /// правке типа в таблице.
  const needsReplacement = !(await getMeterDictionaryChecker())(proposedType)
    .ok;
  const today = new Date();

  await prisma.$transaction(async (tx) => {
    const data = (meter: { type: string | null; number: string | null }) => ({
      ...(meter.type && { type: meter.type }),
      ...(meter.number && { number: meter.number }),
    });

    await tx.meter.deleteMany({
      where: { tiId, state: EquipmentState.removed },
    });

    if (existingCurrent) {
      await tx.meter.update({
        where: { tiId_state: { tiId, state: EquipmentState.current } },
        data: {
          ...data(current),
          state: EquipmentState.removed,
          dateRemoved: today,
        },
      });
    } else if (current.type || current.number) {
      await tx.meter.create({
        data: {
          tiId,
          ...data(current),
          state: EquipmentState.removed,
          dateRemoved: today,
        },
      });
    }

    const installed = {
      ...data(proposed),
      state: EquipmentState.current,
      needsReplacement,
      dateInstalled: today,
    };

    if (existingProposed) {
      await tx.meter.update({
        where: { tiId_state: { tiId, state: EquipmentState.proposed } },
        data: installed,
      });
    } else {
      await tx.meter.create({ data: { tiId, ...installed } });
    }

    /// Поставленный остаётся в спецификации, а заведённый тут новый — в неё
    /// попадает.
    if (ti.groupId) {
      await syncMeterSpecification(tx, projectId, [ti.groupId]);
    }
  });

  refresh();

  return { ok: true };
}

const execFileAsync = promisify(execFile);

/// Сколько ждать ответа на ping, секунд.
const PING_TIMEOUT = 2;

export type PingResult = { ok: true } | { ok: false; error: string };

/// Пингнуть IP модема ТИ — отвечает ли он вообще, до опроса счётчика. IP
/// берём из базы по id, как и connectMeter, и пускаем в ping только адрес:
/// в поле IP можно записать что угодно, и строка вида «-f» стала бы ключом.
export async function pingTi(
  projectId: string,
  tiId: string,
): Promise<PingResult> {
  const user = await requireUser();

  if (!(await getProject(projectId, user))) {
    return { ok: false, error: 'Проект не найден' };
  }

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      group: {
        select: {
          modem: { select: { simCard: { select: { ip: true } } } },
        },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const ip = ti.group?.modem?.simCard?.ip?.trim();

  if (!ip) return { ok: false, error: 'У ТИ не указан IP' };
  if (!isIP(ip)) return { ok: false, error: `«${ip}» — не IP-адрес` };

  /// Таймаут ответа у ping на macOS — в миллисекундах, на Linux — в секундах.
  const wait =
    process.platform === 'darwin'
      ? String(PING_TIMEOUT * 1000)
      : String(PING_TIMEOUT);

  try {
    await execFileAsync('ping', ['-c', '1', '-W', wait, ip], {
      timeout: (PING_TIMEOUT + 3) * 1000,
    });

    return { ok: true };
  } catch {
    return { ok: false, error: `${ip} не отвечает на ping` };
  }
}

/// Порт шлюза счётчика, если у ТИ свой не записан.
const DEFAULT_METER_PORT = '6001';

export type ConnectResult =
  | { ok: true; reading: MeterNumberReading; host: string; port: number }
  | { ok: false; error: string };

/// Опросить счётчик ТИ — то же, что meter-reader --meter-number: заводской
/// номер и дата выпуска. IP — SIM-карты модема группы, адрес — связной адрес
/// счётчика, порт — свой у ТИ или 6001. Значения берём из базы по id, а не из
/// браузера: иначе страница могла бы заставить сервер стучаться куда угодно.
/// Опрос ничего не меняет, поэтому хватает права видеть проект.
export async function connectMeter(
  projectId: string,
  tiId: string,
): Promise<ConnectResult> {
  const user = await requireUser();

  if (!(await getProject(projectId, user))) {
    return { ok: false, error: 'Проект не найден' };
  }

  const ti = await prisma.ti.findFirst({
    where: { id: tiId, projectId },
    select: {
      meters: {
        where: { state: EquipmentState.current },
        select: { type: true, meterAddress: true },
      },
      group: {
        select: {
          modem: {
            select: { port: true, simCard: { select: { ip: true } } },
          },
        },
      },
    },
  });

  if (!ti) return { ok: false, error: 'ТИ не найдена — обновите страницу' };

  const ip = ti.group?.modem?.simCard?.ip;
  const address = ti.meters[0]?.meterAddress;

  if (!ip) return { ok: false, error: 'У ТИ не указан IP' };
  if (!address) return { ok: false, error: 'У ТИ не указан адрес счётчика' };

  try {
    const config = parseConnection({
      ip,
      port: ti.group?.modem?.port || DEFAULT_METER_PORT,
      address,
      meterType: ti.meters[0]?.type,
    });
    const reading = isMerkuriyMeterType(config.meterType)
      ? await readMeterNumberMerkuriy(config)
      : await readMeterNumber(config);

    return { ok: true, reading, host: config.host, port: config.port };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
