import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { SurveyTable } from '@/components/SurveyTable';
import { getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';

import { surveyColumns, surveyRows } from './survey-data';

export const dynamic = 'force-dynamic';

export default async function Aiis2Page({
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

  return (
    /// Страница занимает ровно экран: прокручивается таблица, а не документ,
    /// иначе её низ всегда остаётся за пределами окна.
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis2'
        title={`АИИС 2: ${project.name}`}
        meta={`строк: ${surveyRows.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 p-2 sm:p-4'>
        <SurveyTable
          columns={surveyColumns}
          rows={surveyRows}
          className='min-h-0 flex-1'
        />
      </main>
    </div>
  );
}
