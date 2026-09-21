import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { SurveyTable } from '@/components/SurveyTable';
import { getProject } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { emptyTiRow, getTiRows, tiColumns } from '@/lib/tis';

export const dynamic = 'force-dynamic';

/// То же, что и aiis2, но таблица собирается из базы, а не из выгрузки в
/// survey-data.ts: строки — ТИ проекта, и у каждого проекта они свои.
export default async function Aiis3Page({
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

  const tiRows = await getTiRows(id);
  console.log('🚀 ~ Aiis3Page ~ tiRows:', tiRows);
  /// У проекта без ТИ показываем шапку и одну пустую строку: так видно, какие
  /// колонки таблица заполнит, когда ТИ появятся, — из одних заголовков это
  /// читается как сломанная страница.
  const rows = tiRows.length > 0 ? tiRows : [emptyTiRow()];

  return (
    /// Страница занимает ровно экран: прокручивается таблица, а не документ,
    /// иначе её низ всегда остаётся за пределами окна.
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis3'
        title={`АИИС 3: ${project.name}`}
        meta={`строк: ${tiRows.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 p-2 sm:p-4'>
        <SurveyTable
          columns={tiColumns}
          rows={rows}
          className='min-h-0 flex-1'
        />
      </main>
    </div>
  );
}
