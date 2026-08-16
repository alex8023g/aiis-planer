import { prisma } from '@/lib/prisma';
import { defaultStageDependencies, stageKeys } from '@/lib/stages';
import type { Project, Stage, Stages, TaskStatus } from '@/lib/types';

/// Колонка dateStart имеет тип DATE, время в ней всегда полночь UTC.
function toDateString(date: Date): Project['dateStart'] {
  return date.toISOString().slice(0, 10) as Project['dateStart'];
}

export async function getProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      stages: {
        include: {
          subtasks: { orderBy: { position: 'asc' } },
          startAfterStage: { select: { kind: true } },
        },
      },
    },
  });

  return rows.map((row) => {
    const stages = Object.fromEntries(
      stageKeys.map((key) => [key, null]),
    ) as Record<keyof Stages, Stage | null>;

    for (const stage of row.stages) {
      /// Своя зависимость важнее умолчания; если её нет, берём общее правило
      /// для этого этапа. Планировщик сам откатится на последовательный
      /// порядок, когда этап-зависимость в проект не входит.
      const startAfter = stage.startAfterStage
        ? {
            stage: stage.startAfterStage.kind,
            subtask: stage.startAfterSubtask ?? undefined,
          }
        : defaultStageDependencies[stage.kind];

      stages[stage.kind] = {
        duration: stage.duration,
        ...(startAfter && { startAfter }),
        subtasks: Object.fromEntries(
          stage.subtasks.map((subtask) => [
            subtask.key,
            subtask.status as TaskStatus | null,
          ]),
        ),
      };
    }

    return {
      id: row.id,
      name: row.name,
      responsible: row.responsible,
      duration: row.duration,
      dateStart: toDateString(row.dateStart),
      stages: stages as Stages,
    };
  });
}
