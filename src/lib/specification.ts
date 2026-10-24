import { prisma } from '@/lib/prisma';

export type SpecificationRow = {
  id: string;
  kind: string;
  model: string | null;
  quantity: number | null;
  unit: string;
  note: string | null;
};

/// Вид оборудования со своими марками — для подсказок в редакторе.
export type EquipmentKindOption = {
  name: string;
  unit: string;
  models: string[];
};

/// Строка итога проекта: позиции одного вида и марки, сложенные со всех групп.
export type SpecificationTotal = {
  kind: string;
  model: string | null;
  quantity: number;
  unit: string;
  /// Сколько позиций сложено без кол-ва: итог по ним неполный.
  missing: number;
};

const rowSelect = {
  id: true,
  quantity: true,
  note: true,
  kind: { select: { name: true, unit: true } },
  model: { select: { name: true } },
} as const;

function toRow(item: {
  id: string;
  quantity: number | null;
  note: string | null;
  kind: { name: string; unit: string };
  model: { name: string } | null;
}): SpecificationRow {
  return {
    id: item.id,
    kind: item.kind.name,
    model: item.model?.name ?? null,
    quantity: item.quantity,
    unit: item.kind.unit,
    note: item.note,
  };
}

/// Спецификация группы ТИ — в том порядке, в котором её записал составитель.
///
/// Проект в условии: группу ищут по id из адреса, и без него чужая группа
/// открылась бы под любым проектом. Доступ к самому проекту проверяет
/// вызывающий (см. getProject в src/lib/projects.ts).
export async function getGroupSpecification(
  projectId: string,
  groupId: string,
): Promise<SpecificationRow[]> {
  const items = await prisma.specificationItem.findMany({
    where: { projectId, groupId },
    orderBy: { position: 'asc' },
    select: rowSelect,
  });

  return items.map(toRow);
}

/// Позиции проекта целиком, не привязанные к группе: расходные материалы на
/// все объекты сразу.
export async function getProjectSpecification(
  projectId: string,
): Promise<SpecificationRow[]> {
  const items = await prisma.specificationItem.findMany({
    where: { projectId, groupId: null },
    orderBy: { position: 'asc' },
    select: rowSelect,
  });

  return items.map(toRow);
}

/// Итоговая спецификация проекта: все позиции — и групповые, и общие —
/// сложены по виду и марке. Считается при каждом показе, а не хранится:
/// хранимый итог расходился бы со спецификациями групп после каждой правки.
export async function getSpecificationTotals(
  projectId: string,
): Promise<SpecificationTotal[]> {
  const items = await prisma.specificationItem.findMany({
    where: { projectId },
    select: {
      quantity: true,
      kind: { select: { id: true, name: true, unit: true } },
      model: { select: { id: true, name: true } },
    },
  });
  const totals = new Map<string, SpecificationTotal>();

  for (const item of items) {
    const key = `${item.kind.id}:${item.model?.id ?? ''}`;
    const total = totals.get(key) ?? {
      kind: item.kind.name,
      model: item.model?.name ?? null,
      quantity: 0,
      unit: item.kind.unit,
      missing: 0,
    };

    if (item.quantity === null) total.missing++;
    else total.quantity += item.quantity;

    totals.set(key, total);
  }

  return [...totals.values()].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind, 'ru') ||
      (a.model ?? '').localeCompare(b.model ?? '', 'ru'),
  );
}

/// Весь справочник оборудования — подсказки редактору спецификации.
export async function getEquipmentCatalog(): Promise<EquipmentKindOption[]> {
  const kinds = await prisma.equipmentKind.findMany({
    orderBy: { name: 'asc' },
    select: {
      name: true,
      unit: true,
      models: { orderBy: { name: 'asc' }, select: { name: true } },
    },
  });

  return kinds.map((kind) => ({
    name: kind.name,
    unit: kind.unit,
    models: kind.models.map((model) => model.name),
  }));
}
