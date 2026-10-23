import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { canEditProject, getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getSurveyTis } from '@/lib/tis';

import { TiGroupTable } from './GroupTable';

export const dynamic = 'force-dynamic';

const specification = [
  {
    name: 'Шкаф учета с монтажной платой',
    model: 'ЩМП 02 IP54 250x300x155мм',
    quantity: 5,
    unit: 'шт',
  },
  { name: 'GPRS терминал', model: 'iRZ ATM42.B', quantity: 5, unit: 'шт' },
  { name: 'Антенна', model: 'Antey 906 13,5dB SMA', quantity: 5, unit: 'шт' },
  {
    name: 'Автомат 2х полюсный 2P C6A',
    model: 'DEKraft',
    quantity: 5,
    unit: 'шт',
  },
  {
    name: 'DIN-рейка 07-03-009 7,5x35x250мм',
    model: '-',
    quantity: 5,
    unit: 'шт',
  },
  {
    name: 'Кабель питания',
    model: 'ВВГнг 2x1.5',
    quantity: 150,
    unit: 'м',
  },
  {
    name: 'Интерфейсный кабель',
    model: 'F/UTP 2x2x0,52 мм',
    quantity: 150,
    unit: 'м',
  },
  {
    name: 'кабель заземления',
    model: 'ПуГВнг(А)LS желто-зеленый 1x4',
    quantity: 15,
    unit: 'м',
  },
  {
    name: 'Труба гофрированная ПВХ 20 мм',
    model: 'ПВХ 20 мм',
    quantity: 240,
    unit: 'м',
  },
  {
    name: 'Расходные материалы',
    model: 'саморезы, клипсы, стяжки, хомуты и т.д.',
    quantity: 1,
    unit: 'комп.',
  },
];

export default async function TiGroupPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const user = await requireUser();
  const project = await getProject(id, user);

  if (!project) notFound();

  const [projects, projectTis] = await Promise.all([
    getProjects(user),
    getSurveyTis(id),
  ]);
  const tis = projectTis.filter((ti) => ti.group?.id === groupId);

  if (tis.length === 0) notFound();

  const groupIds = Array.from(
    new Set(
      projectTis.flatMap((ti) => (ti.group ? [ti.group.id] : [])),
    ),
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
                  key={item.name}
                  className='border-t border-neutral-200 dark:border-neutral-800'
                >
                  <td className='px-2 py-1 text-center'>{index + 1}</td>
                  <td className='px-2 py-1'>{item.name}</td>
                  <td className='px-2 py-1'>{item.model}</td>
                  <td className='px-2 py-1 text-center'>{item.quantity}</td>
                  <td className='px-2 py-1 text-center'>{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
