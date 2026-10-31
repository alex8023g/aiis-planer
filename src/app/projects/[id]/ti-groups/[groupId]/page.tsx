import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { canEditProject, getProject, getProjects } from '@/lib/projects';
import { SpecificationTable } from '@/components/SpecificationTable';
import { requireUser } from '@/lib/session';
import {
  getEquipmentCatalog,
  getEquipmentKits,
  getGroupSpecification,
} from '@/lib/specification';
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

  const [projects, projectTis, specification, catalog, kits] =
    await Promise.all([
      getProjects(user),
      getSurveyTis(id),
      getGroupSpecification(id, groupId),
      getEquipmentCatalog(),
      getEquipmentKits(),
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
        <SpecificationTable
          projectId={id}
          groupId={groupId}
          title='Спецификация'
          items={specification}
          catalog={catalog}
          kits={kits}
          canEdit={canEditProject(project, user)}
        />
      </main>
    </div>
  );
}
