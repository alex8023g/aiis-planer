'use server';

import type { Prisma } from '@/generated/prisma/client';
import { revalidatePoints } from '@/lib/points';
import { prisma } from '@/lib/prisma';
import { requireProjectEditor } from '@/lib/projects';
import type { ActionResult } from '@/lib/types';

export type DraftPoint = {
  name: string;
  /// Имя объекта, как его вставили из таблицы. Пустое — точка пока без объекта.
  /// Ищем по имени, а не по id: из буфера приходит текст, id знать неоткуда.
  facility: string;
  meterModel: string;
  meterNumber: string;
};

/// Правка уже сохранённой точки: только те поля, которые вставили. Остальные
/// не трогаем — вставка блока накрывает не всю строку.
export type PointChange = { id: string } & Partial<DraftPoint>;

/// Пустые строки в конце вставленной колонки — обычное дело, и строка без
/// наименования смысла не имеет: такие пропускаем молча.
function isBlank(draft: DraftPoint): boolean {
  return (
    !draft.name.trim() &&
    !draft.facility.trim() &&
    !draft.meterModel.trim() &&
    !draft.meterNumber.trim()
  );
}

/// Имена объектов проекта в id: чего нет — заводим тут же. Раз имя набрали или
/// вставили, объект нужен; отказ вместо создания заставлял бы бросать таблицу и
/// идти заводить объект отдельно. Ищем без учёта регистра и лишних пробелов: из
/// Excel имена приходят как их набрали, и «ТП-1» с «тп-1 » — один объект.
///
/// Работает внутри транзакции вызывающего: если запись точек не удастся, новые
/// объекты не останутся висеть пустыми.
async function facilityIds(
  tx: Prisma.TransactionClient,
  projectId: string,
  names: string[],
): Promise<Map<string, string>> {
  const existing = await tx.facility.findMany({
    where: { projectId },
    select: { id: true, name: true, position: true },
  });
  const byName = new Map(
    existing.map((facility) => [
      facility.name.trim().toLowerCase(),
      facility.id,
    ]),
  );

  /// Новые объекты идут в конец списка, в порядке появления имён.
  let position =
    existing.reduce((max, facility) => Math.max(max, facility.position), -1) +
    1;

  for (const raw of names) {
    const name = raw.trim();

    if (!name || byName.has(name.toLowerCase())) continue;

    const created = await tx.facility.create({
      data: { projectId, name, position: position++ },
      select: { id: true },
    });

    byName.set(name.toLowerCase(), created.id);
  }

  return byName;
}

export async function saveMeasurementPoints(
  projectId: string,
  drafts: DraftPoint[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const rows = drafts.filter((draft) => !isBlank(draft));

  if (rows.length === 0) return { ok: false, error: 'Нечего сохранять' };

  if (rows.some((row) => !row.name.trim())) {
    return { ok: false, error: 'У каждой точки должно быть наименование' };
  }

  /// Порядок точек сквозной по проекту, поэтому новые встают в конец списка.
  const last = await prisma.measurementPoint.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  let position = (last._max.position ?? -1) + 1;

  /// Недостающие объекты и сами точки — одной транзакцией: иначе при сбое
  /// записи остались бы пустые объекты, которых никто не заводил.
  await prisma.$transaction(async (tx) => {
    const byName = await facilityIds(
      tx,
      projectId,
      rows.map((row) => row.facility),
    );

    const data = rows.map((row) => {
      const facilityId = row.facility.trim()
        ? (byName.get(row.facility.trim().toLowerCase()) ?? null)
        : null;

      return {
        projectId,
        facilityId,
        name: row.name.trim(),
        meterModel: row.meterModel.trim() || null,
        meterNumber: row.meterNumber.trim() || null,
        position: position++,
      };
    });

    await tx.measurementPoint.createMany({ data });
  });

  revalidatePoints(projectId);

  return { ok: true };
}

/// Удалить сохранённые точки. Черновики сюда не попадают — их убирает сама
/// таблица, в базе их ещё нет.
export async function deleteMeasurementPoints(
  projectId: string,
  ids: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (ids.length === 0) return { ok: false, error: 'Нечего удалять' };

  /// projectId в условии, а не только id: иначе, зная id чужой точки, её можно
  /// было бы удалить через свой проект.
  const deleted = await prisma.measurementPoint.deleteMany({
    where: { id: { in: ids }, projectId },
  });

  if (deleted.count === 0) return { ok: false, error: 'Точки не найдены' };

  revalidatePoints(projectId);

  return { ok: true };
}

/// Правка сохранённых точек: вставили блок поверх строк, которые уже в базе.
/// Меняем только пришедшие поля — остальные в блок могли не попасть.
export async function updateMeasurementPoints(
  projectId: string,
  changes: PointChange[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (changes.length === 0) return { ok: false, error: 'Нечего менять' };

  if (
    changes.some((change) => change.name !== undefined && !change.name.trim())
  ) {
    return { ok: false, error: 'У каждой точки должно быть наименование' };
  }

  /// projectId в условии, а не только id: иначе, зная id чужой точки, её можно
  /// было бы изменить через свой проект.
  const points = await prisma.measurementPoint.count({
    where: { id: { in: changes.map((change) => change.id) }, projectId },
  });

  if (points !== changes.length) {
    return { ok: false, error: 'Часть точек не найдена' };
  }

  /// Недостающие объекты и правки — одной транзакцией: иначе при сбое правки
  /// остались бы пустые объекты, которых никто не заводил.
  await prisma.$transaction(async (tx) => {
    const byName = await facilityIds(
      tx,
      projectId,
      changes.map((change) => change.facility ?? ''),
    );

    const updates = changes.map((change) => {
      const data: {
        name?: string;
        meterModel?: string | null;
        meterNumber?: string | null;
        facilityId?: string | null;
      } = {};

      if (change.name !== undefined) data.name = change.name.trim();

      if (change.meterModel !== undefined) {
        data.meterModel = change.meterModel.trim() || null;
      }

      if (change.meterNumber !== undefined) {
        data.meterNumber = change.meterNumber.trim() || null;
      }

      /// Место строки в списке от объекта не зависит, поэтому меняем только
      /// сам объект: строка остаётся там, где стояла.
      if (change.facility !== undefined) {
        const name = change.facility.trim();

        data.facilityId = name
          ? (byName.get(name.toLowerCase()) ?? null)
          : null;
      }

      return { id: change.id, data };
    });

    /// На середине вставки таблица не должна оставаться наполовину изменённой.
    for (const update of updates) {
      if (Object.keys(update.data).length === 0) continue;

      await tx.measurementPoint.update({
        where: { id: update.id },
        data: update.data,
      });
    }
  });

  revalidatePoints(projectId);

  return { ok: true };
}

/// Переставить точки проекта: клиент присылает полный порядок строк после
/// перетаскивания, сервер переписывает номера подряд. Полный список, а не
/// «поставить туда-то»: так порядок задаётся ровно тем, что видно на экране, и
/// не зависит от того, как сложились номера раньше. Объекты строк при этом не
/// меняются — перетаскивание задаёт только порядок.
export async function reorderMeasurementPoints(
  projectId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (orderedIds.length === 0) {
    return { ok: false, error: 'Нечего переставлять' };
  }

  /// projectId в условии: id строк приходят из браузера.
  const found = await prisma.measurementPoint.count({
    where: { id: { in: orderedIds }, projectId },
  });

  if (found !== orderedIds.length) {
    return { ok: false, error: 'Часть точек не найдена' };
  }

  /// Точки проекта, которых нет в присланном порядке, — признак того, что
  /// страницу успели изменить в другом окне. Молча переставлять в такой
  /// ситуации нельзя: часть строк осталась бы с чужими номерами.
  const missing = await prisma.measurementPoint.count({
    where: { projectId, id: { notIn: orderedIds } },
  });

  if (missing > 0) {
    return { ok: false, error: 'Список строк устарел, обновите страницу' };
  }

  /// Одной транзакцией: половина переставленных строк хуже, чем ни одной.
  await prisma.$transaction(
    orderedIds.map((id, position) =>
      prisma.measurementPoint.update({ where: { id }, data: { position } }),
    ),
  );

  revalidatePoints(projectId);

  return { ok: true };
}

/// Завести объект и сразу отдать ему выбранные точки. Одним экшеном, а не
/// «создать объект, потом перенести»: на середине этой пары объект остался бы
/// пустым, а строки — без объекта, и пользователь не понял бы, что случилось.
export async function createFacilityWithPoints(
  projectId: string,
  name: string,
  ids: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  const trimmed = name.trim();

  if (!trimmed) return { ok: false, error: 'Укажите название объекта' };

  /// Имя объекта уникально внутри проекта (см. @@unique в схеме). Проверяем до
  /// записи, чтобы ответить текстом, а не исключением Prisma.
  const facilities = await prisma.facility.findMany({
    where: { projectId },
    select: { name: true },
  });

  if (
    facilities.some(
      (facility) =>
        facility.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return { ok: false, error: 'Такой объект уже есть' };
  }

  /// projectId в условии: id строк приходят из браузера.
  const points = await prisma.measurementPoint.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true },
  });

  if (points.length !== ids.length) {
    return { ok: false, error: 'Часть точек не найдена' };
  }

  const last = await prisma.facility.aggregate({
    where: { projectId },
    _max: { position: true },
  });

  await prisma.$transaction(async (tx) => {
    const facility = await tx.facility.create({
      data: {
        projectId,
        name: trimmed,
        position: (last._max.position ?? -1) + 1,
      },
      select: { id: true },
    });

    /// Меняем только объект: место строки в списке задаёт перетаскивание.
    await tx.measurementPoint.updateMany({
      where: { id: { in: ids }, projectId },
      data: { facilityId: facility.id },
    });
  });

  revalidatePoints(projectId);

  return { ok: true };
}

/// Удалить объекты. Точки при этом остаются в проекте и оказываются без
/// объекта (onDelete: SetNull в схеме): их набирали руками, и перекройка
/// объектов не повод их терять. Сколько точек так открепится, спрашивает
/// таблица — здесь уже поздно.
export async function deleteFacilities(
  projectId: string,
  ids: string[],
): Promise<ActionResult> {
  const allowed = await requireProjectEditor(projectId);
  if (!allowed.ok) return allowed;

  if (ids.length === 0) return { ok: false, error: 'Нечего удалять' };

  /// projectId в условии, а не только id: иначе, зная id чужого объекта, его
  /// можно было бы удалить через свой проект.
  const deleted = await prisma.facility.deleteMany({
    where: { id: { in: ids }, projectId },
  });

  if (deleted.count === 0) return { ok: false, error: 'Объекты не найдены' };

  revalidatePoints(projectId);

  return { ok: true };
}
