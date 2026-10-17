import { notFound } from 'next/navigation';

import { AiisProjectSwitcher } from '@/components/AiisProjectSwitcher';
import { Header } from '@/components/Header';
import { canEditProject, getProject, getProjects } from '@/lib/projects';
import { requireUser } from '@/lib/session';
import { getSurveyTis } from '@/lib/tis';

import { SurveyView } from './SurveyView';

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

  const [projects, tis] = await Promise.all([
    getProjects(user),
    getSurveyTis(id),
  ]);

  return (
    /// Страница занимает ровно экран: прокручивается таблица, а не документ,
    /// иначе её низ всегда остаётся за пределами окна.
    <div className='flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100'>
      <Header
        user={user}
        current='aiis4'
        title={
          <AiisProjectSwitcher
            currentProjectId={project.id}
            section='aiis4'
            projects={projects.map(({ id, name }) => ({ id, name }))}
          />
        }
        meta={`строк: ${tis.length}`}
      />
      <main className='mx-auto flex min-h-0 w-full flex-1 flex-col gap-1 p-2 sm:p-4'>
        <SurveyView
          projectId={id}
          tis={tis}
          canEdit={canEditProject(project, user)}
        />
      </main>
    </div>
  );
}
