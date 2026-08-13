import { AddProjectDialog } from '@/components/AddProjectDialog';
import { ProjectGantt, statusStyles } from '@/components/ProjectGantt';
import { getProjects } from '@/lib/projects';
import { TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await getProjects();

  return (
    <div className='min-h-screen bg-neutral-50 p-6 text-neutral-900 sm:p-10 dark:bg-neutral-950 dark:text-neutral-100'>
      <main className='/max-w-4xl mx-auto'>
        <header className='mb-8'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Графики проектов
          </h1>
          <AddProjectDialog />
          <p className='mt-1 text-sm text-neutral-500 dark:text-neutral-400'>
            Проектов: {projects.length}
          </p>
        </header>

        <div className='flex flex-col gap-6'>
          {projects.map((project) => (
            <ProjectGantt key={project.id} project={project} />
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
