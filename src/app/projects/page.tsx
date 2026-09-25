import { AddProjectDialog } from '@/components/AddProjectDialog';
import { Header } from '@/components/Header';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { getDaysOff } from '@/lib/dayoff';
import { canEditProject, getProjects } from '@/lib/projects';
import { canEdit, requireUser } from '@/lib/session';
import { TaskStatus, UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AiisProjectsPage() {
  const user = await requireUser();
  const projects = await getProjects(user);
  const isDaysOff = await getDaysOff();
  /// Пустой список проектов у pending выглядел бы так, будто проектов нет, —
  /// на деле ему просто ещё не выдали роль.
  const waiting = user.role === UserRole.Pending;
  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='projects'
        /// pending проектов не видит вовсе — «Проектов: 0» сказало бы ему
        /// неправду, будто их нет.
        meta={waiting ? undefined : `( ${projects.length} )`}
        /// Создавать проекты может admin и editor; viewer'у и pending — нечего.
        action={canEdit(user) && <AddProjectDialog />}
      />
      <main className='/max-w-4xl mx-auto p-6 sm:p-10'>
        {waiting ? (
          <p className='text-sm text-neutral-500 dark:text-neutral-400'>
            Доступ пока не подтверждён. Попросите администратора выдать вам роль
            — до этого проекты не видны.
          </p>
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
