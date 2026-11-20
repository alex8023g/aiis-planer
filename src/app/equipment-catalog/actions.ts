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

export async function createEquipmentKit(
  name: string,
  items: KitDraftItem[],
): Promise<ActionResult> {
  const user = await requireUser();
  if (!canEdit(user)) {
    return { ok: false, error: 'Только просмотр: добавлять комплекты нельзя' };
  }

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
  const rows: {
    kindId: string;
    modelId: string | null;
    quantity: number | null;
    position: number;
  }[] = [];

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

  try {
    await prisma.equipmentKit.create({
      data: {
        name: cleanEquipmentName(name),
        items: { createMany: { data: rows } },
      },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return { ok: false, error: 'Комплект с таким названием уже существует' };
    }
    throw error;
  }

  refresh();
  return { ok: true };
}
