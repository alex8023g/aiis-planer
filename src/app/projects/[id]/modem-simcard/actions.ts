'use server';

import { isIP } from 'node:net';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type ModemFields = {
  type: string;
  imei: string;
  simNumber: string;
  ip: string;
  provider: string;
};

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

  const ip = nullable(fields.ip);

  if (ip !== null && !isIP(ip)) {
    return { ok: false, error: `«${ip}» — не IP-адрес` };
  }

  await prisma.modem.create({
    data: {
      projectId,
      type: nullable(fields.type),
      imei: nullable(fields.imei),
      simCard: {
        create: {
          number: nullable(fields.simNumber),
          ip,
          provider: nullable(fields.provider),
        },
      },
    },
  });

  /// Страница динамическая (force-dynamic) — перерисовать её достаточно.
  refresh();

  return { ok: true };
}

/// Изменить модем и его SIM-карту. Карты у модема может не быть — тогда она
/// заводится. Группа модема не меняется: привязывают его в таблице опроса.
export async function updateModem(
  projectId: string,
  modemId: string,
  fields: ModemFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const ip = nullable(fields.ip);

  if (ip !== null && !isIP(ip)) {
    return { ok: false, error: `«${ip}» — не IP-адрес` };
  }

  /// По projectId тоже: id пришёл из браузера, чужой модем менять нельзя.
  const modem = await prisma.modem.findFirst({
    where: { id: modemId, projectId },
    select: { id: true },
  });

  if (!modem) {
    return { ok: false, error: 'Модем не найден — обновите страницу' };
  }

  const simCard = {
    number: nullable(fields.simNumber),
    ip,
    provider: nullable(fields.provider),
  };

  await prisma.modem.update({
    where: { id: modem.id },
    data: {
      type: nullable(fields.type),
      imei: nullable(fields.imei),
      simCard: { upsert: { create: simCard, update: simCard } },
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
