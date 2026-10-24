'use server';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type SpecificationDraft = {
  name: string;
  model: string;
  quantity: string;
  unit: string;
};

/// Больше позиций разом не пишем: вставка простыни по ошибке иначе ушла бы в
/// базу одним запросом.
const MAX_ITEMS = 500;

/// Записать спецификацию группы целиком: позиции пересоздаются в том порядке,
/// в каком пришли. Список правят как одно целое — добавляют, удаляют и
/// переставляют строки, и сверять его по строкам незачем.
export async function saveGroupSpecification(
  projectId: string,
  groupId: string,
  drafts: SpecificationDraft[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (drafts.length > MAX_ITEMS) {
    return { ok: false, error: `Не больше ${MAX_ITEMS} позиций` };
  }

  const items = [];

  for (const [index, draft] of drafts.entries()) {
    const row = index + 1;
    const name = draft.name.trim();
    const model = draft.model.trim();
    const unit = draft.unit.trim();
    const quantity = Number(draft.quantity.trim());

    if (!name) return { ok: false, error: `Строка ${row}: нет наименования` };
    if (!unit) return { ok: false, error: `Строка ${row}: нет ед. изм.` };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        ok: false,
        error: `Строка ${row}: кол-во — целое число больше нуля`,
      };
    }

    items.push({
      groupId,
      name,
      model: model || null,
      quantity,
      unit,
      position: index,
    });
  }

  /// Группа должна быть из этого проекта: права проверены на проект, а id
  /// группы пришёл из браузера.
  const group = await prisma.tiGroup.findFirst({
    where: { id: groupId, projectId },
    select: { id: true },
  });

  if (!group)
    return { ok: false, error: 'Группа не найдена — обновите страницу' };

  await prisma.$transaction([
    prisma.specificationItem.deleteMany({ where: { groupId } }),
    prisma.specificationItem.createMany({ data: items }),
  ]);

  refresh();

  return { ok: true };
}
