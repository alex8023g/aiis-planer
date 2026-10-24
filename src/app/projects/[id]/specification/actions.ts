'use server';

import { refresh } from 'next/cache';

import { cleanEquipmentName, equipmentKey } from '@/lib/equipment';
import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type SpecificationDraft = {
  kind: string;
  model: string;
  quantity: string;
  /// Ед. изм. нужна, только если вид новый: у заведённого она своя и отсюда не
  /// меняется.
  unit: string;
  note: string;
};

/// Больше позиций разом не пишем: вставка простыни по ошибке иначе ушла бы в
/// базу одним запросом.
const MAX_ITEMS = 500;

type CleanDraft = {
  kind: string;
  kindKey: string;
  model: string | null;
  quantity: number | null;
  unit: string;
  note: string | null;
};

function parseDraft(
  draft: SpecificationDraft,
  row: number,
): CleanDraft | string {
  const kind = cleanEquipmentName(draft.kind);
  const model = cleanEquipmentName(draft.model);
  const quantityText = draft.quantity.trim();
  const quantity = quantityText === '' ? null : Number(quantityText);
  const note = draft.note.trim();

  if (!kind) return `Строка ${row}: нет наименования`;
  if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
    return `Строка ${row}: кол-во — целое число больше нуля или пусто`;
  }

  return {
    kind,
    kindKey: equipmentKey(kind),
    model: model || null,
    quantity,
    unit: draft.unit.trim(),
    note: note || null,
  };
}

/// Записать спецификацию целиком — группы ТИ или, без groupId, общую на
/// проект: позиции пересоздаются в том порядке, в каком пришли. Список правят
/// как одно целое — добавляют, удаляют и переставляют строки, и сверять его по
/// строкам незачем.
///
/// Вид и марку набирают текстом. Совпавшие со справочником (с точностью до
/// пробелов, регистра и кириллических двойников — см. equipmentKey) берутся
/// оттуда, новые заводятся в справочник тут же.
export async function saveSpecification(
  projectId: string,
  groupId: string | null,
  drafts: SpecificationDraft[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (drafts.length > MAX_ITEMS) {
    return { ok: false, error: `Не больше ${MAX_ITEMS} позиций` };
  }

  const rows: CleanDraft[] = [];

  for (const [index, draft] of drafts.entries()) {
    const parsed = parseDraft(draft, index + 1);
    if (typeof parsed === 'string') return { ok: false, error: parsed };
    rows.push(parsed);
  }

  /// Группа должна быть из этого проекта: права проверены на проект, а id
  /// группы пришёл из браузера.
  if (groupId !== null) {
    const group = await prisma.tiGroup.findFirst({
      where: { id: groupId, projectId },
      select: { id: true },
    });

    if (!group) {
      return { ok: false, error: 'Группа не найдена — обновите страницу' };
    }
  }

  /// Справочник целиком: сравнивать приходится по equipmentKey, а его в базе
  /// нет — только в коде. Справочник короткий, десятки видов.
  const catalog = await prisma.equipmentKind.findMany({
    select: {
      id: true,
      name: true,
      models: { select: { id: true, name: true } },
    },
  });
  const kinds = new Map(
    catalog.map((kind) => [
      equipmentKey(kind.name),
      {
        id: kind.id,
        models: new Map(
          kind.models.map((model) => [equipmentKey(model.name), model.id]),
        ),
      },
    ]),
  );

  for (const [index, row] of rows.entries()) {
    if (!kinds.has(row.kindKey) && !row.unit) {
      return {
        ok: false,
        error: `Строка ${index + 1}: «${row.kind}» — новый вид, укажите ед. изм.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    const data = [];

    for (const [position, row] of rows.entries()) {
      let kind = kinds.get(row.kindKey);

      if (!kind) {
        /// upsert, а не create: тот же вид мог завести соседний редактор,
        /// пока этот правил свою спецификацию. update пустой — справочник
        /// отсюда не переписывается.
        const created = await tx.equipmentKind.upsert({
          where: { name: row.kind },
          create: { name: row.kind, unit: row.unit },
          update: {},
          select: { id: true },
        });

        kind = { id: created.id, models: new Map() };
        kinds.set(row.kindKey, kind);
      }

      let modelId: string | null = null;

      if (row.model !== null) {
        const modelKey = equipmentKey(row.model);

        modelId = kind.models.get(modelKey) ?? null;

        if (modelId === null) {
          const created = await tx.equipmentModel.upsert({
            where: { kindId_name: { kindId: kind.id, name: row.model } },
            create: { kindId: kind.id, name: row.model },
            update: {},
            select: { id: true },
          });

          modelId = created.id;
          kind.models.set(modelKey, modelId);
        }
      }

      data.push({
        projectId,
        groupId,
        kindId: kind.id,
        modelId,
        quantity: row.quantity,
        note: row.note,
        position,
      });
    }

    await tx.specificationItem.deleteMany({ where: { projectId, groupId } });
    await tx.specificationItem.createMany({ data });
  });

  refresh();

  return { ok: true };
}
