import { revalidatePath } from 'next/cache';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { FacilityWithContent, MeasurementPoint } from '@/lib/types';

/// Порядок внутри объекта — и у точек, и у позиций спецификации — задаёт
/// составитель; createdAt в довесок: без него порядок совпавших номеров ничем
/// не закреплён.
const pointOrder: Prisma.MeasurementPointOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

const itemOrder: Prisma.SpecificationItemOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

const pointFields = {
  id: true,
  name: true,
  meterModel: true,
  meterNumber: true,
  meterLocation: true,
  facilityId: true,
} as const;

/// Единственный запрос за объектами: и список, и отдельный объект должны
/// приходить одинаковыми, иначе точки и спецификация выглядели бы по-разному на
/// двух страницах.
async function findFacilities(
  where: Prisma.FacilityWhereInput,
): Promise<FacilityWithContent[]> {
  return prisma.facility.findMany({
    where,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      currentDescription: true,
      technicalSolution: true,
      points: { select: pointFields, orderBy: pointOrder },
      specification: {
        select: { id: true, name: true, model: true, quantity: true },
        orderBy: itemOrder,
      },
    },
  });
}

/// Объекты проекта вместе с точками и спецификациями. Возвращаются все, даже
/// пустые: заведённый, но ещё не заполненный объект — это начатая работа, и с
/// него продолжают ввод.
///
/// Доступ здесь не проверяется — проект уже прочитан вызывающим (см. getProject
/// в src/lib/projects.ts), а объекты видны всем, кому виден сам проект.
export async function getFacilities(
  projectId: string,
): Promise<FacilityWithContent[]> {
  return findFacilities({ projectId });
}

/// Один объект проекта или null, если его нет. projectId в условии, а не только
/// id: иначе, зная id чужого объекта, его можно было бы открыть через свой
/// проект.
export async function getFacility(
  projectId: string,
  id: string,
): Promise<FacilityWithContent | null> {
  const [facility] = await findFacilities({ id, projectId });

  return facility ?? null;
}

/// Точки, за которыми объект ещё не закреплён: их показывают отдельной группой
/// в конце списка. Такие точки заводят, пока объекты не разложены, — и пока в
/// проекте нет ни одного объекта, эта группа единственная.
export async function getUnassignedPoints(
  projectId: string,
): Promise<MeasurementPoint[]> {
  return prisma.measurementPoint.findMany({
    where: { projectId, facilityId: null },
    orderBy: pointOrder,
    select: pointFields,
  });
}

/// Принадлежит ли объект этому проекту. Нужно экшенам точек и спецификации:
/// право менять они проверяют по проекту, а id объекта приходит из браузера —
/// без этой проверки чужой объект можно было бы наполнить через свой проект.
export async function isProjectFacility(
  projectId: string,
  facilityId: string,
): Promise<boolean> {
  const count = await prisma.facility.count({
    where: { id: facilityId, projectId },
  });

  return count > 0;
}

/// Номер для нового объекта: следом за последним. Объекты не перенумеровываются
/// при удалении, поэтому берём максимум, а не количество строк.
export async function nextFacilityPosition(projectId: string): Promise<number> {
  const last = await prisma.facility.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  return (last._max.position ?? -1) + 1;
}

/// Номер для новой точки: следом за последней в её группе. Нумерация у каждого
/// объекта своя (и отдельная — у точек без объекта), поэтому facilityId входит
/// в условие.
export async function nextPointPosition(
  projectId: string,
  facilityId: string | null,
): Promise<number> {
  const last = await prisma.measurementPoint.aggregate({
    where: { projectId, facilityId },
    _max: { position: true },
  });

  return (last._max.position ?? -1) + 1;
}

/// Итоги по всем объектам проекта: столько на нём точек учёта, позиций
/// спецификации и единиц оборудования. Своей спецификации у проекта нет — она
/// складывается из спецификаций объектов, и считает эту сумму одно место в
/// коде, а не каждая страница по-своему. Точки без объекта сюда не входят: их
/// передают отдельно, как отдельную группу.
export function facilityTotals(facilities: FacilityWithContent[]): {
  points: number;
  items: number;
  units: number;
} {
  return facilities.reduce(
    (totals, facility) => ({
      points: totals.points + facility.points.length,
      items: totals.items + facility.specification.length,
      units:
        totals.units +
        facility.specification.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { points: 0, items: 0, units: 0 },
  );
}

/// Обновить страницы, на которых видно изменённое: страницу АИИС со списком
/// объектов, сам объект (если он известен) и страницу проекта — итоги видны и
/// там.
export function revalidateFacilities(
  projectId: string,
  facilityId?: string,
): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/aiis`);

  if (facilityId) {
    revalidatePath(`/projects/${projectId}/aiis/${facilityId}`);
  }
}
