import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { MeasurementPointTable } from '@/components/MeasurementPointTable';
import { getFacilities, getMeasurementPoints } from '@/lib/points';
import { canEditProject, getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AiisPage({
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

  const [points, facilities] = await Promise.all([
    getMeasurementPoints(project.id),
    getFacilities(project.id),
  ]);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis'
        title={`АИИС: ${project.name}`}
        meta={points.length > 0 ? `точек: ${points.length}` : undefined}
      />
      <main className='mx-auto flex flex-col gap-4 p-6 sm:p-10'>
        <Link
          href={`/projects/${project.id}`}
          className='text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400'
        >
          ← К проекту
        </Link>

        <MeasurementPointTable
          projectId={project.id}
          rows={points}
          facilities={facilities}
          canEdit={canEditProject(project, user)}
        />
      </main>
    </div>
  );
}
