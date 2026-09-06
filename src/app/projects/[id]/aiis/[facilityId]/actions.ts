'use server';

import { isProjectFacility, revalidateFacilities } from '@/lib/facilities';
import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import { nextPosition } from '@/lib/specification';
import type { ActionResult } from '@/lib/types';

export type SpecificationItemFields = {
  name: string;
  /// Модель может быть неизвестна или не иметь смысла для позиции: пустое поле
  /// формы доходит до базы как null.
  model: string;
  quantity: number;
};

/// То же, но уже разобранное: пустая модель — null, как в базе.
type ValidatedFields = { name: string; model: string | null; quantity: number };

function validate(
  fields: SpecificationItemFields,
): { ok: true; value: ValidatedFields } | { ok: false; error: string } {
  const name = fields.name.trim();

  if (!name) return { ok: false, error: 'Укажите наименование' };

  const quantity = Math.trunc(fields.quantity);

  if (!Number.isFinite(quantity) || quantity < 1) {
    return { ok: false, error: 'Количество — целое число от 1' };
  }

  return {
    ok: true,
    value: { name, model: fields.model.trim() || null, quantity },
  };
}

/// Общее для всех трёх экшенов: право менять проект и то, что объект — из этого
/// проекта. Одной проверки проекта мало: id объекта приходит из браузера, и без
/// второй проверки в чужой объект можно было бы сложить позиции через свой
/// проект.
async function requireFacilityEditor(
  projectId: string,
  facilityId: string,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (!(await isProjectFacility(projectId, facilityId))) {
    return { ok: false, error: 'Объект не найден' };
  }

  return { ok: true };
}

export async function addSpecificationItem(
  projectId: string,
  facilityId: string,
  fields: SpecificationItemFields,
): Promise<ActionResult> {
  const allowed = await requireFacilityEditor(projectId, facilityId);
  if (!allowed.ok) return allowed;

  const validated = validate(fields);
  if (!validated.ok) return validated;

  await prisma.specificationItem.create({
    data: {
      facilityId,
      ...validated.value,
      position: await nextPosition(facilityId),
    },
  });

  revalidateFacilities(projectId, facilityId);

  return { ok: true };
}

export async function updateSpecificationItem(
  projectId: string,
  facilityId: string,
  id: string,
  fields: SpecificationItemFields,
): Promise<ActionResult> {
  const allowed = await requireFacilityEditor(projectId, facilityId);
  if (!allowed.ok) return allowed;

  const validated = validate(fields);
  if (!validated.ok) return validated;

  /// facilityId в условии, а не только id: иначе, зная id чужой позиции, её
  /// можно было бы изменить через свой объект.
  const updated = await prisma.specificationItem.updateMany({
    where: { id, facilityId },
    data: validated.value,
  });

  if (updated.count === 0) {
    return { ok: false, error: 'Позиция не найдена' };
  }

  revalidateFacilities(projectId, facilityId);

  return { ok: true };
}

export async function deleteSpecificationItem(
  projectId: string,
  facilityId: string,
  id: string,
): Promise<ActionResult> {
  const allowed = await requireFacilityEditor(projectId, facilityId);
  if (!allowed.ok) return allowed;

  /// facilityId в условии по той же причине, что и в updateSpecificationItem.
  const deleted = await prisma.specificationItem.deleteMany({
    where: { id, facilityId },
  });

  if (deleted.count === 0) {
    return { ok: false, error: 'Позиция не найдена' };
  }

  revalidateFacilities(projectId, facilityId);

  return { ok: true };
}
