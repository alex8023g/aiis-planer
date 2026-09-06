import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FacilityList } from '@/components/FacilityList';
import { Header } from '@/components/Header';
import {
  facilityTotals,
  getFacilities,
  getUnassignedPoints,
} from '@/lib/facilities';
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

  /// Та же проверка, что и на странице проекта: объекты видны всем, кому виден
  /// проект, и «нет проекта» с «нет доступа» отвечают одинаково.
  if (!project) notFound();

  const [facilities, unassigned] = await Promise.all([
    getFacilities(project.id),
    getUnassignedPoints(project.id),
  ]);
  const totals = facilityTotals(facilities);
  /// Точки без объекта тоже точки проекта: в шапке считаем их вместе с
  /// закреплёнными, иначе число разойдётся с тем, что видно на странице.
  const points = totals.points + unassigned.length;

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis'
        title={`АИИС: ${project.name}`}
        meta={
          facilities.length > 0
            ? `объектов: ${facilities.length} · точек: ${points} · позиций: ${totals.items}`
            : undefined
        }
      />
      <main className='mx-auto flex flex-col gap-4 p-6 sm:p-10'>
        <Link
          href={`/projects/${project.id}`}
          className='text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400'
        >
          ← К проекту
        </Link>

        <FacilityList
          projectId={project.id}
          facilities={facilities}
          unassigned={unassigned}
          canEdit={canEditProject(project, user)}
        />
      </main>
    </div>
  );
}
