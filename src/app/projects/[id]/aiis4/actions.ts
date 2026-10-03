'use server';

import { refresh } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

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

/// Добавить count пустых ТИ в конец таблицы опроса. Номера идут подряд за
/// последним, наименование пустое — его заполняют уже в таблице.
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

  await prisma.ti.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      projectId,
      number: String(firstNumber + index),
      name: '',
      position: firstPosition + index,
    })),
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
      (await tx.tiGroup.create({ data: { projectId }, select: { id: true } }))
        .id;
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

    if (sourceIds.length === 0) return null;

    const shared = {
      uspd: { select: { id: true } },
      modem: { select: { id: true } },
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
