'use server';

import { refresh } from 'next/cache';

import { cleanEquipmentName } from '@/lib/equipment';
import { prisma } from '@/lib/prisma';
import { canEdit, requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export type KitDraftItem = {
  kindId: string;
  modelId: string;
  quantity: string;
};

type KitRows = {
  kindId: string;
  modelId: string | null;
  quantity: number | null;
  position: number;
}[];

async function parseKit(
  name: string,
  items: KitDraftItem[],
): Promise<
  { ok: true; name: string; rows: KitRows } | { ok: false; error: string }
> {
  if (typeof name !== 'string' || !cleanEquipmentName(name)) {
    return { ok: false, error: 'Укажите название комплекта' };
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    return { ok: false, error: 'Укажите от 1 до 500 позиций комплекта' };
  }

  const catalog = await prisma.equipmentKind.findMany({
    select: { id: true, models: { select: { id: true } } },
  });
  const kinds = new Map(
    catalog.map((kind) => [kind.id, new Set(kind.models.map((m) => m.id))]),
  );
  const rows: KitRows = [];

  for (const [position, item] of items.entries()) {
    if (
      !item ||
      typeof item.kindId !== 'string' ||
      typeof item.modelId !== 'string' ||
      typeof item.quantity !== 'string'
    ) {
      return { ok: false, error: `Строка ${position + 1}: неверные данные` };
    }
    const models = kinds.get(item.kindId);
    if (!models || (item.modelId && !models.has(item.modelId))) {
      return {
        ok: false,
        error: `Строка ${position + 1}: выберите вид и марку из справочника`,
      };
    }
    const text = item.quantity.trim();
    const quantity = text === '' ? null : Number(text);
    if (
      quantity !== null &&
      (!Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647)
    ) {
      return {
        ok: false,
        error: `Строка ${position + 1}: кол-во — целое число больше нуля или пусто`,
      };
    }
    rows.push({
      kindId: item.kindId,
      modelId: item.modelId || null,
      quantity,
      position,
    });
  }

  return { ok: true, name: cleanEquipmentName(name), rows };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function createEquipmentKit(
  name: string,
  items: KitDraftItem[],
): Promise<ActionResult> {
  const user = await requireUser();
  if (!canEdit(user)) {
    return { ok: false, error: 'Только просмотр: добавлять комплекты нельзя' };
  }

  const kit = await parseKit(name, items);
  if (!kit.ok) return kit;

  try {
    await prisma.equipmentKit.create({
      data: { name: kit.name, items: { createMany: { data: kit.rows } } },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Комплект с таким названием уже существует' };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}

export async function updateEquipmentKit(
  id: string,
  name: string,
  items: KitDraftItem[],
): Promise<ActionResult> {
  const user = await requireUser();
  if (!canEdit(user)) {
    return { ok: false, error: 'Только просмотр: менять комплекты нельзя' };
  }
  if (typeof id !== 'string') return { ok: false, error: 'Комплект не найден' };

  const kit = await parseKit(name, items);
  if (!kit.ok) return kit;

  try {
    await prisma.$transaction([
      prisma.equipmentKitItem.deleteMany({ where: { kitId: id } }),
      prisma.equipmentKit.update({
        where: { id },
        data: { name: kit.name, items: { createMany: { data: kit.rows } } },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Комплект с таким названием уже существует' };
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    ) {
      return { ok: false, error: 'Комплект не найден' };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}

export async function deleteEquipmentKit(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canEdit(user)) {
    return { ok: false, error: 'Только просмотр: удалять комплекты нельзя' };
  }
  if (typeof id !== 'string') return { ok: false, error: 'Комплект не найден' };

  await prisma.equipmentKit.deleteMany({ where: { id } });

  refresh();
  return { ok: true };
}
