import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { SpecificationTable } from '@/components/SpecificationTable';
import { getFacility } from '@/lib/facilities';
import { canEditProject, getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function FacilitySpecificationPage({
  params,
}: {
  params: Promise<{ id: string; facilityId: string }>;
}) {
  const { id, facilityId } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  /// Объект ищется внутри проекта: чужой по прямой ссылке не откроется, а
  /// ответ будет тот же, что и у несуществующего.
  const facility = await getFacility(project.id, facilityId);

  if (!facility) notFound();

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='specification'
        title={`Спецификация: ${facility.name}`}
        meta={project.name}
      />
      <main className='mx-auto flex flex-col gap-4 p-6 sm:p-10'>
        <div className='flex flex-wrap gap-4 text-sm text-neutral-500 dark:text-neutral-400'>
          <Link
            href={`/projects/${project.id}/aiis`}
            className='underline-offset-4 hover:underline'
          >
            ← К АИИС
          </Link>
          <Link
            href={`/projects/${project.id}`}
            className='underline-offset-4 hover:underline'
          >
            К проекту
          </Link>
        </div>

        {/* Состояние объекта и техническое решение — контекст для
            спецификации: из чего исходим и что именно на объекте собираем.
            Пустые не показываем: название уже в заголовке. */}
        {facility.currentDescription && (
          <p className='max-w-3xl text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-300'>
            <span className='text-neutral-500 dark:text-neutral-400'>
              Сейчас:{' '}
            </span>
            {facility.currentDescription}
          </p>
        )}
        {facility.technicalSolution && (
          <p className='max-w-3xl text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-300'>
            <span className='text-neutral-500 dark:text-neutral-400'>
              Решение:{' '}
            </span>
            {facility.technicalSolution}
          </p>
        )}

        {/* Точки учёта объекта — тоже контекст: спецификацию собирают под них.
            Ведут их в списке объектов, здесь только показываем. */}
        {facility.points.length > 0 && (
          <p className='text-sm text-neutral-500 dark:text-neutral-400'>
            Точки учёта ({facility.points.length}):{' '}
            {facility.points.map((point) => point.name).join(', ')}
          </p>
        )}

        <SpecificationTable
          projectId={project.id}
          facilityId={facility.id}
          items={facility.specification}
          canEdit={canEditProject(project, user)}
        />
      </main>
    </div>
  );
}
