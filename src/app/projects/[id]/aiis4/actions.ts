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
