import Link from 'next/link';

import { AddProjectDialog } from '@/components/AddProjectDialog';
import { Header } from '@/components/Header';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import {
  projectSorts,
  ProjectsTable,
  sortProjects,
} from '@/components/ProjectsTable';
import { getDaysOff } from '@/lib/dayoff';
import { canEditProject, getProjects } from '@/lib/projects';
import { canEdit, requireUser } from '@/lib/session';
import { TaskStatus, UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/// Вид списка: полный — карточки со шкалой дней и этапами, краткий —
/// таблица, строка на проект.
const views = [
  { key: undefined, label: 'Полный' },
  { key: 'short', label: 'Краткий' },
] as const;

export default async function AiisProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string }>;
}) {
  const params = await searchParams;
  /// Вид и сортировка — в адресе: переживают перезагрузку, и ссылку можно
  /// сохранить. Чужое значение — полный вид и порядок как есть.
  const compact = params.view === 'short';
  const sort = projectSorts.find((item) => item === params.sort);
  const user = await requireUser();
  const projects = await getProjects(user);
  const isDaysOff = await getDaysOff();
  /// Пустой список проектов у pending выглядел бы так, будто проектов нет, —
  /// на деле ему просто ещё не выдали роль.
  const waiting = user.role === UserRole.Pending;
  return (
    <div className='flex h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='projects'
        /// pending проектов не видит вовсе — «Проектов: 0» сказало бы ему
        /// неправду, будто их нет.
        meta={waiting ? undefined : `( ${projects.length} )`}
        /// Создавать проекты может admin и editor; viewer'у и pending — нечего.
        action={
          !waiting && (
            <>
              <div className='flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800'>
                {views.map((view) => {
                  const active = (view.key === 'short') === compact;

                  return (
                    <Link
                      key={view.label}
                      href={
                        view.key ? `/projects?view=${view.key}` : '/projects'
                      }
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-sm transition-colors',
                        active
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                          : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
                      )}
                    >
                      {view.label}
                    </Link>
                  );
                })}
              </div>
              {canEdit(user) && <AddProjectDialog />}
            </>
          )
        }
      />
      <main className='mx-auto min-h-0 w-full flex-1 overflow-auto'>
        {waiting ? (
          <p className='text-sm text-neutral-500 dark:text-neutral-400'>
            Доступ пока не подтверждён. Попросите администратора выдать вам роль
            — до этого проекты не видны.
          </p>
        ) : compact ? (
          <ProjectsTable
            projects={sortProjects(projects, sort, isDaysOff)}
            sort={sort}
            daysOff={isDaysOff}
            canEdit={(project) => canEditProject(project, user)}
          />
        ) : (
          <>
            <div className='flex flex-col gap-6'>
              {projects.map((project) => (
                <ProjectGantt
                  key={project.id}
                  project={project}
                  daysOff={isDaysOff}
                  canEdit={canEditProject(project, user)}
                  href={`/projects/${project.id}`}
                />
              ))}
            </div>

            <div className='mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500 dark:text-neutral-400'>
              {Object.values(TaskStatus).map((status) => (
                <span key={status} className='flex items-center gap-2'>
                  <span
                    className={`h-3 w-3 rounded-sm ${statusStyles[status].dot}`}
                  />
                  {statusStyles[status].label}
                </span>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
