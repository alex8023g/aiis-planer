'use server';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

/// Колонки таблицы MeterReader, которые можно править.
export type MeterReaderField = 'name' | 'ip' | 'port' | 'connectAddress';

export type MeterReaderEdit = {
  tiId: string;
  field: MeterReaderField;
  value: string;
};

const FIELDS = new Set<string>(['name', 'ip', 'port', 'connectAddress']);

/// Больше разом не пишем: вставка целой простыни из буфера по ошибке иначе
/// переписала бы всю таблицу одним запросом.
const MAX_EDITS = 2000;

/// Записать правки ячеек MeterReader — одну (правка ячейки) или пачку
/// (вставка из буфера). Каждое поле живёт в своей таблице:
/// наименование — в Ti, порт и адрес — в Connection (заводится при первой
/// записи), IP — в SIM-карте модема группы. Модем общий на группу, поэтому
/// правка IP у одной ТИ меняет его у всей группы.
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

  const ids = [...new Set(edits.map((edit) => edit.tiId))];

  /// Одной транзакцией: вставка либо ложится целиком, либо не ложится вовсе
  /// — половина вставленного блока хуже, чем ничего.
  const error = await prisma.$transaction(async (tx) => {
    const tis = await tx.ti.findMany({
      where: { id: { in: ids }, projectId },
      select: {
        id: true,
        name: true,
        group: { select: { modem: { select: { id: true } } } },
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
