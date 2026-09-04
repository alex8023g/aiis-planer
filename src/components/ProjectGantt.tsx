import dayjs, { type Dayjs } from 'dayjs';
import dayOfYear from 'dayjs/plugin/dayOfYear';
import utc from 'dayjs/plugin/utc';
import Link from 'next/link';

import { ProjectMenu } from '@/components/ProjectMenu';
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

dayjs.extend(utc);
dayjs.extend(dayOfYear);

/// В календаре isdayoff.ru '1' — выходной, остальные цифры ('0' рабочий,
/// '2' сокращённый) считаем рабочим днём. Дни вне календарного года календарём
/// не покрыты, поэтому считаем их рабочими.
function isWorkday(
  date: Dayjs,
  daysOff: string,
  calendarYear: number,
): boolean {
  if (date.year() !== calendarYear) return true;
  return daysOff[date.dayOfYear() - 1] !== '1';
}

/// Сколько рабочих дней проекта уже прошло: от dateStart (день 1) до сегодня
/// включительно, выходные по календарю не в счёт. Даты берём в UTC, чтобы
/// часовой пояс не сдвигал результат.
function elapsedDays(dateStart: Project['dateStart'], daysOff: string): number {
  const start = dayjs.utc(dateStart);
  if (!start.isValid()) return 0;

  const today = dayjs.utc(dayjs().format('YYYY-MM-DD'));
  const calendarYear = today.year();

  let count = 0;
  for (let day = start; !day.isAfter(today); day = day.add(1, 'day')) {
    if (isWorkday(day, daysOff, calendarYear)) count += 1;
  }

  return count;
}

/// Дата окончания: день, на который приходится duration-й рабочий день, считая
/// dateStart первым. Календарь тот же, что и в elapsedDays, поэтому дни за
/// пределами его года считаются рабочими.
function finishDate(
  dateStart: Project['dateStart'],
  duration: number,
  daysOff: string,
): string | null {
  const start = dayjs.utc(dateStart);
  if (!start.isValid() || duration < 1) return null;

  const calendarYear = dayjs.utc(dayjs().format('YYYY-MM-DD')).year();

  let count = 0;
  let day = start;
  /// Запас на выходные: рабочих дней в неделе минимум пять из семи.
  const limit = duration * 3 + 14;

  for (let i = 0; i < limit; i += 1) {
    if (isWorkday(day, daysOff, calendarYear)) count += 1;
    if (count >= duration) return day.format('YYYY-MM-DD');
    day = day.add(1, 'day');
  }

  return null;
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

export function ProjectGantt({
  project,
  daysOff,
  canEdit,
  href,
  deleteRedirect,
}: {
  project: Project;
  /// Куда ведёт название проекта. На самой странице проекта ссылки нет —
  /// вести ей оттуда некуда.
  href?: string;
  /// Куда уйти после удаления проекта (см. ProjectMenu). В списке не нужно:
  /// карточка просто исчезает.
  deleteRedirect?: string;
  /// Может ли текущий пользователь менять проект (см. canEdit в lib/session.ts).
  canEdit: boolean;
  /// Календарь выходных текущего года из isdayoff.ru (см. lib/dayoff.ts).
  daysOff: string;
}) {
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
    // Max, not assignment: a stage that starts early via startAfter must not
    // pull the following stages back before the chain's real end.
    elapsed = Math.max(elapsed, offset + stage.duration);
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

  const passedDays = Math.min(
    elapsedDays(project.dateStart, daysOff),
    project.duration,
  );

  const dateFinish = finishDate(project.dateStart, project.duration, daysOff);
  /// passedDays уже ограничен project.duration, поэтому остаток не уходит в минус.
  const daysLeft = project.duration - passedDays;

  const totalWork = rows.reduce((sum, r) => sum + r.stage.duration, 0);
  const totalProgress =
    rows.reduce((sum, r) => sum + r.progress * r.stage.duration, 0) / totalWork;

  return (
    <section className='rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900'>
      <div className='mb-4 flex items-baseline justify-between gap-4'>
        <h2 className='text-lg font-semibold tracking-tight'>
          {href ? (
            <Link href={href} className='hover:underline'>
              {project.name}
            </Link>
          ) : (
            project.name
          )}{' '}
          {project.responsible && `- ${project.responsible} `}
          {' - '}
          {project.dateStart}
          {dateFinish && ` - ${dateFinish}`}
          {' - '}
          {project.duration} {'р.д.'}
          {' - '}
          осталось {daysLeft} {'р.д.'}
        </h2>
        <div className='flex shrink-0 items-center gap-2'>
          <p className='text-sm text-neutral-500 dark:text-neutral-400'>
            {totalDuration} дн. (Σ {totalWork} дн.) ·{' '}
            {Math.round(totalProgress * 100)}%
          </p>
          {canEdit && (
            <ProjectMenu project={project} deleteRedirect={deleteRedirect} />
          )}
        </div>
      </div>

      <div className='/h-9 /border mb-4'>
        <div className='inset-y-0 ml-36 flex gap-px overflow-hidden rounded-md border'>
          {/* totalDuration line */}
          <div className='flex w-full gap-px'>
            {Array.from({ length: project.duration }, (_, i) => (
              <div
                key={i}
                className={`h-3 flex-1 rounded-sm ${
                  i < passedDays
                    ? 'bg-red-500'
                    : 'bg-neutral-200 dark:bg-neutral-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className='flex flex-col gap-2'>
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

            <div className='relative h-5'>
              <div
                className='absolute inset-y-0 flex gap-px overflow-hidden rounded-md'
                style={{
                  left: `${(offset / project.duration) * 100}%`,
                  width: `${(stage.duration / project.duration) * 100}%`,
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
