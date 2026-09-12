import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { getDaysOff } from '@/lib/dayoff';
import { canEditProject, getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import {
  stageKeys,
  stageLabels,
  stageSubtaskKeys,
  subtaskLabels,
} from '@/lib/stages';
import type { Stage, Stages, TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

/// Зависимость этапа словами: «после ППО» или «после ППО — Спецификация».
function dependencyText(stage: Stage): string | null {
  if (!stage.startAfter) return null;

  const { stage: depStage, subtask } = stage.startAfter;
  const label = stageLabels[depStage];

  return subtask
    ? `после: ${label} — ${subtaskLabels[subtask] ?? subtask}`
    : `после: ${label}`;
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  /// Ни для отсутствующего проекта, ни для недоступного (pending) — один и тот
  /// же ответ: по разнице можно было бы перебором узнать чужие id.
  if (!project) notFound();

  const daysOff = await getDaysOff();
  const canEdit = canEditProject(project, user);
  /// Порядок этапов — из stageKeys: тот же, в котором они идут на графике и в
  /// форме. Общий тип Stage вместо литеральных типов каждого этапа — иначе
  /// подзадачи ниже не перебрать одним кодом (так же сделано в ProjectGantt).
  const stageEntries = stageKeys.map(
    (key) =>
      [key, project.stages[key]] as [keyof Stages, Stage | null | undefined],
  );
  const stages = stageEntries.filter(
    (entry): entry is [keyof Stages, Stage] => entry[1] != null,
  );

  const skipped = stageKeys.filter((key) => !project.stages[key]);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} current='project' title={project.name} />
      <main className='mx-auto flex flex-col gap-6 p-6 sm:p-10'>
        <ProjectGantt
          project={project}
          daysOff={daysOff}
          canEdit={canEdit}
          /// С удалённого проекта возвращаемся к списку: смотреть тут уже
          /// нечего.
          deleteRedirect='/projects'
        />

        <section className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-4 text-lg font-semibold tracking-tight'>Этапы</h2>

          <div className='flex flex-col gap-4'>
            {stages.map(([key, stage]) => {
              /// null у подзадачи — она к проекту неприменима, на графике её
              /// тоже нет.
              const subtasks = stageSubtaskKeys[key]
                .map((subtaskKey) => [subtaskKey, stage.subtasks[subtaskKey]])
                .filter(
                  (entry): entry is [string, TaskStatus] => entry[1] != null,
                );
              const dependency = dependencyText(stage);

              return (
                <div
                  key={key}
                  className='rounded-lg border border-neutral-200 p-3 dark:border-neutral-800'
                >
                  <div className='mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                    <h3 className='font-medium'>{stageLabels[key]}</h3>
                    <span className='text-xs text-neutral-500 dark:text-neutral-400'>
                      {stage.duration} р.д.
                      {dependency && ` · ${dependency}`}
                    </span>
                  </div>

                  <ul className='flex flex-col gap-1'>
                    {subtasks.map(([subtaskKey, status]) => (
                      <li
                        key={subtaskKey}
                        className='flex items-center gap-2 text-sm'
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-sm ${statusStyles[status].dot}`}
                        />
                        <span>{subtaskLabels[subtaskKey] ?? subtaskKey}</span>
                        <span className='text-xs text-neutral-500 dark:text-neutral-400'>
                          {statusStyles[status].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Не вошедшие этапы перечислены отдельно: иначе непонятно, этап
              забыли или он проекту не нужен. */}
          {skipped.length > 0 && (
            <p className='mt-4 text-xs text-neutral-500 dark:text-neutral-400'>
              Не входят в проект:{' '}
              {skipped.map((key) => stageLabels[key]).join(', ')}
            </p>
          )}
        </section>

        <section className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-4 text-lg font-semibold tracking-tight'>Доступ</h2>

          <dl className='grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]'>
            <dt className='text-neutral-500 dark:text-neutral-400'>
              Ответственный
            </dt>
            <dd>{project.responsible ?? '—'}</dd>

            <dt className='text-neutral-500 dark:text-neutral-400'>
              Дата начала
            </dt>
            <dd>{project.dateStart}</dd>

            <dt className='text-neutral-500 dark:text-neutral-400'>
              Длительность
            </dt>
            <dd>{project.duration} р.д.</dd>

            <dt className='text-neutral-500 dark:text-neutral-400'>
              Могут менять
            </dt>
            <dd>
              {/* Плюс любой администратор — его в списке доступа нет, но
                  проект он менять может (см. canEditProject). */}
              {project.members.length > 0 ? project.members.join(', ') : '—'}
            </dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
