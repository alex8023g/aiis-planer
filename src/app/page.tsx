import { AddProjectDialog } from '@/components/AddProjectDialog';
import { Header } from '@/components/Header';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { getDaysOff } from '@/lib/dayoff';
import { getProjects } from '@/lib/projects';
import { canEdit, requireUser } from '@/lib/session';
import { TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireUser();
  const projects = await getProjects(user);
  const isDaysOff = await getDaysOff();
  /// Что доступно viewer'у, он и увидит: кнопок, которые всё равно ответят
  /// отказом, на странице быть не должно.
  const editable = canEdit(user);
  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header user={user} />
      <main className='/max-w-4xl mx-auto p-6 sm:p-10'>
        <div className='mb-8'>
          {editable && <AddProjectDialog />}
          <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
            Проектов: {projects.length}
          </p>
        </div>

        <div className='flex flex-col gap-6'>
          {projects.map((project) => (
            <ProjectGantt
              key={project.id}
              project={project}
              daysOff={isDaysOff}
              canEdit={editable}
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
      </main>
    </div>
  );
}
