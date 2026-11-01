'use server';

import { isIP } from 'node:net';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type NewModemFields = {
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
  fields: NewModemFields,
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
