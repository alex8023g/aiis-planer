import { BUCKET, minio } from '@/lib/minio';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

/// Файлы отдаёт приложение, а не MinIO напрямую: тогда бакет не надо выставлять
/// наружу и настраивать на нём CORS, а проверка сессии остаётся в одном месте.
///
/// requireUser здесь не годится: он редиректит на /login, а это осмысленно для
/// страницы, но не для ссылки на файл — браузер скачал бы HTML формы входа под
/// именем документа.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response('Требуется вход', { status: 401 });
  }

  const { id } = await params;

  const file = await prisma.contractFile.findUnique({
    where: { id },
    select: { objectKey: true, fileName: true, contentType: true, size: true },
  });

  if (!file) {
    return new Response('Файл не найден', { status: 404 });
  }

  const stream = await minio.getObject(BUCKET, file.objectKey);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      /// filename* с кодировкой UTF-8: имена договоров русские, а голый
      /// filename= по RFC 6266 допускает только latin1.
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        file.fileName,
      )}`,
    },
  });
}
