import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { getProject, getProjects } from '@/lib/projects';
import { canEdit, requireUser } from '@/lib/session';
import { getProjectModems } from '@/lib/tis';

import { ModemsView } from './ModemsView';

export const dynamic = 'force-dynamic';

/// Модемы и SIM-карты проекта: и привязанные к группам ТИ, и заведённые
/// заранее.
export default async function ModemSimcardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  const [projects, modems] = await Promise.all([
    getProjects(user),
    getProjectModems(id),
  ]);

  return (
    /// Страница занимает ровно экран: прокручивается таблица, а не документ,
    /// поэтому шапка и панель управления всегда на виду.
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='modemsimcard'
        title={
          <AiisProjectSwitcher
            currentProjectId={project.id}
            projects={projects.map(({ id, name }) => ({ id, name }))}
            section='modem-simcard'
          />
        }
        meta={`модемов: ${modems.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 p-2 sm:p-2'>
        <ModemsView
          projectId={project.id}
          modems={modems}
          canEdit={canEdit(user)}
        />
      </main>
    </div>
  );
}
