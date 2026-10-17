import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';

import { projectSchedule } from '@/components/ProjectGantt';
import { ProjectMenu } from '@/components/ProjectMenu';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';

/// Сортировка таблицы: по названию (А→Я) или по остатку срока (меньше →
/// больше); с минусом — наоборот. Без неё — порядок, в котором проекты
/// отдаёт getProjects.
export const projectSorts = ['name', '-name', 'left', '-left'] as const;

export type ProjectSort = (typeof projectSorts)[number];

type SortColumn = 'name' | 'left';

export function sortProjects(
  projects: Project[],
  sort: ProjectSort | undefined,
  daysOff: string,
): Project[] {
  if (!sort) return projects;

  const direction = sort.startsWith('-') ? -1 : 1;

  if (sort === 'left' || sort === '-left') {
    /// daysLeft считается один раз на проект, а не в каждом сравнении.
    const left = new Map(
      projects.map((project) => [
        project.id,
        projectSchedule(project, daysOff).daysLeft,
      ]),
    );

    return [...projects].sort(
      (first, second) =>
        direction * (left.get(first.id)! - left.get(second.id)!),
    );
  }

  return [...projects].sort(
    (first, second) =>
      direction *
      first.name.localeCompare(second.name, 'ru', { numeric: true }),
  );
}

/// Следующая сортировка по клику на заголовок: по возрастанию, по убыванию,
/// снова как было. Клик по другой колонке начинает с возрастания.
function nextSortHref(column: SortColumn, sort: ProjectSort | undefined) {
  const next =
    sort === column ? `-${column}` : sort === `-${column}` ? null : column;

  return next ? `/projects?view=short&sort=${next}` : '/projects?view=short';
}

/// Заголовок колонки со ссылкой-переключателем сортировки.
function SortHeader({
  column,
  sort,
  align = 'left',
  children,
}: {
  column: SortColumn;
  sort: ProjectSort | undefined;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const state =
    sort === column
      ? 'ascending'
      : sort === `-${column}`
        ? 'descending'
        : undefined;

  return (
    <th
      className={cn('px-4 py-3 font-medium', align === 'right' && 'text-right')}
      aria-sort={state}
    >
      <Link
        href={nextSortHref(column, sort)}
        className='inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-100'
      >
        {children}
        {state === 'ascending' ? (
          <ArrowUp className='size-3.5' />
        ) : state === 'descending' ? (
          <ArrowDown className='size-3.5' />
        ) : (
          <ArrowUpDown className='size-3.5 opacity-40' />
        )}
      </Link>
    </th>
  );
}

/// Краткий список проектов — таблица, строка на проект: сроки и итог без
/// шкалы дней и этапов. Цифры те же, что в шапке карточки (projectSchedule).
export function ProjectsTable({
  projects,
  sort,
  daysOff,
  canEdit,
}: {
  /// Уже отсортированные (см. sortProjects): таблица только показывает.
  projects: Project[];
  sort?: ProjectSort;
  /// Календарь выходных текущего года из isdayoff.ru (см. lib/dayoff.ts).
  daysOff: string;
  /// Может ли пользователь менять проект — у каждого проекта своё (см.
  /// canEditProject). Нет права — нет и меню в строке.
  canEdit: (project: Project) => boolean;
}) {
  const showMenu = projects.some(canEdit);

  return (
    /// relative — чтобы sr-only в шапке не растягивал страницу вширь через
    /// overflow-x-auto (как в таблице договоров).
    <div className='relative overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900'>
      <table className='w-full text-left text-sm'>
        <thead className='text-xs text-neutral-500 dark:text-neutral-400'>
          <tr className='border-b border-neutral-200 dark:border-neutral-800'>
            <SortHeader column='name' sort={sort}>
              Проект
            </SortHeader>
            <th className='px-4 py-3 font-medium'>Ответственный</th>
            <th className='px-4 py-3 font-medium'>Начало</th>
            <th className='px-4 py-3 font-medium'>Окончание</th>
            <th className='px-4 py-3 text-right font-medium'>Срок, р.д.</th>
            <SortHeader column='left' sort={sort} align='right'>
              Осталось, р.д.
            </SortHeader>
            <th className='px-4 py-3 text-right font-medium'>Этапы, дн.</th>
            <th className='px-4 py-3 text-right font-medium'>Σ работ, дн.</th>
            <th className='px-4 py-3 text-right font-medium'>Готово</th>
            {showMenu && (
              <th className='w-0 px-2 py-3'>
                <span className='sr-only'>Действия</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const {
              totalDuration,
              totalWork,
              totalProgress,
              dateFinish,
              daysLeft,
            } = projectSchedule(project, daysOff);

            return (
              <tr
                key={project.id}
                className='border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40'
              >
                <td className='px-4 py-2 font-medium'>
                  <Link
                    href={`/projects/${project.id}`}
                    className='hover:underline'
                  >
                    {project.name}
                  </Link>
                </td>
                <td className='px-4 py-2 whitespace-nowrap'>
                  {project.responsible}
                </td>
                <td className='px-4 py-2 whitespace-nowrap tabular-nums'>
                  {project.dateStart}
                </td>
                <td className='px-4 py-2 whitespace-nowrap tabular-nums'>
                  {dateFinish}
                </td>
                <td className='px-4 py-2 text-right tabular-nums'>
                  {project.duration}
                </td>
                <td className='px-4 py-2 text-right tabular-nums'>
                  {daysLeft}
                </td>
                <td className='px-4 py-2 text-right tabular-nums'>
                  {totalDuration}
                </td>
                <td className='px-4 py-2 text-right tabular-nums'>
                  {totalWork}
                </td>
                <td className='px-4 py-2 text-right tabular-nums'>
                  {Math.round(totalProgress * 100)}%
                </td>
                {showMenu && (
                  <td className='px-2 py-1'>
                    {canEdit(project) && <ProjectMenu project={project} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
