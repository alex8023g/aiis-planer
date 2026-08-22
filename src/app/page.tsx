import { AddProjectDialog } from '@/components/AddProjectDialog';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { UserMenu } from '@/components/UserMenu';
import { getDaysOff } from '@/lib/dayoff';
import { getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireUser();
  const projects = await getProjects(user.email);
  const isDaysOff = await getDaysOff();
  return (
    <div className='min-h-screen bg-neutral-50 p-6 text-neutral-900 sm:p-10 dark:bg-neutral-950 dark:text-neutral-100'>
      <main className='/max-w-4xl mx-auto'>
        <header className='mb-8'>
          <div className='flex items-start justify-between gap-4'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              Графики проектов
            </h1>
            <UserMenu user={user} />
          </div>
          <AddProjectDialog />
          <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
            Проектов: {projects.length}
          </p>
        </header>

        <div className='flex flex-col gap-6'>
          {projects.map((project) => (
            <ProjectGantt
              key={project.id}
              project={project}
              daysOff={isDaysOff}
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
