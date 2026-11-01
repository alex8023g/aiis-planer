import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getPnrTis } from '@/lib/tis';

import { PnrTable } from './PnrTable';

export const dynamic = 'force-dynamic';

/// Пусконаладочные работы проекта: по каждой ТИ — счётчик, что стоит сейчас,
/// и модем, через который его опрашивают.
export default async function PnrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  const [projects, tis] = await Promise.all([getProjects(user), getPnrTis(id)]);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='pnr'
        title={
          <AiisProjectSwitcher
            currentProjectId={project.id}
            projects={projects.map(({ id, name }) => ({ id, name }))}
            section='pnr'
          />
        }
        meta={`ТИ: ${tis.length}`}
      />
      <main className='mx-auto p-6 sm:p-10'>
        {tis.length === 0 ? (
          <p className='text-sm text-neutral-500 dark:text-neutral-400'>
            В проекте пока нет ТИ.
          </p>
        ) : (
          <PnrTable tis={tis} />
        )}
      </main>
    </div>
  );
}
