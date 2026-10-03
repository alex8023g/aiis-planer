import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { SurveyTable } from '@/components/SurveyTable';
import { getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { emptyTiRow, getSurveyTiRows, surveyTiColumns } from '@/lib/tis';

export const dynamic = 'force-dynamic';

/// Таблица опроса тех. решений: строки — ТИ проекта из базы, колонки — как в
/// файле опроса (см. surveyTiColumns).
export default async function Aiis4Page({
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

  const tiRows = await getSurveyTiRows(id);
  /// У проекта без ТИ — шапка и одна пустая строка, как на aiis3.
  const rows = tiRows.length > 0 ? tiRows : [emptyTiRow(surveyTiColumns)];

  return (
    /// Страница занимает ровно экран: прокручивается таблица, а не документ,
    /// иначе её низ всегда остаётся за пределами окна.
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis4'
        title={`АИИС 4: ${project.name}`}
        meta={`строк: ${tiRows.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 p-2 sm:p-4'>
        <SurveyTable
          columns={surveyTiColumns}
          rows={rows}
          className='min-h-0 flex-1'
        />
      </main>
    </div>
  );
}
