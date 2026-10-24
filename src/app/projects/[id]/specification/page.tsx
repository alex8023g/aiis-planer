import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { SpecificationTable } from '@/components/SpecificationTable';
import { canEditProject, getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import {
  getEquipmentCatalog,
  getEquipmentKits,
  getProjectSpecification,
  getSpecificationTotals,
} from '@/lib/specification';

export const dynamic = 'force-dynamic';

/// Спецификация проекта: общие позиции (без группы ТИ) и итог — все позиции
/// проекта, сложенные по виду и марке. Позиции групп правят на страницах
/// групп, здесь они только складываются.
export default async function SpecificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  const [projects, items, totals, catalog, kits] = await Promise.all([
    getProjects(user),
    getProjectSpecification(id),
    getSpecificationTotals(id),
    getEquipmentCatalog(),
    getEquipmentKits(),
  ]);

  return (
    <div className='min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='specification'
        title={
          <AiisProjectSwitcher
            currentProjectId={project.id}
            projects={projects.map(({ id, name }) => ({ id, name }))}
            section='specification'
          />
        }
        meta={`Позиций в итоге: ${totals.length}`}
      />
      <main className='mx-auto flex flex-col gap-2 p-2 sm:p-4'>
        <SpecificationTable
          projectId={id}
          groupId={null}
          title='Общие позиции проекта'
          items={items}
          catalog={catalog}
          kits={kits}
          canEdit={canEditProject(project, user)}
        />
        <section className='w-fit max-w-full overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-2 text-sm font-semibold'>Итоговая спецификация</h2>
          {totals.length === 0 ? (
            <p className='text-sm text-neutral-500'>Позиций пока нет</p>
          ) : (
            <table className='border-collapse text-sm'>
              <thead className='bg-neutral-100 dark:bg-neutral-800'>
                <tr>
                  <th className='w-16 px-2 py-1 text-center font-medium'>№</th>
                  <th className='px-2 py-1 text-left font-medium'>
                    Наименование
                  </th>
                  <th className='px-2 py-1 text-left font-medium'>
                    Марка / характеристика
                  </th>
                  <th className='w-28 px-2 py-1 text-center font-medium'>
                    Итого кол-во
                  </th>
                  <th className='w-24 px-2 py-1 text-center font-medium'>
                    Ед. изм.
                  </th>
                </tr>
              </thead>
              <tbody>
                {totals.map((total, index) => (
                  <tr
                    key={`${total.kind}:${total.model ?? ''}`}
                    className='border-t border-neutral-200 dark:border-neutral-800'
                  >
                    <td className='px-2 py-1 text-center'>{index + 1}</td>
                    <td className='px-2 py-1'>{total.kind}</td>
                    <td className='px-2 py-1'>{total.model ?? '—'}</td>
                    <td className='px-2 py-1 text-center'>
                      {total.quantity}
                      {/* Без кол-ва позиция в сумму не попала: итог неполный,
                          и это должно быть видно, а не тихо занижено. */}
                      {total.missing > 0 && (
                        <span
                          className='ml-1 text-xs text-amber-600'
                          title={`Без кол-ва: ${total.missing}`}
                        >
                          + ?
                        </span>
                      )}
                    </td>
                    <td className='px-2 py-1 text-center'>{total.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
