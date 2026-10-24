import { prisma } from '@/lib/prisma';

export type SpecificationRow = {
  id: string;
  name: string;
  model: string | null;
  quantity: number;
  unit: string;
};

/// Спецификация группы ТИ — в том порядке, в котором её записал составитель.
///
/// Проект в условии: группу ищут по id из адреса, и без него чужая группа
/// открылась бы под любым проектом. Доступ к самому проекту проверяет
/// вызывающий (см. getProject в src/lib/projects.ts).
export async function getGroupSpecification(
  projectId: string,
  groupId: string,
): Promise<SpecificationRow[]> {
  return prisma.specificationItem.findMany({
    where: { groupId, group: { projectId } },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, model: true, quantity: true, unit: true },
  });
}
