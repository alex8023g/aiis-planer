import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import type { Facility, MeasurementPointRow } from '@/lib/types';

/// Точки учёта проекта одним списком, в порядке, который задал составитель:
/// сквозном по проекту, а не внутри объектов. Объект строки от порядка не
/// зависит — иначе строку нельзя было бы перетащить, не меняя объект, а
/// одиночную точку не сдвинуть вовсе. Одинаковый объект у соседних строк
/// таблица показывает объединённой ячейкой.
///
/// Доступ здесь не проверяется — проект уже прочитан вызывающим (см. getProject
/// в src/lib/projects.ts), а точки видны всем, кому виден сам проект.
export async function getMeasurementPoints(
  projectId: string,
): Promise<MeasurementPointRow[]> {
  return prisma.measurementPoint.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      meterModel: true,
      meterNumber: true,
      facilityId: true,
      facility: { select: { name: true } },
    },
  });
}

/// Объекты проекта для колонки «Объект»: вставленное имя ищут среди них.
/// Порядок тот же, в каком объекты идут в списке.
export async function getFacilities(projectId: string): Promise<Facility[]> {
  return prisma.facility.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true },
  });
}

/// Обновить страницы, на которых видны точки: саму таблицу и страницу проекта.
export function revalidatePoints(projectId: string): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/aiis`);
}
