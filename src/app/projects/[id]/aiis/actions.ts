'use server';

import {
  isProjectFacility,
  nextFacilityPosition,
  nextPointPosition,
  revalidateFacilities,
} from '@/lib/facilities';
import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type MeasurementPointFields = {
  /// Как точка подписана на объекте. Единственное обязательное поле: без
  /// названия точку в списке ни от чего не отличить.
  name: string;
  /// Модель прибора учёта может быть ещё не выбрана: пустое поле формы доходит
  /// до базы как null.
  meterModel: string;
  /// Заводской номер прибора учёта — так же, как модель: пустое поле формы
  /// доходит до базы как null.
  meterNumber: string;
  /// Где именно стоит прибор учёта — так же, как модель и номер.
  meterLocation: string;
  /// Объект, за которым точка закреплена. Пустая строка — «Без объекта»: точки
  /// заводят и до того, как объекты разложены.
  facilityId: string;
};

/// То же, но уже разобранное: пустые строки — null, как в базе.
type ValidatedPoint = {
  name: string;
  meterModel: string | null;
  meterNumber: string | null;
  meterLocation: string | null;
  facilityId: string | null;
};

/// Проверка полей точки вместе с объектом: facilityId приходит из браузера,
/// поэтому мало разобрать строку — нужно убедиться, что объект из этого
/// проекта. Иначе точку можно было бы закрепить за чужим.
async function validatePoint(
  projectId: string,
  fields: MeasurementPointFields,
): Promise<{ ok: true; value: ValidatedPoint } | { ok: false; error: string }> {
  const name = fields.name.trim();

  if (!name) return { ok: false, error: 'Укажите наименование точки' };

  const facilityId = fields.facilityId || null;

  if (facilityId && !(await isProjectFacility(projectId, facilityId))) {
    return { ok: false, error: 'Объект не найден' };
  }

  return {
    ok: true,
    value: {
      name,
      meterModel: fields.meterModel.trim() || null,
      meterNumber: fields.meterNumber.trim() || null,
      meterLocation: fields.meterLocation.trim() || null,
      facilityId,
    },
  };
}

export async function addMeasurementPoint(
  projectId: string,
  fields: MeasurementPointFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const validated = await validatePoint(projectId, fields);
  if (!validated.ok) return validated;

  await prisma.measurementPoint.create({
    data: {
      projectId,
      ...validated.value,
      position: await nextPointPosition(projectId, validated.value.facilityId),
    },
  });

  revalidateFacilities(projectId);

  return { ok: true };
}

export async function updateMeasurementPoint(
  projectId: string,
  id: string,
  fields: MeasurementPointFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const validated = await validatePoint(projectId, fields);
  if (!validated.ok) return validated;

  /// projectId в условии, а не только id: иначе, зная id чужой точки, её можно
  /// было бы изменить через свой проект.
  const point = await prisma.measurementPoint.findFirst({
    where: { id, projectId },
    select: { facilityId: true },
  });

  if (!point) return { ok: false, error: 'Точка учёта не найдена' };

  /// Нумерация у каждого объекта своя, поэтому переехавшая точка встаёт в конец
  /// нового объекта: со старым номером она попала бы в середину чужого списка.
  const moved = point.facilityId !== validated.value.facilityId;

  await prisma.measurementPoint.update({
    where: { id },
    data: {
      ...validated.value,
      ...(moved && {
        position: await nextPointPosition(
          projectId,
          validated.value.facilityId,
        ),
      }),
    },
  });

  revalidateFacilities(projectId);

  return { ok: true };
}

/// Перенести сразу несколько точек на объект (или снять с объекта: пустой
/// facilityId — «Без объекта»). Так точки и собираются в объекты: их набирают
/// по проекту списком, а раскладывают потом пачками — по одной это десятки
/// правок.
export async function moveMeasurementPoints(
  projectId: string,
  ids: string[],
  facilityId: string,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (ids.length === 0) return { ok: false, error: 'Выберите точки' };

  const target = facilityId || null;

  if (target && !(await isProjectFacility(projectId, target))) {
    return { ok: false, error: 'Объект не найден' };
  }

  /// projectId в условии: id точек приходят из браузера, и без него чужие
  /// точки можно было бы перетащить в свой проект. Порядок — тот же, в каком
  /// точки видно на странице: в новом объекте они встанут так же.
  const points = await prisma.measurementPoint.findMany({
    where: { id: { in: ids }, projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, facilityId: true },
  });

  if (points.length !== ids.length) {
    return { ok: false, error: 'Часть точек не найдена' };
  }

  /// Точки, уже стоящие на нужном объекте, пропускаем: иначе перенос «на
  /// месте» перенумеровал бы их в конец и переставил бы список.
  const moving = points.filter((point) => point.facilityId !== target);

  if (moving.length === 0) return { ok: true };

  const start = await nextPointPosition(projectId, target);

  /// Одной транзакцией: на середине переноса список не должен оставаться
  /// наполовину разложенным.
  await prisma.$transaction(
    moving.map((point, index) =>
      prisma.measurementPoint.update({
        where: { id: point.id },
        data: { facilityId: target, position: start + index },
      }),
    ),
  );

  revalidateFacilities(projectId);

  return { ok: true };
}

export async function deleteMeasurementPoint(
  projectId: string,
  id: string,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  /// projectId в условии по той же причине, что и в updateMeasurementPoint.
  const deleted = await prisma.measurementPoint.deleteMany({
    where: { id, projectId },
  });

  if (deleted.count === 0) {
    return { ok: false, error: 'Точка учёта не найдена' };
  }

  revalidateFacilities(projectId);

  return { ok: true };
}

export type FacilityFields = {
  /// Название объекта. Единственное обязательное поле: без него объект в
  /// списке ни от чего не отличить.
  name: string;
  /// Что на объекте есть сейчас. Дописывают позже: пустое поле формы доходит
  /// до базы пустой строкой, отдельного «описания нет» в базе не бывает.
  currentDescription: string;
  /// Что на объекте делаем. Пустое поле — по той же причине, что и описание.
  technicalSolution: string;
};

function validateFacility(
  fields: FacilityFields,
): { ok: true; value: FacilityFields } | { ok: false; error: string } {
  const name = fields.name.trim();

  if (!name) return { ok: false, error: 'Укажите название объекта' };

  return {
    ok: true,
    value: {
      name,
      currentDescription: fields.currentDescription.trim(),
      technicalSolution: fields.technicalSolution.trim(),
    },
  };
}

/// Имя объекта уникально внутри проекта (см. @@unique в схеме): повтор — не
/// ошибка ввода, а попытка завести вторую группу с тем же именем, и точки
/// разошлись бы по ним незаметно. Проверяем до записи, чтобы ответить текстом,
/// а не исключением Prisma.
async function isNameTaken(
  projectId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await prisma.facility.findFirst({
    where: { projectId, name, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });

  return existing !== null;
}

export async function addFacility(
  projectId: string,
  fields: FacilityFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const validated = validateFacility(fields);
  if (!validated.ok) return validated;

  if (await isNameTaken(projectId, validated.value.name)) {
    return { ok: false, error: 'Такой объект уже есть' };
  }

  await prisma.facility.create({
    data: {
      projectId,
      ...validated.value,
      position: await nextFacilityPosition(projectId),
    },
  });

  revalidateFacilities(projectId);

  return { ok: true };
}

export async function updateFacility(
  projectId: string,
  id: string,
  fields: FacilityFields,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const validated = validateFacility(fields);
  if (!validated.ok) return validated;

  if (await isNameTaken(projectId, validated.value.name, id)) {
    return { ok: false, error: 'Такой объект уже есть' };
  }

  /// projectId в условии, а не только id: иначе, зная id чужого объекта, его
  /// можно было бы изменить через свой проект.
  const updated = await prisma.facility.updateMany({
    where: { id, projectId },
    data: validated.value,
  });

  if (updated.count === 0) return { ok: false, error: 'Объект не найден' };

  revalidateFacilities(projectId);

  return { ok: true };
}

/// Точки удалённого объекта остаются в проекте и переходят в группу «Без
/// объекта» (onDelete: SetNull в схеме): их набирали руками, и перекройка
/// объектов не повод их терять. Спецификация, наоборот, уходит вместе с
/// объектом (onDelete: Cascade): вне объекта позиция ничего не значит.
/// Сколько точек открепится и сколько позиций пропадёт, спрашивает список —
/// здесь уже поздно.
export async function deleteFacility(
  projectId: string,
  id: string,
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  /// projectId в условии по той же причине, что и в updateFacility.
  const deleted = await prisma.facility.deleteMany({
    where: { id, projectId },
  });

  if (deleted.count === 0) return { ok: false, error: 'Объект не найден' };

  revalidateFacilities(projectId);

  return { ok: true };
}
