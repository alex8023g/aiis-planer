import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getMeterReaderTis } from '@/lib/tis';

import { MeterReaderTable } from './MeterReaderTable';

export const dynamic = 'force-dynamic';

/// ТИ проекта с тем, что нужно для опроса счётчика: IP модема, порт и связной
/// адрес.
export default async function MeterReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  /// Та же проверка, что и на странице проекта: страница видна всем, кому виден
  /// проект, и «нет проекта» с «нет доступа» отвечают одинаково.
  if (!project) notFound();

  const [projects, tis] = await Promise.all([
    getProjects(user),
    getMeterReaderTis(id),
  ]);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='meterreader'
        title={
          <AiisProjectSwitcher
            currentProjectId={project.id}
            projects={projects.map(({ id, name }) => ({ id, name }))}
            section='meter-reader'
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
          <MeterReaderTable projectId={project.id} tis={tis} />
        )}
      </main>
    </div>
  );
}
