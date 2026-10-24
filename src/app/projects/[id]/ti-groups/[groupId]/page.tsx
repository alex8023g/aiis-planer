import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { canEditProject, getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getGroupSpecification } from '@/lib/specification';
import { getSurveyTis } from '@/lib/tis';

import { TiGroupTable } from './GroupTable';

export const dynamic = 'force-dynamic';

export default async function TiGroupPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  const [projects, projectTis, specification] = await Promise.all([
    getProjects(user),
    getSurveyTis(id),
    getGroupSpecification(id, groupId),
  ]);
  const tis = projectTis.filter((ti) => ti.group?.id === groupId);

  if (tis.length === 0) notFound();

  const groupIds = Array.from(
    new Set(projectTis.flatMap((ti) => (ti.group ? [ti.group.id] : []))),
  );
  const groupIndex = groupIds.indexOf(groupId);
  const previousGroupId = groupIds[groupIndex - 1];
  const nextGroupId = groupIds[groupIndex + 1];
  const technicalSolution = tis[0].group?.technicalSolution ?? null;

  return (
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis4'
        title={
          <>
            <AiisProjectSwitcher
              currentProjectId={project.id}
              section='aiis4'
              projects={projects.map(({ id, name }) => ({ id, name }))}
            />
            <span>Тех. решение</span>
          </>
        }
        meta={`ТИ в группе: ${tis.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 overflow-auto p-2 sm:p-4'>
        <TiGroupTable
          projectId={id}
          tis={tis}
          canEdit={canEditProject(project, user)}
          previousGroupId={previousGroupId}
          nextGroupId={nextGroupId}
        />
        <section className='shrink-0 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-2 text-sm font-semibold'>Техническое решение</h2>
          {technicalSolution ? (
            <p className='text-sm whitespace-pre-wrap'>{technicalSolution}</p>
          ) : (
            <p className='text-sm text-neutral-500'>Не указано</p>
          )}
        </section>
        <section className='w-fit max-w-full shrink-0 overflow-x-auto rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900'>
          <h2 className='mb-2 text-sm font-semibold'>Спецификация</h2>
          {specification.length === 0 ? (
            <p className='text-sm text-neutral-500'>Не указана</p>
          ) : (
            <table className='border-collapse text-sm'>
              <thead className='bg-neutral-100 dark:bg-neutral-800'>
                <tr>
                  <th className='w-16 px-2 py-1 text-center font-medium'>
                    № п/п
                  </th>
                  <th className='px-2 py-1 text-left font-medium'>
                    Наименование оборудования
                  </th>
                  <th className='px-2 py-1 text-left font-medium'>Марка</th>
                  <th className='w-24 px-2 py-1 text-center font-medium'>
                    Кол-во
                  </th>
                  <th className='w-24 px-2 py-1 text-center font-medium'>
                    Ед. изм.
                  </th>
                </tr>
              </thead>
              <tbody>
                {specification.map((item, index) => (
                  <tr
                    key={item.id}
                    className='border-t border-neutral-200 dark:border-neutral-800'
                  >
                    <td className='px-2 py-1 text-center'>{index + 1}</td>
                    <td className='px-2 py-1'>{item.name}</td>
                    <td className='px-2 py-1'>{item.model ?? '—'}</td>
                    <td className='px-2 py-1 text-center'>{item.quantity}</td>
                    <td className='px-2 py-1 text-center'>{item.unit}</td>
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
