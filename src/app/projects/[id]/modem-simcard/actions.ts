'use server';

import { isIP } from 'node:net';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import { MAIN_SIM_SLOT, RESERVE_SIM_SLOT } from '@/lib/sim-card';
import type { ActionResult } from '@/lib/types';

export type ModemFields = {
  type: string;
  imei: string;
  /// Пусто — порт по умолчанию.
  port: string;
  simNumber: string;
  ip: string;
  provider: string;
  /// Запасная SIM-карта (слот 2). Все пустые — карты нет.
  reserveSimNumber: string;
  reserveIp: string;
  reserveProvider: string;
};

type SimData = {
  number: string | null;
  ip: string | null;
  provider: string | null;
};

/// SIM-карты из полей формы — или текст ошибки. Запасная — null, когда все
/// её поля пустые: такую карту не заводят, а заведённую удаляют.
function simCardsOf(
  fields: ModemFields,
): { main: SimData; reserve: SimData | null } | { error: string } {
  const main = {
    number: nullable(fields.simNumber),
    ip: nullable(fields.ip),
    provider: nullable(fields.provider),
  };
  const reserve = {
    number: nullable(fields.reserveSimNumber),
    ip: nullable(fields.reserveIp),
    provider: nullable(fields.reserveProvider),
  };

  for (const ip of [main.ip, reserve.ip]) {
    if (ip !== null && !isIP(ip)) return { error: `«${ip}» — не IP-адрес` };
  }

  const hasReserve =
    reserve.number !== null || reserve.ip !== null || reserve.provider !== null;

  return { main, reserve: hasReserve ? reserve : null };
}

/// Пустое поле — «не знаем», то есть null, а не ''.
function nullable(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/// Завести модем с SIM-картой в проекте — без группы: к группе ТИ его
/// привяжут потом.
export async function createModem(
  projectId: string,
  fields: ModemFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const sims = simCardsOf(fields);
  if ('error' in sims) return { ok: false, error: sims.error };

  await prisma.modem.create({
    data: {
      projectId,
      type: nullable(fields.type),
      imei: nullable(fields.imei),
      port: nullable(fields.port),
      simCards: {
        create: [
          { slot: MAIN_SIM_SLOT, ...sims.main },
          ...(sims.reserve
            ? [{ slot: RESERVE_SIM_SLOT, ...sims.reserve }]
            : []),
        ],
      },
    },
  });

  /// Страница динамическая (force-dynamic) — перерисовать её достаточно.
  refresh();

  return { ok: true };
}

/// Изменить модем и его SIM-карты. Основной карты у модема может не быть —
/// тогда она заводится; запасная заводится, правится или удаляется по полям. Группа модема не меняется: привязывают его в таблице опроса.
export async function updateModem(
  projectId: string,
  modemId: string,
  fields: ModemFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const sims = simCardsOf(fields);
  if ('error' in sims) return { ok: false, error: sims.error };

  /// По projectId тоже: id пришёл из браузера, чужой модем менять нельзя.
  const modem = await prisma.modem.findFirst({
    where: { id: modemId, projectId },
    select: { id: true },
  });

  if (!modem) {
    return { ok: false, error: 'Модем не найден — обновите страницу' };
  }

  const slot = (number: number) => ({
    modemId_slot: { modemId: modem.id, slot: number },
  });

  await prisma.modem.update({
    where: { id: modem.id },
    data: {
      type: nullable(fields.type),
      imei: nullable(fields.imei),
      port: nullable(fields.port),
      simCards: {
        upsert: [
          {
            where: slot(MAIN_SIM_SLOT),
            create: { slot: MAIN_SIM_SLOT, ...sims.main },
            update: sims.main,
          },
          ...(sims.reserve
            ? [
                {
                  where: slot(RESERVE_SIM_SLOT),
                  create: { slot: RESERVE_SIM_SLOT, ...sims.reserve },
                  update: sims.reserve,
                },
              ]
            : []),
        ],
        /// Поля запасной карты стёрли — карты больше нет.
        deleteMany: sims.reserve ? [] : [{ slot: RESERVE_SIM_SLOT }],
      },
    },
  });

  refresh();

  return { ok: true };
}

/// Удалить модем вместе с SIM-картой. Привязанный к группе тоже удаляется —
/// группа остаётся без модема, пока к ней не привяжут другой.
export async function deleteModem(
  projectId: string,
  modemId: string,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  /// По projectId тоже: id пришёл из браузера, чужой модем удалять нельзя.
  const { count } = await prisma.modem.deleteMany({
    where: { id: modemId, projectId },
  });

  if (count === 0) {
    return { ok: false, error: 'Модем не найден — обновите страницу' };
  }

  refresh();

  return { ok: true };
}
