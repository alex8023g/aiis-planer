import { buildPnrWorkbook } from '@/app/projects/[id]/aiis5/pnr-xlsx';
import { getTiDetails } from '@/app/projects/[id]/aiis5/get-ti-details';
import { getProject } from '@/lib/projects';
import { getCurrentUser } from '@/lib/session';
import { getSurveyTis } from '@/lib/tis';

/// ТИ проекта в Excel по форме ПНР — для кнопки «Excel ПНР» на странице aiis5.
///
/// requireUser здесь не годится: он редиректит на /login, и браузер скачал бы
/// HTML формы входа под именем .xlsx.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) return new Response('Требуется вход', { status: 401 });

  const { id } = await params;
  const project = await getProject(id, user);

  /// «Нет проекта» и «нет доступа» отвечают одинаково, как и страница.
  if (!project) return new Response('Проект не найден', { status: 404 });

  const [tis, details] = await Promise.all([
    getSurveyTis(id),
    getTiDetails(id),
  ]);
  const file = await buildPnrWorkbook(project.name, tis, details);
  const fileName = `ПНР ${project.name}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');

  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(file.length),
      /// filename* — имя русское, а голый filename= допускает только latin1.
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  });
}
