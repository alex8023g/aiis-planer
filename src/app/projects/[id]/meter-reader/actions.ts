'use server';

import { refresh } from 'next/cache';

import { EquipmentState } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import {
  invalidValueError,
  parsePolling,
  parseVoltageClass,
  parseWiringScheme,
  parseYesNo,
} from '@/lib/survey-ti';
import type { ActionResult } from '@/lib/types';

/// Колонки таблицы MeterReader, которые можно править. Всё после
/// connectAddress — только у таблицы опроса (aiis4).
export type MeterReaderField =
  | 'name'
  | 'ip'
  | 'port'
  | 'connectAddress'
  | 'technicalSolution'
  | 'meterType'
  | 'uNom'
  | 'wiring'
  | 'needsReplacement'
  | 'isPolled'
  | 'freeRs485'
  | 'proposedMeterType';

export type MeterReaderEdit = {
  tiId: string;
  field: MeterReaderField;
  value: string;
};

const FIELDS = new Set<string>([
  'name',
  'ip',
  'port',
  'connectAddress',
  'technicalSolution',
  'meterType',
  'uNom',
  'wiring',
  'needsReplacement',
  'isPolled',
  'freeRs485',
  'proposedMeterType',
]);

/// Больше разом не пишем: вставка целой простыни из буфера по ошибке иначе
/// переписала бы всю таблицу одним запросом.
const MAX_EDITS = 2000;

/// Записать правки ячеек MeterReader — одну (правка ячейки) или пачку
/// (вставка из буфера). Каждое поле живёт в своей таблице:
/// наименование — в Ti, порт и адрес — в Connection (заводится при первой
/// записи), Uном, схема, «опрашивается» и RS-485 — тоже в Ti, IP — в
/// SIM-карте модема группы, вид модема из «опрашивается» — в модеме группы,
/// тех. решение — в TechnicalSolution группы, тип ПУ и замена — в счётчиках
/// ТИ, что стоит сейчас и что ставим (заводятся при первой записи),
/// «требуется замена» — обратным к соответствию требованиям у того, что стоит. Модем и
/// решение общие на группу, поэтому правка у одной ТИ меняет их у всей
/// группы.
export async function updateMeterReaderCells(
  projectId: string,
  edits: MeterReaderEdit[],
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

    for (const { tiId, field, value } of edits) {
      const trimmed = value.trim();
      /// Пустое в необязательных полях — «не знаем», то есть null, а не ''.
      const nullable = trimmed === '' ? null : trimmed;

      if (field === 'name') {
        await tx.ti.update({ where: { id: tiId }, data: { name: trimmed } });
      } else if (field === 'port' || field === 'connectAddress') {
        const data =
          field === 'port' ? { port: nullable } : { meterAddress: nullable };

        await tx.connection.upsert({
          where: { tiId },
          create: { tiId, ...data },
          update: data,
        });
      } else if (field === 'uNom') {
        /// Разбор уже проверен (invalidValueError) — undefined здесь нет.
        const uNom = parseVoltageClass(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { uNom } });
      } else if (field === 'wiring') {
        const wiring = parseWiringScheme(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { wiring } });
      } else if (field === 'freeRs485') {
        const freeRs485 = parseYesNo(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { freeRs485 } });
      } else if (field === 'needsReplacement') {
        /// «Требуется замена» — обратное к «соответствует требованиям»;
        /// пустое — «не выяснили», null.
        const needs = parseYesNo(value)!;
        const isCompliant = needs === null ? null : !needs;
        const state = EquipmentState.current;

        await tx.meter.upsert({
          where: { tiId_state: { tiId, state } },
          create: { tiId, state, isCompliant },
          update: { isCompliant },
        });
      } else if (field === 'isPolled') {
        const { isPolled, modemKind } = parsePolling(value)!;

        await tx.ti.update({ where: { id: tiId }, data: { isPolled } });

        /// Вид модема назвали («да, по встр. модему») — он общий на группу.
        const modemId = byId.get(tiId)!.group?.modem?.id;

        if (modemKind && modemId) {
          await tx.modem.update({
            where: { id: modemId },
            data: { kind: modemKind },
          });
        }
      } else if (field === 'meterType' || field === 'proposedMeterType') {
        /// Тип ПУ — у счётчика, что стоит сейчас, замена — у того, что
        /// ставим. Пустой тип — null, а сам счётчик остаётся: у него есть и
        /// другие поля (номер, соответствие требованиям).
        const state =
          field === 'meterType'
            ? EquipmentState.current
            : EquipmentState.proposed;

        await tx.meter.upsert({
          where: { tiId_state: { tiId, state } },
          create: { tiId, state, type: nullable },
          update: { type: nullable },
        });
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

    return null;
  });

  if (error) return { ok: false, error };

  /// Страница динамическая (force-dynamic) — перерисовать её достаточно.
  refresh();

  return { ok: true };
}
