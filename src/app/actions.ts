'use server';

import { revalidatePath } from 'next/cache';

import type { SubtaskKey } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { stageKeys, stageSubtaskKeys } from '@/lib/stages';
import type { NewProjectFormFields } from '@/lib/stages';
import { TaskStatus } from '@/lib/types';

export type CreateProjectResult =
  { ok: true; id: string } | { ok: false; error: string };

export type DeleteProjectResult = { ok: true } | { ok: false; error: string };

export async function createProject(
  fields: NewProjectFormFields,
): Promise<CreateProjectResult> {
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

  const project = await prisma.project.create({
    data: {
      name,
      responsible: responsible || null,
      dateStart: new Date(`${fields.dateStart}T00:00:00.000Z`),
      duration,
      stages: {
        create: includedStages.map((key) => ({
          kind: key,
          duration: fields.stages[key].duration,
          subtasks: {
            create: stageSubtaskKeys[key].map((subtaskKey, position) => ({
              key: subtaskKey as SubtaskKey,
              status: TaskStatus.NotStarted,
              position,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath('/');

  return { ok: true, id: project.id };
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
