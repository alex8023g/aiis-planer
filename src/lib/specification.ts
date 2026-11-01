import type { Prisma } from '@/generated/prisma/client';
import { EquipmentState } from '@/generated/prisma/enums';
import { cleanEquipmentName, equipmentKey } from '@/lib/equipment';
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

/// Типовой комплект — для кнопки «Добавить комплект» в редакторе.
export type EquipmentKitOption = {
  name: string;
  items: { kind: string; model: string | null; quantity: number | null }[];
};

export async function getEquipmentKits(): Promise<EquipmentKitOption[]> {
  const kits = await prisma.equipmentKit.findMany({
    orderBy: { name: 'asc' },
    select: {
      name: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          quantity: true,
          kind: { select: { name: true } },
          model: { select: { name: true } },
        },
      },
    },
  });

  return kits.map((kit) => ({
    name: kit.name,
    items: kit.items.map((item) => ({
      kind: item.kind.name,
      model: item.model?.name ?? null,
      quantity: item.quantity,
    })),
  }));
}

/// Вид, под которым счётчики ТИ попадают в спецификацию.
const METER_KIND = 'Прибор учета';

/// «Нет» и прочерк в типе — «менять не будем», а не марка: из опроса такие
/// счётчики приходят с типом «нет».
function isMeterModel(type: string): boolean {
  return !/^нет(?![а-яё])/i.test(type) && !/^-+$/.test(type);
}

/// Привести строки «Прибор учета» в спецификациях групп к счётчикам их ТИ:
/// по строке на марку, кол-во — сколько ТИ группы ставят счётчик этой марки.
/// Считаются новый счётчик (proposed) и текущий, поставленный заменой
/// (dateInstalled есть только у них, см. replaceMeter), — поставленный из
/// спецификации не пропадает.
///
/// Строки с маркой ведёт эта функция: кол-во перезаписывается, лишние
/// удаляются. Строку без марки (заготовку из типового комплекта) занимает
/// первая марка, остальные такие удаляются — иначе счётчик посчитался бы
/// дважды. Без счётчиков заготовку не трогаем.
export async function syncMeterSpecification(
  tx: Prisma.TransactionClient,
  projectId: string,
  groupIds: Iterable<string>,
): Promise<void> {
  const ids = [...new Set(groupIds)];

  if (ids.length === 0) return;

  const kindKey = equipmentKey(METER_KIND);
  const kind =
    (await tx.equipmentKind.findMany({ select: { id: true, name: true } }))
      .find((item) => equipmentKey(item.name) === kindKey) ??
    (await tx.equipmentKind.create({
      data: { name: METER_KIND, unit: 'шт' },
      select: { id: true, name: true },
    }));
  const models = await tx.equipmentModel.findMany({
    where: { kindId: kind.id },
    select: { id: true, name: true },
  });
  const modelByKey = new Map(
    models.map((model) => [equipmentKey(model.name), model.id]),
  );

  const groups = await tx.tiGroup.findMany({
    where: { id: { in: ids }, projectId },
    select: {
      id: true,
      tis: {
        select: {
          meters: {
            where: {
              OR: [
                { state: EquipmentState.proposed },
                { state: EquipmentState.current, dateInstalled: { not: null } },
              ],
            },
            select: { type: true },
          },
        },
      },
      specification: {
        where: { kindId: kind.id },
        orderBy: { position: 'asc' },
        select: { id: true, modelId: true },
      },
    },
  });

  for (const group of groups) {
    /// Кол-во по марке. Марка из справочника, а нет её там — заводим.
    const counts = new Map<string, number>();

    for (const meter of group.tis.flatMap((ti) => ti.meters)) {
      const type = meter.type ? cleanEquipmentName(meter.type) : '';

      if (!type || !isMeterModel(type)) continue;

      const key = equipmentKey(type);
      let modelId = modelByKey.get(key);

      if (!modelId) {
        modelId = (
          await tx.equipmentModel.create({
            data: { kindId: kind.id, name: type },
            select: { id: true },
          })
        ).id;
        modelByKey.set(key, modelId);
      }

      counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
    }

    const placeholders = group.specification.filter((item) => !item.modelId);
    const pending = new Map(counts);

    for (const item of group.specification) {
      if (!item.modelId) continue;

      const quantity = pending.get(item.modelId);

      if (quantity === undefined) {
        await tx.specificationItem.delete({ where: { id: item.id } });
      } else {
        await tx.specificationItem.update({
          where: { id: item.id },
          data: { quantity },
        });
        pending.delete(item.modelId);
      }
    }

    if (counts.size > 0) {
      for (const [index, placeholder] of placeholders.entries()) {
        const next = pending.entries().next().value;

        if (index === 0 && next) {
          await tx.specificationItem.update({
            where: { id: placeholder.id },
            data: { modelId: next[0], quantity: next[1] },
          });
          pending.delete(next[0]);
        } else {
          await tx.specificationItem.delete({ where: { id: placeholder.id } });
        }
      }
    }

    if (pending.size === 0) continue;

    const last = await tx.specificationItem.aggregate({
      where: { projectId, groupId: group.id },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;

    for (const [modelId, quantity] of pending) {
      await tx.specificationItem.create({
        data: {
          projectId,
          groupId: group.id,
          kindId: kind.id,
          modelId,
          quantity,
          position: position++,
        },
      });
    }
  }
}
