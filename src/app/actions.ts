'use server';

import { revalidatePath } from 'next/cache';

import type { StageKind, SubtaskKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { stageKeys, stageLabels, stageSubtaskKeys } from '@/lib/stages';
import type { NewProjectFormFields } from '@/lib/stages';
import type { Stages } from '@/lib/types';

export type CreateProjectResult =
  { ok: true; id: string } | { ok: false; error: string };

export type UpdateProjectResult = { ok: true } | { ok: false; error: string };

export type DeleteProjectResult = { ok: true } | { ok: false; error: string };

type ValidatedFields = {
  name: string;
  responsible: string | null;
  dateStart: Date;
  duration: number;
  includedStages: (keyof Stages)[];
};

/// Общая проверка формы для создания и редактирования.
function validate(
  fields: NewProjectFormFields,
): { ok: true; value: ValidatedFields } | { ok: false; error: string } {
  const name = fields.name.trim();
  const responsible = fields.responsible.trim();

  if (!name || !fields.dateStart) {
    return { ok: false, error: 'Заполните название и дату начала' };
  }

  const duration = Math.trunc(fields.duration);

  if (!Number.isFinite(duration) || duration < 1) {
    return { ok: false, error: 'Укажите длительность проекта' };
  }

  const includedStages = stageKeys.filter((key) => fields.stages[key].include);

  if (includedStages.length === 0) {
    return { ok: false, error: 'Выберите хотя бы один этап' };
  }

  /// Этап без применимых подзадач ломает расчёт прогресса (деление на ноль).
  const emptyStage = includedStages.find((key) =>
    stageSubtaskKeys[key].every(
      (subtaskKey) =>
        (fields.stages[key].subtasks[subtaskKey] ?? null) === null,
    ),
  );

  if (emptyStage) {
    return {
      ok: false,
      error: `Этап «${stageLabels[emptyStage]}»: выберите хотя бы одну подзадачу`,
    };
  }

  return {
    ok: true,
    value: {
      name,
      responsible: responsible || null,
      dateStart: new Date(`${fields.dateStart}T00:00:00.000Z`),
      duration,
      includedStages,
    },
  };
}

/// Снятая галка — подзадача неприменима: строка всё равно создаётся, но со
/// status = null, чтобы сохранить порядок подзадач этапа.
function subtaskRows(fields: NewProjectFormFields, key: keyof Stages) {
  return stageSubtaskKeys[key].map((subtaskKey, position) => ({
    key: subtaskKey as SubtaskKey,
    status: fields.stages[key].subtasks[subtaskKey] ?? null,
    position,
  }));
}

export async function createProject(
  fields: NewProjectFormFields,
): Promise<CreateProjectResult> {
  const validated = validate(fields);

  if (!validated.ok) {
    return validated;
  }

  const { name, responsible, dateStart, duration, includedStages } =
    validated.value;

  const project = await prisma.project.create({
    data: {
      name,
      responsible,
      dateStart,
      duration,
      stages: {
        create: includedStages.map((key) => ({
          kind: key,
          duration: fields.stages[key].duration,
          subtasks: { create: subtaskRows(fields, key) },
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath('/');

  return { ok: true, id: project.id };
}

/// Этапы обновляются на месте (upsert по [projectId, kind]), а не пересоздаются:
/// пересоздание сбросило бы ссылки startAfterStageId других этапов.
export async function updateProject(
  id: string,
  fields: NewProjectFormFields,
): Promise<UpdateProjectResult> {
  const validated = validate(fields);

  if (!validated.ok) {
    return validated;
  }

  const { name, responsible, dateStart, duration, includedStages } =
    validated.value;

  const exists = await prisma.project.count({ where: { id } });

  if (exists === 0) {
    return { ok: false, error: 'Проект не найден' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { name, responsible, dateStart, duration },
    });

    /// Этапы, с которых сняли галку, удаляются вместе с подзадачами (каскад).
    await tx.stage.deleteMany({
      where: {
        projectId: id,
        kind: { notIn: includedStages as StageKind[] },
      },
    });

    for (const key of includedStages) {
      const stage = await tx.stage.upsert({
        where: { projectId_kind: { projectId: id, kind: key } },
        create: {
          projectId: id,
          kind: key,
          duration: fields.stages[key].duration,
        },
        update: { duration: fields.stages[key].duration },
        select: { id: true },
      });

      for (const row of subtaskRows(fields, key)) {
        await tx.subtask.upsert({
          where: { stageId_key: { stageId: stage.id, key: row.key } },
          create: { stageId: stage.id, ...row },
          update: { status: row.status, position: row.position },
        });
      }
    }
  });

  revalidatePath('/');

  return { ok: true };
}

/// Этапы и подзадачи удаляются каскадом (см. onDelete: Cascade в schema.prisma).
export async function deleteProject(id: string): Promise<DeleteProjectResult> {
  const deleted = await prisma.project.deleteMany({ where: { id } });

  if (deleted.count === 0) {
    return { ok: false, error: 'Проект не найден' };
  }

  revalidatePath('/');

  return { ok: true };
}
