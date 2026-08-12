import { stageLabels } from '@/lib/stages';
import { TaskStatus, type Project, type Stage, type Stages } from '@/lib/types';

export const statusStyles: Record<
  TaskStatus,
  { bar: string; dot: string; label: string }
> = {
  [TaskStatus.Completed]: {
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    label: 'Завершено',
  },
  [TaskStatus.InProgress]: {
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    label: 'В работе',
  },
  [TaskStatus.NotStarted]: {
    bar: 'bg-neutral-300 dark:bg-neutral-700',
    dot: 'bg-neutral-300 dark:bg-neutral-700',
    label: 'Не начато',
  },
};

const statusWeight: Record<TaskStatus, number> = {
  [TaskStatus.Completed]: 1,
  [TaskStatus.InProgress]: 0.5,
  [TaskStatus.NotStarted]: 0,
};

function prettify(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function subtaskEndOffset(
  stageOffset: number,
  stage: Stage,
  subtaskKey: string,
): number {
  const keys = Object.entries(stage.subtasks)
    .filter(([, status]) => status != null)
    .map(([name]) => name);
  const index = keys.indexOf(subtaskKey);
  if (index < 0) return stageOffset + stage.duration;
  const share = stage.duration / keys.length;
  return stageOffset + (index + 1) * share;
}

export function ProjectGantt({ project }: { project: Project }) {
  // Widen the per-stage literal types to the common Stage shape so the
  // scheduling code below can treat every stage uniformly.
  const stageEntries: [string, Stage | null | undefined][] = Object.entries(
    project.stages,
  );
  const stages = stageEntries.filter(
    (entry): entry is [string, Stage] => entry[1] != null,
  );

  // Resolve each stage's start: either after a dependency's subtask/stage,
  // or chained after the previous stage. Stages may overlap as a result.
  const offsets: Record<string, number> = {};
  let elapsed = 0;
  for (const [key, stage] of stages) {
    let offset = elapsed;
    if (stage.startAfter) {
      const depOffset = offsets[stage.startAfter.stage];
      const depStage = project.stages[stage.startAfter.stage];
      if (depOffset !== undefined && depStage) {
        offset = stage.startAfter.subtask
          ? subtaskEndOffset(depOffset, depStage, stage.startAfter.subtask)
          : depOffset + depStage.duration;
      }
    }
    offsets[key] = offset;
    elapsed = offset + stage.duration;
  }

  const totalDuration = stages.reduce(
    (max, [key, stage]) => Math.max(max, offsets[key] + stage.duration),
    0,
  );

  const rows = stages.map(([key, stage]) => {
    const subtasks = Object.entries(stage.subtasks).filter(
      (entry): entry is [string, TaskStatus] => entry[1] != null,
    );
    const progress =
      subtasks.reduce((sum, [, status]) => sum + statusWeight[status], 0) /
      subtasks.length;

    return { key, stage, offset: offsets[key], subtasks, progress };
  });

  const totalWork = rows.reduce((sum, r) => sum + r.stage.duration, 0);
  const totalProgress =
    rows.reduce((sum, r) => sum + r.progress * r.stage.duration, 0) / totalWork;

  return (
    <section className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='mb-4 flex items-baseline justify-between gap-4'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {project.name} {project.responsible && `- ${project.responsible} `}
          {'- '}
          {project.dateStart}
        </h2>
        <p className='shrink-0 text-sm text-neutral-500 dark:text-neutral-400'>
          {totalDuration} дн. (Σ {totalWork} дн.) ·{' '}
          {Math.round(totalProgress * 100)}%
        </p>
      </div>

      <div className='/h-9 /border mb-4'>
        <div className='inset-y-0 ml-36 flex gap-px overflow-hidden rounded-md border'>
          {/* totalDuration line */}
          <div className='/mb-4 /border flex w-full gap-px'>
            {Array.from({ length: totalDuration }, (_, i) => (
              <div
                key={i}
                className='h-3 flex-1 rounded-sm bg-neutral-200 dark:bg-neutral-800'
              />
            ))}
          </div>
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        {rows.map(({ key, stage, offset, subtasks, progress }) => (
          <div
            key={key}
            className='grid grid-cols-[8rem_1fr] items-center gap-4'
          >
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>
                {stageLabels[key as keyof Stages] ?? prettify(key)}
              </p>
              <p className='text-xs text-neutral-400 dark:text-neutral-500'>
                {stage.duration} дн. · {Math.round(progress * 100)}%
              </p>
            </div>

            <div className='relative h-9'>
              <div
                className='absolute inset-y-0 flex gap-px overflow-hidden rounded-md'
                style={{
                  left: `${(offset / totalDuration) * 100}%`,
                  width: `${(stage.duration / totalDuration) * 100}%`,
                }}
              >
                {subtasks.map(([name, status]) => (
                  <div
                    key={name}
                    title={`${prettify(name)} — ${statusStyles[status].label}`}
                    className={`flex-1 ${statusStyles[status].bar}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
